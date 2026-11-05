import type { Battery, BatteryState, Prisma, Role } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { chainHash, GENESIS_HASH } from "@/lib/hash";
import { conflict, forbidden, invalidTransition, notFound } from "@/lib/errors";
import type { Actor, SessionUser } from "@/lib/auth";
import { appendAudit } from "@/modules/audit/service";

/**
 * Servicio único de transiciones. Ninguna ruta cambia el estado de una batería sin pasar por aquí.
 * Para cada tipo de evento valida: estado de origen, rol del actor, habilitación de su organización
 * y condiciones previas del dominio. Luego actualiza el estado, agrega el evento encadenado
 * y la fila de auditoría, todo en la misma transacción.
 */

type GuardCtx = { tx: Tx; battery: Battery; user: SessionUser; data: Record<string, unknown> };

type Rule = {
  /** Estados desde los que el evento es válido. `null` = la batería todavía no existe (alta). */
  from: (BatteryState | null)[];
  /** Estado resultante. Si se omite, el evento no cambia el estado. */
  to?: BatteryState;
  roles: Role[];
  requireEnabledOrg?: boolean;
  guard?: (ctx: GuardCtx) => Promise<void>;
};

const ownsAsDealer = (b: Battery, u: SessionUser) =>
  b.dealerOrgId === u.organizationId || b.createdByOrgId === u.organizationId;

const hasOpenIntervention = (b: Battery, u: SessionUser) => b.serviceOrgId === u.organizationId;

async function latestValidCertificate(tx: Tx, batteryId: string) {
  return tx.healthCertificate.findFirst({
    where: { batteryId, status: "VALIDADO", validUntil: { gt: new Date() } },
    orderBy: { reviewedAt: "desc" },
  });
}

async function lastInterventionStart(tx: Tx, batteryId: string) {
  const ev = await tx.batteryEvent.findFirst({
    where: { batteryId, type: "INTERVENCION" },
    orderBy: { seq: "desc" },
  });
  return ev?.occurredAt ?? new Date(0);
}

