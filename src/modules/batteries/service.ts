import type { z } from "zod";
import { prisma, type Tx } from "@/lib/db";
import type { Actor, SessionUser } from "@/lib/auth";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { buildPassportId } from "@/lib/passport-id";
import { saveFile } from "@/lib/storage";
import type {
  batteryModelSchema,
  createBatterySchema,
  decommissionSchema,
  interventionSchema,
  linkVehicleSchema,
  secondLifeSchema,
  vehicleSchema,
} from "@/lib/validation";
import { appendAudit } from "@/modules/audit/service";
import { createWithEvent, recordEvent } from "@/modules/events/lifecycle";
import { vehicleRegistry } from "@/adapters/vehicle-registry";

type ActorU = Actor & { user: SessionUser };

// ---------- Modelos ----------

export async function createModel(
  actor: ActorU,
  input: z.infer<typeof batteryModelSchema>,
  dismantlingFile?: File,
) {
  const org = actor.user.organization;
  if (!org.operatorCode) throw forbidden("Su organización no tiene código de operador responsable");
  const dismantlingFileUrl = dismantlingFile ? await saveFile(dismantlingFile, "desmontaje") : null;
  return prisma.$transaction(async (tx) => {
    const model = await tx.batteryModel.create({
      data: { ...input, operatorId: org.id, dismantlingFileUrl },
    });
    await appendAudit(tx, actor, {
      action: "MODELO_ALTA",
      entity: "BatteryModel",
      entityId: model.id,
      details: { name: model.name, brand: model.brand },
    });
    return model;
  });
}

// ---------- Alta ----------

async function nextPassportId(tx: Tx, operatorId: string) {
  const org = await tx.organization.update({
    where: { id: operatorId },
    data: { lastSerial: { increment: 1 } },
  });
  if (!org.operatorCode) throw badRequest("El operador no tiene código asignado");
  return buildPassportId(org.operatorCode, org.lastSerial);
}

export async function createBattery(actor: ActorU, input: z.infer<typeof createBatterySchema>) {
  return prisma.$transaction(async (tx) => createBatteryTx(tx, actor, input));
}

export async function createBatteryTx(tx: Tx, actor: ActorU, input: z.infer<typeof createBatterySchema>) {
  const model = await tx.batteryModel.findUnique({ where: { id: input.modelId } });
  if (!model) throw badRequest("El modelo no existe");
  if (actor.user.role === "OPERADOR" && model.operatorId !== actor.user.organizationId)
    throw forbidden("Solo puede dar de alta baterías de sus propios modelos");
  const dup = await tx.battery.findUnique({
    where: { modelId_serialNumber: { modelId: model.id, serialNumber: input.serialNumber } },
  });
  if (dup) throw conflict(`El número de serie ${input.serialNumber} ya está registrado para este modelo`, "DUPLICATE");
  if (input.manufactureDate > new Date()) throw badRequest("La fecha de fabricación no puede ser futura");

  const passportId = await nextPassportId(tx, model.operatorId);
  return createWithEvent(tx, {
    type: "ALTA",
    actor,
    battery: {
      passportId,
      modelId: model.id,
      serialNumber: input.serialNumber,
      manufactureDate: input.manufactureDate,
      operatorId: model.operatorId,
      createdByOrgId: actor.user.organizationId,
    },
    data: { serialNumber: input.serialNumber, model: model.name },
  });
}

// ---------- Venta y vínculo con vehículo ----------

async function upsertVehicle(tx: Tx, v: z.infer<typeof vehicleSchema>) {
  const existing = await tx.vehicle.findUnique({ where: { vin: v.vin } });
  if (existing) {
    if (v.domain && existing.domain && existing.domain !== v.domain)
      throw conflict("El VIN ya está registrado con otro dominio");
    if (v.domain && !existing.domain)
      return tx.vehicle.update({ where: { id: existing.id }, data: { domain: v.domain } });
    return existing;
  }
  if (v.domain) {
    const byDomain = await tx.vehicle.findUnique({ where: { domain: v.domain } });
    if (byDomain) throw conflict("El dominio ya está asociado a otro VIN");
  }
  return tx.vehicle.create({ data: v });
}

