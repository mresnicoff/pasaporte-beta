import { cookies, headers } from "next/headers";
import type { Organization, Role, User } from "@prisma/client";
import { prisma } from "./db";
import { SESSION_COOKIE, readSessionToken } from "./session";
import { forbidden, unauthorized } from "./errors";

export type SessionUser = User & { organization: Organization };

/** Quien ejecuta una acción: usuario autenticado (o null para público) + IP para auditoría. */
export type Actor = { user: SessionUser | null; ip: string | null };

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const uid = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  const user = await prisma.user.findUnique({ where: { id: uid }, include: { organization: true } });
  if (!user || !user.active) return null;
  return user;
}

export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function getActor(): Promise<Actor> {
  return { user: await getSessionUser(), ip: await getClientIp() };
}

/** Exige sesión y, si se indica, uno de los roles. La autorización se decide siempre en el servidor. */
export async function requireActor(roles?: Role[]): Promise<Actor & { user: SessionUser }> {
  const actor = await getActor();
  if (!actor.user) throw unauthorized();
  if (roles && !roles.includes(actor.user.role)) throw forbidden();
  return actor as Actor & { user: SessionUser };
}

export function assertRole(user: SessionUser, roles: Role[]) {
  if (!roles.includes(user.role)) throw forbidden();
}

export function assertOrgEnabled(user: SessionUser) {
  if (!user.organization.enabled)
    throw forbidden("Su organización no está habilitada por la entidad técnica");
}
