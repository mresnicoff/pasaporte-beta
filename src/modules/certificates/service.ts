import type { z } from "zod";
import { prisma } from "@/lib/db";
import type { Actor, SessionUser } from "@/lib/auth";
import { conflict, notFound } from "@/lib/errors";
import { saveFile } from "@/lib/storage";
import type { healthCertificateSchema, recyclerReceiptSchema, reviewSchema } from "@/lib/validation";
import { recordEvent } from "@/modules/events/lifecycle";
import { vehicleRegistry } from "@/adapters/vehicle-registry";

type ActorU = Actor & { user: SessionUser };

/** Vigencia del certificado de estado de salud validado. */
export const CERTIFICATE_VALIDITY_DAYS = 365;

// ---------- Certificado de estado de salud ----------

export async function uploadHealthCertificate(
  actor: ActorU,
  batteryId: string,
  input: z.infer<typeof healthCertificateSchema>,
  file?: File,
) {
  const fileUrl = file ? await saveFile(file, "ensayos") : null;
  return prisma.$transaction(async (tx) => {
    const pending = await tx.healthCertificate.count({ where: { batteryId, status: "PENDIENTE" } });
    if (pending) throw conflict("Ya hay un ensayo pendiente de validación para esta batería");
    const cert = await tx.healthCertificate.create({
      data: { ...input, batteryId, workshopId: actor.user.organizationId, fileUrl },
    });
    await recordEvent(tx, {
      batteryId,
      type: "CERTIFICADO_CARGADO",
      actor,
      data: { certificateId: cert.id, sohPercent: input.sohPercent, reusable: input.reusable },
    });
    return cert;
  });
}

export async function reviewHealthCertificate(
  actor: ActorU,
  certificateId: string,
  input: z.infer<typeof reviewSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const cert = await tx.healthCertificate.findUnique({ where: { id: certificateId } });
    if (!cert) throw notFound("Certificado no encontrado");
    if (cert.status !== "PENDIENTE") throw conflict("El certificado ya fue revisado");
    const now = new Date();
    const validUntil = new Date(now.getTime() + CERTIFICATE_VALIDITY_DAYS * 86_400_000);
    const updated = await tx.healthCertificate.update({
      where: { id: cert.id },
      data: input.approve
        ? { status: "VALIDADO", validatedById: actor.user.id, reviewedAt: now, validUntil }
        : { status: "RECHAZADO", validatedById: actor.user.id, reviewedAt: now, rejectionReason: input.reason },
    });
    await recordEvent(tx, {
      batteryId: cert.batteryId,
      type: input.approve ? "CERTIFICADO_VALIDADO" : "CERTIFICADO_RECHAZADO",
      actor,
      data: input.approve
        ? { certificateId: cert.id, sohPercent: cert.sohPercent, validUntil: validUntil.toISOString() }
        : { certificateId: cert.id, reason: input.reason },
    });
    return updated;
  });
}

// ---------- Constancia del reciclador ----------

export async function createRecyclerReceipt(
  actor: ActorU,
  batteryId: string,
  input: z.infer<typeof recyclerReceiptSchema>,
  file?: File,
) {
  const fileUrl = file ? await saveFile(file, "constancias") : null;
  return prisma.$transaction(async (tx) => {
    // El evento se registra primero: valida estado, rol y que no haya otra constancia.
    await recordEvent(tx, {
      batteryId,
      type: "CONSTANCIA_RECEPCION",
      actor,
      data: { manifestNumber: input.manifestNumber, receivedMassKg: input.receivedMassKg },
    });
    return tx.recyclerReceipt.create({
      data: { ...input, batteryId, recyclerId: actor.user.organizationId, fileUrl },
    });
  });
}

export async function reviewRecyclerReceipt(actor: ActorU, receiptId: string, input: z.infer<typeof reviewSchema>) {
  const result = await prisma.$transaction(async (tx) => {
    const receipt = await tx.recyclerReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) throw notFound("Constancia no encontrada");
    if (receipt.status !== "PENDIENTE") throw conflict("La constancia ya fue revisada");
    const now = new Date();
    const updated = await tx.recyclerReceipt.update({
      where: { id: receipt.id },
      data: input.approve
        ? { status: "VALIDADO", validatedById: actor.user.id, reviewedAt: now }
        : { status: "RECHAZADO", validatedById: actor.user.id, reviewedAt: now, rejectionReason: input.reason },
    });
    const { battery } = await recordEvent(tx, {
      batteryId: receipt.batteryId,
      type: input.approve ? "RECICLADO" : "CONSTANCIA_RECHAZADA",
      actor,
      data: input.approve
        ? { receiptId: receipt.id, manifestNumber: receipt.manifestNumber }
        : { receiptId: receipt.id, reason: input.reason },
      update: input.approve ? { serviceOrgId: null } : {},
    });
    if (input.approve) {
      await tx.batteryVehicleLink.updateMany({ where: { batteryId: battery.id, to: null }, data: { to: now } });
    }
    return { receipt: updated, battery };
  });
  if (result.battery.state === "RECICLADA") {
    // Aviso (simulado) al registro automotor: habilita la baja registral del vehículo.
    await vehicleRegistry.notifyBatteryRecycled(result.battery.passportId, null);
  }
  return result;
}
