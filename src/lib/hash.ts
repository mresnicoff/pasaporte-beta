import { createHash } from "crypto";

export const GENESIS_HASH = "0".repeat(64);

/** JSON canónico: claves ordenadas, fechas en ISO. Necesario porque JSONB reordena claves. */
export function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function chainHash(prevHash: string, payload: unknown): string {
  return sha256(prevHash + "|" + canonical(payload));
}