export async function linkVehicle(actor: ActorU, batteryId: string, input: z.infer<typeof linkVehicleSchema>) {
  const { saleDate, ...vehicleInput } = input;
  // Consulta (simulada en la beta) al registro automotor.
  const reg = await vehicleRegistry.lookup(vehicleInput.vin, vehicleInput.domain);
  if (!reg.found) throw badRequest("El vehículo no figura en el registro automotor");

  return prisma.$transaction(async (tx) => {
    const vehicle = await upsertVehicle(tx, vehicleInput);
    const active = await tx.batteryVehicleLink.findFirst({ where: { batteryId, to: null } });
    const otherBattery = await tx.batteryVehicleLink.findFirst({
      where: { vehicleId: vehicle.id, to: null, NOT: { batteryId } },
    });
    const now = new Date();
    const type = active ? "VINCULO_VEHICULO" : "VENTA";
    if (active?.vehicleId === vehicle.id) throw conflict("La batería ya está vinculada a ese vehículo");

    const result = await recordEvent(tx, {
      batteryId,
      type,
      actor,
      data: {
        vin: vehicle.vin,
        domain: vehicle.domain,
        saleDate: (saleDate ?? now).toISOString(),
        replacedBatteryLink: otherBattery?.id ?? null,
      },
      update: type === "VENTA" ? { dealerOrgId: actor.user.organizationId } : {},
    });
    if (active) await tx.batteryVehicleLink.update({ where: { id: active.id }, data: { to: now } });
    if (otherBattery) await tx.batteryVehicleLink.update({ where: { id: otherBattery.id }, data: { to: now } });
    await tx.batteryVehicleLink.create({
      data: { batteryId, vehicleId: vehicle.id, from: saleDate ?? now },
    });
    return { ...result, vehicle };
  });
}

// ---------- Taller ----------

export async function startIntervention(actor: ActorU, batteryId: string, input: z.infer<typeof interventionSchema>) {
  return prisma.$transaction((tx) =>
    recordEvent(tx, {
      batteryId,
      type: "INTERVENCION",
      actor,
      data: { reason: input.reason, workshop: actor.user.organization.name },
      update: { serviceOrgId: actor.user.organizationId },
    }),
  );
}

export async function closeIntervention(actor: ActorU, batteryId: string) {
  return prisma.$transaction((tx) =>
    recordEvent(tx, { batteryId, type: "CIERRE_INTERVENCION", actor, update: { serviceOrgId: null } }),
  );
}

export async function requestSecondLife(actor: ActorU, batteryId: string, input: z.infer<typeof secondLifeSchema>) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.battery.findUnique({ where: { id: batteryId } });
    if (!original) throw notFound("Batería no encontrada");
    const operatorId = input.newOperatorId || original.operatorId;
    const op = await tx.organization.findUnique({ where: { id: operatorId } });
    if (!op?.operatorCode) throw badRequest("El nuevo operador responsable no es válido");

    const { battery } = await recordEvent(tx, {
      batteryId,
      type: "SEGUNDA_VIDA",
      actor,
      data: { application: input.application, newOperator: op.name },
      update: { serviceOrgId: null },
    });
    const passportId = await nextPassportId(tx, operatorId);
    const created = await createWithEvent(tx, {
      type: "ALTA_SEGUNDA_VIDA",
      actor,
      battery: {
        passportId,
        modelId: original.modelId,
        serialNumber: `${original.serialNumber}-SV`,
        manufactureDate: original.manufactureDate,
        operatorId,
        createdByOrgId: actor.user.organizationId,
        previousBatteryId: original.id,
      },
      data: { previousPassportId: original.passportId, application: input.application },
    });
    return { original: battery, secondLife: created.battery };
  });
}

export async function requestDecommission(
  actor: ActorU,
  batteryId: string,
  input: z.infer<typeof decommissionSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const cert = await tx.healthCertificate.findFirst({
      where: { batteryId, status: "VALIDADO" },
      orderBy: { reviewedAt: "desc" },
    });
    return recordEvent(tx, {
      batteryId,
      type: "SOLICITUD_BAJA",
      actor,
      data: { reason: input.reason, certificateId: cert?.id ?? null },
      update: { serviceOrgId: actor.user.organizationId },
    });
  });
}

// ---------- Consultas ----------

export async function findBatteryByPassportId(passportId: string) {
  return prisma.battery.findUnique({ where: { passportId } });
}

/** Filtro de "ver sus baterías" por rol y organización. */
export function visibleBatteriesWhere(user: SessionUser) {
  const org = user.organizationId;
  switch (user.role) {
    case "OPERADOR":
      return { operatorId: org };
    case "CONCESIONARIO":
      return { OR: [{ dealerOrgId: org }, { createdByOrgId: org }] };
    case "TALLER":
      return { OR: [{ serviceOrgId: org }, { events: { some: { organizationId: org } } }] };
    case "RECICLADOR":
      return { OR: [{ state: "BAJA_SOLICITADA" as const }, { recyclerReceipts: { some: { recyclerId: org } } }] };
    case "ENTIDAD_TECNICA":
    case "AUTORIDAD":
      return {};
  }
}
