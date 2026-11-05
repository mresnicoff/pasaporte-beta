import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { chainHash, GENESIS_HASH } from "@/lib/hash";
import type { Actor } from "@/lib/auth";

const AUDIT_LOCK_KEY = 74_201; // clave de advisory lock para serializar la cadena global

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | null;
  batteryId?: string | null;
  details?: Record<string, unknown>;
};

function payload(row: {
  seq: number;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  batteryId: string | null;
  occurredAt: Date;
  ip: string | null;
  details: unknown;
}) {
  return {
    seq: row.seq,
    userId: row.userId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    batteryId: row.batteryId,
    occurredAt: row.occurredAt.toISOString(),
    ip: row.ip,
    details: row.details,
  };
}

/** Agrega una fila a la cadena de auditoría. Debe llamarse dentro de la transacción de la escritura. */
export async function appendAudit(tx: Tx, actor: Actor, entry: AuditEntry) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
  const last = await tx.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, hash: true } });
  const row = {
    seq: (last?.seq ?? 0) + 1,
    userId: actor.user?.id ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    batteryId: entry.batteryId ?? null,
    occurredAt: new Date(),
    ip: actor.ip,
    details: JSON.parse(JSON.stringify(entry.details ?? {})),
  };
  const prevHash = last?.hash ?? GENESIS_HASH;
  const hash = chainHash(prevHash, payload(row));
  return tx.auditLog.create({
    data: { ...row, details: row.details as Prisma.InputJsonValue, prevHash, hash },
  });
}

/** Registro de lecturas sensibles (nivel autoridad o interés legítimo). */
export async function auditRead(actor: Actor, entry: AuditEntry) {
  await prisma.$transaction((tx) => appendAudit(tx, actor, entry));
}

export type ChainCheck = { ok: boolean; checked: number; brokenAtSeq?: number; reason?: string };

/** Recorre toda la cadena recalculando cada hash. Cualquier alteración manual rompe la verificación. */
export async function verifyAuditChain(): Promise<ChainCheck> {
  let prev = GENESIS_HASH;
  let checked = 0;
  let cursor: number | undefined;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      orderBy: { seq: "asc" },
      take: 1000,
      ...(cursor ? { where: { seq: { gt: cursor } } } : {}),
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.seq !== checked + 1) return { ok: false, checked, brokenAtSeq: r.seq, reason: "Falta una fila en la secuencia" };
      if (r.prevHash !== prev) return { ok: false, checked, brokenAtSeq: r.seq, reason: "El hash previo no coincide" };
      if (chainHash(prev, payload(r)) !== r.hash)
        return { ok: false, checked, brokenAtSeq: r.seq, reason: "El contenido de la fila fue alterado" };
      prev = r.hash;
      checked++;
      cursor = r.seq;
    }
  }
  return { ok: true, checked };
}