export const RULES = {
  ALTA: { from: [null], to: "EN_USO", roles: ["OPERADOR", "CONCESIONARIO"], requireEnabledOrg: true },
  ALTA_SEGUNDA_VIDA: { from: [null], to: "EN_USO", roles: ["TALLER"], requireEnabledOrg: true },

  VENTA: {
    from: ["EN_USO"],
    roles: ["CONCESIONARIO"],
    requireEnabledOrg: true,
    guard: async ({ battery, user }) => {
      if (battery.dealerOrgId && battery.dealerOrgId !== user.organizationId)
        throw forbidden("La batería ya fue vendida por otro concesionario");
    },
  },
  VINCULO_VEHICULO: {
    from: ["EN_USO"],
    roles: ["CONCESIONARIO"],
    requireEnabledOrg: true,
    guard: async ({ battery, user }) => {
      if (!ownsAsDealer(battery, user))
        throw forbidden("Solo el concesionario que vendió la batería puede registrar el recambio");
    },
  },

  INTERVENCION: { from: ["EN_USO"], to: "EN_SERVICIO", roles: ["TALLER"], requireEnabledOrg: true },
  CIERRE_INTERVENCION: {
    from: ["EN_SERVICIO"],
    to: "EN_USO",
    roles: ["TALLER"],
    requireEnabledOrg: true,
    guard: async ({ tx, battery, user }) => {
      if (!hasOpenIntervention(battery, user)) throw forbidden("La intervención abierta es de otro taller");
      const since = await lastInterventionStart(tx, battery.id);
      const cert = await tx.healthCertificate.findFirst({
        where: { batteryId: battery.id, status: "VALIDADO", createdAt: { gte: since } },
      });
      if (!cert)
        throw conflict("Para cerrar la intervención se requiere un certificado validado por el CENT", "PRECONDITION_FAILED");
    },
  },

  CERTIFICADO_CARGADO: {
    from: ["EN_SERVICIO"],
    roles: ["TALLER"],
    requireEnabledOrg: true,
    guard: async ({ battery, user }) => {
      if (!hasOpenIntervention(battery, user))
        throw forbidden("Solo el taller con la intervención abierta puede cargar ensayos");
    },
  },
  CERTIFICADO_VALIDADO: { from: ["EN_SERVICIO"], roles: ["ENTIDAD_TECNICA"] },
  CERTIFICADO_RECHAZADO: { from: ["EN_SERVICIO"], roles: ["ENTIDAD_TECNICA"] },

  SEGUNDA_VIDA: {
    from: ["EN_SERVICIO"],
    to: "SEGUNDA_VIDA",
    roles: ["TALLER"],
    requireEnabledOrg: true,
    guard: async ({ tx, battery, user }) => {
      if (!hasOpenIntervention(battery, user)) throw forbidden("La intervención abierta es de otro taller");
      const cert = await latestValidCertificate(tx, battery.id);
      if (!cert) throw conflict("Se requiere un certificado validado y vigente", "PRECONDITION_FAILED");
      if (!cert.reusable)
        throw conflict("El último certificado indica que la batería no es reutilizable", "PRECONDITION_FAILED");
    },
  },

  SOLICITUD_BAJA: {
    from: ["EN_USO", "EN_SERVICIO", "SEGUNDA_VIDA"],
    to: "BAJA_SOLICITADA",
    roles: ["TALLER"],
    requireEnabledOrg: true,
    guard: async ({ tx, battery, user }) => {
      if (battery.serviceOrgId && !hasOpenIntervention(battery, user))
        throw forbidden("La intervención abierta es de otro taller");
      const cert = await latestValidCertificate(tx, battery.id);
      if (!cert || cert.reusable)
        throw conflict(
          "La baja requiere un certificado validado que indique que la batería no es reutilizable",
          "PRECONDITION_FAILED",
        );
    },
  },

  CONSTANCIA_RECEPCION: {
    from: ["BAJA_SOLICITADA"],
    roles: ["RECICLADOR"],
    requireEnabledOrg: true,
    guard: async ({ tx, battery }) => {
      const pending = await tx.recyclerReceipt.count({
        where: { batteryId: battery.id, status: { in: ["PENDIENTE", "VALIDADO"] } },
      });
      if (pending > 0) throw conflict("Ya existe una constancia de recepción para esta batería");
    },
  },
  CONSTANCIA_RECHAZADA: { from: ["BAJA_SOLICITADA"], roles: ["ENTIDAD_TECNICA"] },
  RECICLADO: {
    from: ["BAJA_SOLICITADA"],
    to: "RECICLADA",
    roles: ["ENTIDAD_TECNICA"],
    guard: async ({ tx, battery }) => {
      const ok = await tx.recyclerReceipt.count({ where: { batteryId: battery.id, status: "VALIDADO" } });
      if (!ok)
        throw conflict("El cierre requiere una constancia del reciclador validada", "PRECONDITION_FAILED");
    },
  },
} satisfies Record<string, Rule>;

export type EventType = keyof typeof RULES;

function checkActor(rule: Rule, type: string, user: SessionUser | null): asserts user is SessionUser {
  if (!user) throw forbidden();
  if (!rule.roles.includes(user.role)) throw forbidden(`El rol ${user.role} no puede registrar ${type}`);
  if (rule.requireEnabledOrg && !user.organization.enabled)
    throw forbidden("Su organización no está habilitada por la entidad técnica");
}

function eventPayload(e: {
  batteryId: string;
  seq: number;
  type: string;
  actorId: string | null;
  organizationId: string | null;
  occurredAt: Date;
  data: unknown;
}) {
  return {
    batteryId: e.batteryId,
    seq: e.seq,
    type: e.type,
    actorId: e.actorId,
    organizationId: e.organizationId,
    occurredAt: e.occurredAt.toISOString(),
    data: e.data,
  };
}

