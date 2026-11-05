import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError, badRequest } from "./errors";
import { prisma } from "./db";
import type { SessionUser } from "./auth";

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return json({ code: err.code, message: err.message, details: err.details }, err.status);
  }
  if (err instanceof ZodError) {
    return json(
      {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      400,
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return json({ code: "DUPLICATE", message: "Ya existe un registro con esos datos" }, 409);
  }
  console.error(err);
  return json({ code: "INTERNAL", message: "Error interno" }, 500);
}

type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

/** Envuelve un handler para traducir excepciones a { code, message } con el status HTTP correcto. */
export function route<P = Record<string, string>>(handler: Handler<P>): Handler<P> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export type ParsedBody = { fields: Record<string, unknown>; files: Record<string, File> };

/** Acepta JSON o multipart/form-data (para adjuntos). */
export async function readBody(req: Request): Promise<ParsedBody> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    const fields: Record<string, unknown> = {};
    const files: Record<string, File> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") fields[k] = v;
      else if (v.size > 0) files[k] = v;
    }
    return { fields, files };
  }
  try {
    const body = await req.json();
    return { fields: body ?? {}, files: {} };
  } catch {
    throw badRequest("Cuerpo JSON inválido");
  }
}

/**
 * Idempotencia para escrituras que crean eventos: si el cliente reintenta con la misma
 * cabecera Idempotency-Key, se devuelve la respuesta original sin volver a ejecutar.
 */
export async function idempotent(
  req: Request,
  user: SessionUser,
  run: () => Promise<{ status: number; body: unknown }>,
): Promise<Response> {
  const raw = req.headers.get("idempotency-key");
  if (!raw) {
    const r = await run();
    return json(r.body, r.status);
  }
  const key = `${user.id}:${raw.slice(0, 200)}`;
  const route = new URL(req.url).pathname;
  const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (existing) {
    if (existing.route !== route)
      throw new ApiError(422, "IDEMPOTENCY_KEY_REUSED", "La clave de idempotencia ya se usó en otra ruta");
    return json(existing.response, existing.statusCode);
  }
  const r = await run();
  await prisma.idempotencyKey
    .create({
      data: { key, userId: user.id, route, statusCode: r.status, response: r.body as Prisma.InputJsonValue },
    })
    .catch(() => undefined);
  return json(r.body, r.status);
}
