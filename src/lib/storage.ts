import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { badRequest } from "./errors";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "text/csv", "text/plain"]);

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/**
 * Adaptador de archivos: Vercel Blob si hay token, disco local (./uploads) en desarrollo.
 * Valida tamaño y tipo antes de guardar.
 */
export async function saveFile(file: File, folder: string): Promise<string> {
  if (file.size > MAX_BYTES) throw badRequest("El archivo supera 10 MB");
  if (!ALLOWED.has(file.type)) throw badRequest(`Tipo de archivo no permitido: ${file.type || "desconocido"}`);
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const key = `${folder}/${randomUUID()}-${safe}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(key, file, { access: "public", contentType: file.type });
    return blob.url;
  }
  const dest = path.join(UPLOAD_DIR, key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return `/api/files/${key}`;
}
