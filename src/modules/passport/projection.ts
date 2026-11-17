import type { Battery } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Actor, SessionUser } from "@/lib/auth";
import { auditRead } from "@/modules/audit/service";
import { verifyBatteryChain } from "@/modules/events/lifecycle";
import { publicPath } from "@/lib/passport-id";

export type AccessLevel = "PUBLICO" | "INTERES_LEGITIMO" | "AUTORIDAD";

export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = {
  PUBLICO: "Público",
  INTERES_LEGITIMO: "Interés legítimo",
  AUTORIDAD: "Autoridad",
};

/** Nivel de acceso del solicitante para una batería concreta (rol + pertenencia). */
export async function accessLevelFor(user: SessionUser | null, b: Battery): Promise<AccessLevel> {
  if (!user) return "PUBLICO";
  const org = user.organizationId;
  switch (user.role) {
    case "AUTORIDAD":
    case "ENTIDAD_TECNICA":
      return "AUTORIDAD";
    case "OPERADOR":
      return b.operatorId === org ? "INTERES_LEGITIMO" : "PUBLICO";
    case "CONCESIONARIO":
      return b.dealerOrgId === org || b.createdByOrgId === org ? "INTERES_LEGITIMO" : "PUBLICO";
    case "TALLER":
      return b.serviceOrgId === org ? "INTERES_LEGITIMO" : "PUBLICO";
    case "RECICLADOR": {
      if (b.state === "BAJA_SOLICITADA") return "INTERES_LEGITIMO";
      const r = await prisma.recyclerReceipt.count({ where: { batteryId: b.id, recyclerId: org } });
      return r > 0 ? "INTERES_LEGITIMO" : "PUBLICO";
    }
  }
}

/** Dirección que va codificada en el QR: {PUBLIC_BASE_URL}/01/{GTIN}/21/{serie} (GS1 Digital Link). */
export function publicUrl(passportId: string) {
  const base = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${publicPath(passportId) ?? ""}`;
}

/**
 * Proyección de campos por nivel de acceso. Se construye en el servidor agregando bloques
 * según el nivel, de modo que un nivel inferior nunca recibe campos de uno superior.
 */
export async function getPassportDocument(passportId: string, actor: Actor, opts: { audit?: boolean } = {}) {
  const b = await prisma.battery.findUnique({
    where: { passportId },
    include: {
      model: true,
      operator: true,
      previousBattery: { select: { passportId: true } },
      nextBattery: { select: { passportId: true } },
    },
  });
  if (!b) return null;
  const level = await accessLevelFor(actor.user, b);

  const lastValid = await prisma.healthCertificate.findFirst({
    where: { batteryId: b.id, status: "VALIDADO" },
    orderBy: { reviewedAt: "desc" },
  });

  const doc: Record<string, unknown> = {
    passportId: b.passportId,
    gtin: b.gtin,
    accessLevel: level,
    url: publicUrl(b.passportId),
    state: b.state,
    manufacturer: b.operator.name,
    model: {
      brand: b.model.brand,
      name: b.model.name,
      chemistry: b.model.chemistry,
      nominalCapacityKwh: b.model.nominalCapacityKwh,
      nominalVoltageV: b.model.nominalVoltageV,
      massKg: b.model.massKg,
      carbonFootprintKgCo2e: b.model.carbonFootprintKgCo2e,
    },
    manufactureYear: b.manufactureDate.getUTCFullYear(),
    lastHealth: lastValid
      ? {
          sohPercent: lastValid.sohPercent,
          certifiedAt: lastValid.reviewedAt?.toISOString(),
          validUntil: lastValid.validUntil?.toISOString(),
        }
      : null,
    previousPassportId: b.previousBattery?.passportId ?? null,
    nextPassportId: b.nextBattery?.passportId ?? null,
  };

  if (level === "INTERES_LEGITIMO" || level === "AUTORIDAD") {
    const [link, certs] = await Promise.all([
      prisma.batteryVehicleLink.findFirst({
        where: { batteryId: b.id, to: null },
        include: { vehicle: true },
      }),
      prisma.healthCertificate.findMany({
        where: { batteryId: b.id, ...(level === "AUTORIDAD" ? {} : { status: "VALIDADO" as const }) },
        include: { workshop: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    Object.assign(doc, {
      id: b.id,
      serialNumber: b.serialNumber,
      manufactureDate: b.manufactureDate.toISOString(),
      dismantlingInstructionsUrl: b.model.dismantlingFileUrl,
      vehicle: link
        ? {
            vin: link.vehicle.vin,
            domain: link.vehicle.domain,
            brand: link.vehicle.brand,
            model: link.vehicle.model,
            year: link.vehicle.year,
            since: link.from.toISOString(),
          }
        : null,
      healthCertificates: certs.map((c) => ({
        id: c.id,
        workshop: c.workshop.name,
        status: c.status,
        sohPercent: c.sohPercent,
        measuredCapacityKwh: c.measuredCapacityKwh,
        internalResistanceMOhm: c.internalResistanceMOhm,
        testMethod: c.testMethod,
        reusable: c.reusable,
        fileUrl: c.fileUrl,
        createdAt: c.createdAt.toISOString(),
        reviewedAt: c.reviewedAt?.toISOString() ?? null,
        validUntil: c.validUntil?.toISOString() ?? null,
        rejectionReason: c.rejectionReason,
      })),
    });
  }

  if (level === "AUTORIDAD") {
    const [links, events, receipts, chain] = await Promise.all([
      prisma.batteryVehicleLink.findMany({
        where: { batteryId: b.id },
        include: { vehicle: true },
        orderBy: { from: "asc" },
      }),
      prisma.batteryEvent.findMany({
        where: { batteryId: b.id },
        include: { organization: { select: { name: true } }, actor: { select: { name: true } } },
        orderBy: { seq: "asc" },
      }),
      prisma.recyclerReceipt.findMany({
        where: { batteryId: b.id },
        include: { recycler: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      verifyBatteryChain(b.id),
    ]);
    Object.assign(doc, {
      vehicleHistory: links.map((l) => ({
        vin: l.vehicle.vin,
        domain: l.vehicle.domain,
        brand: l.vehicle.brand,
        model: l.vehicle.model,
        from: l.from.toISOString(),
        to: l.to?.toISOString() ?? null,
      })),
      events: events.map((e) => ({
        seq: e.seq,
        type: e.type,
        occurredAt: e.occurredAt.toISOString(),
        organization: e.organization?.name ?? null,
        actor: e.actor?.name ?? null,
        data: e.data,
        hash: e.hash,
      })),
      recyclerReceipts: receipts.map((r) => ({
        id: r.id,
        recycler: r.recycler.name,
        receivedAt: r.receivedAt.toISOString(),
        receivedMassKg: r.receivedMassKg,
        manifestNumber: r.manifestNumber,
        status: r.status,
        fileUrl: r.fileUrl,
        rejectionReason: r.rejectionReason,
      })),
      eventChain: chain,
      auditUrl: `/api/audit?batteryId=${b.id}`,
    });
  }

  if (level !== "PUBLICO" && opts.audit !== false) {
    await auditRead(actor, {
      action: `LECTURA_${level}`,
      entity: "Battery",
      entityId: b.id,
      batteryId: b.id,
      details: { passportId: b.passportId },
    });
  }
  return { level, battery: b, doc };
}
