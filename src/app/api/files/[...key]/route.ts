import { readFile } from "fs/promises";
import path from "path";
import { requireActor } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { route } from "@/lib/http";
import { UPLOAD_DIR } from "@/lib/storage";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".csv": "text/csv",
  ".txt": "text/plain",
};

/** Archivos guardados en disco (solo desarrollo). Requiere sesión. */
export const GET = route<{ key: string[] }>(async (_req, { params }) => {
  await requireActor();
  const { key } = await params;
  const full = path.resolve(UPLOAD_DIR, ...key);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) throw notFound();
  const data = await readFile(full).catch(() => null);
  if (!data) throw notFound("Archivo inexistente");
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream" },
  });
});