async function appendEvent(
  tx: Tx,
  battery: Pick<Battery, "id">,
  type: EventType,
  actor: Actor,
  data: Record<string, unknown>,
) {
  const last = await tx.batteryEvent.findFirst({
    where: { batteryId: battery.id },
    orderBy: { seq: "desc" },
    select: { seq: true, hash: true },
  });
  const row = {
    batteryId: battery.id,
    seq: (last?.seq ?? 0) + 1,
    type,
    actorId: actor.user?.id ?? null,
    organizationId: actor.user?.organizationId ?? null,
    occurredAt: new Date(),
    data: JSON.parse(JSON.stringify(data)),
  };
  const prevHash = last?.hash ?? GENESIS_HASH;
  const hash = chainHash(prevHash, eventPayload(row));
  return tx.batteryEvent.create({
    data: { ...row, data: row.data as Prisma.InputJsonValue, prevHash, hash },
  });
}

/** Registra un evento sobre una batería existente aplicando la regla de transición. */
export async function recordEvent(
  tx: Tx,
  args: {
    batteryId: string;
    type: EventType;
    actor: Actor;
    data?: Record<string, unknown>;
    /** Cambios adicionales sobre la batería (p. ej. taller con intervención abierta). */
    update?: Prisma.BatteryUncheckedUpdateInput;
  },
) {
  const rule: Rule = RULES[args.type];
  // Bloquea la fila para que dos transiciones concurrentes no partan del mismo estado.
  await tx.$queryRaw`SELECT id FROM "Battery" WHERE id = ${args.batteryId} FOR UPDATE`;
  const battery = await tx.battery.findUnique({ where: { id: args.batteryId } });
  if (!battery) throw notFound("Batería no encontrada");

  if (!rule.from.includes(battery.state)) {
    throw invalidTransition(
      battery.state === "RECICLADA"
        ? "El pasaporte está cerrado (RECICLADA es un estado final)"
        : `No se puede registrar ${args.type} con la batería en estado ${battery.state}`,
    );
  }
  checkActor(rule, args.type, args.actor.user);
  const data = args.data ?? {};
  await rule.guard?.({ tx, battery, user: args.actor.user, data });

  const updated = await tx.battery.update({
    where: { id: battery.id },
    data: { ...(rule.to ? { state: rule.to } : {}), ...(args.update ?? {}) },
  });
  const event = await appendEvent(tx, battery, args.type, args.actor, data);
  await appendAudit(tx, args.actor, {
    action: `EVENTO_${args.type}`,
    entity: "Battery",
    entityId: battery.id,
    batteryId: battery.id,
    details: { eventId: event.id, from: battery.state, to: updated.state, ...data },
  });
  return { battery: updated, event };
}

/** Alta: crea la batería con su primer evento (estado inicial según la regla). */
export async function createWithEvent(
  tx: Tx,
  args: {
    type: "ALTA" | "ALTA_SEGUNDA_VIDA";
    actor: Actor;
    battery: Omit<Prisma.BatteryUncheckedCreateInput, "state">;
    data?: Record<string, unknown>;
  },
) {
  const rule: Rule = RULES[args.type];
  checkActor(rule, args.type, args.actor.user);
  const battery = await tx.battery.create({ data: { ...args.battery, state: rule.to! } });
  const data = { passportId: battery.passportId, ...(args.data ?? {}) };
  const event = await appendEvent(tx, battery, args.type, args.actor, data);
  await appendAudit(tx, args.actor, {
    action: `EVENTO_${args.type}`,
    entity: "Battery",
    entityId: battery.id,
    batteryId: battery.id,
    details: { eventId: event.id, to: battery.state, ...data },
  });
  return { battery, event };
}

/** Verifica la cadena de eventos de una batería. */
export async function verifyBatteryChain(batteryId: string) {
  const events = await prisma.batteryEvent.findMany({ where: { batteryId }, orderBy: { seq: "asc" } });
  let prev = GENESIS_HASH;
  for (const [i, e] of events.entries()) {
    if (e.seq !== i + 1) return { ok: false, checked: i, brokenAtSeq: e.seq, reason: "Falta un evento" };
    if (e.prevHash !== prev) return { ok: false, checked: i, brokenAtSeq: e.seq, reason: "El hash previo no coincide" };
    if (chainHash(prev, eventPayload(e)) !== e.hash)
      return { ok: false, checked: i, brokenAtSeq: e.seq, reason: "El evento fue alterado" };
    prev = e.hash;
  }
  return { ok: true, checked: events.length };
}
