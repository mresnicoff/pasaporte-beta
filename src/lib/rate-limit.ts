import { tooMany } from "./errors";

/** Límite simple por IP en memoria (suficiente para la beta; en producción usar un almacén compartido). */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) throw tooMany();
}
