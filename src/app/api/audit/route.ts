import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { appendAudit, verifyAuditChain } from "@/modules/audit/service";
import { verifyBatteryChain } from "@/modules/events/lifecycle";

/** Registro de auditoría con verificación de la cadena de hashes (global y, si se indica, de la batería). */
export const GET = route(async (req) => {
  const actor = await requireActor(["AUTORIDAD", "ENTIDAD_TECNICA"]);
  const url = new URL(req.url);
  const batteryId = url.searchParams.get("batteryId") || undefined;
  const take = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, 1000);

  const [chain, entries, eventChain] = await Promise.all([
    verifyAuditChain(),
    prisma.auditLog.findMany({
      where: batteryId ? { batteryId } : {},
      orderBy: { seq: "desc" },
      take,
      include: { user: { select: { name: true, role: true } } },
    }),
    batteryId ? verifyBatteryChain(batteryId) : Promise.resolve(null),
  ]);
  await prisma.$transaction((tx) =>
    appendAudit(tx, actor, { action: "LECTURA_AUDITORIA", entity: "AuditLog", batteryId: batteryId ?? null }),
  );
  return json({
    chain,
    eventChain,
    entries: entries.map((e) => ({
      seq: e.seq,
      occurredAt: e.occurredAt,
      user: e.user?.name ?? null,
      role: e.user?.role ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      batteryId: e.batteryId,
      ip: e.ip,
      details: e.details,
      prevHash: e.prevHash,
      hash: e.hash,
    })),
  });
});
