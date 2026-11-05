import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { json, readBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { loginSchema } from "@/lib/validation";
import { appendAudit } from "@/modules/audit/service";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
// Hash señuelo: un teléfono inexistente tarda lo mismo que uno válido.
const DUMMY_HASH = bcrypt.hashSync("señuelo-no-valido", 10);

export const POST = route(async (req) => {
  const ip = await getClientIp();
  rateLimit(`login:${ip}`, 20, 60_000);
  const { phone, password } = loginSchema.parse((await readBody(req)).fields);
  const user = await prisma.user.findUnique({ where: { phone } });
  const invalid = new ApiError(401, "INVALID_CREDENTIALS", "Teléfono o contraseña incorrectos");
  if (!user || !user.active) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(423, "LOCKED", "Usuario bloqueado temporalmente por intentos fallidos. Intente más tarde.");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const attempts = user.failedAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data:
        attempts >= MAX_ATTEMPTS
          ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedAttempts: attempts },
    });
    throw invalid;
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
    await appendAudit(tx, { user: { ...user, organization: null as never }, ip }, {
      action: "LOGIN",
      entity: "User",
      entityId: user.id,
    });
  });
  (await cookies()).set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return json({ ok: true, role: user.role, name: user.name });
});
