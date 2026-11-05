import { prisma } from "@/lib/db";
import type { Actor, SessionUser } from "@/lib/auth";
import { ApiError, badRequest } from "@/lib/errors";
import { csvRowSchema } from "@/lib/validation";
import { createBatteryTx } from "./service";

export type ImportRowResult = {
  row: number;
  ok: boolean;
  serialNumber?: string;
  passportId?: string;
  errors?: string[];
};

const QUOTE = '"';

/** Parser CSV mínimo con soporte de comillas; separador coma o punto y coma. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const semis = firstLine.split(";").length;
  const commas = firstLine.split(",").length;
  const sep = semis > commas ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === QUOTE && clean[i + 1] === QUOTE) {
        cell += QUOTE;
        i++;
      } else if (c === QUOTE) quoted = false;
      else cell += c;
    } else if (c === QUOTE) quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const CSV_COLUMNS = ["modelo", "numero_serie", "fecha_fabricacion"] as const;
const MAX_ROWS = 5000;

/**
 * Alta masiva: cada fila se procesa en su propia transacción, de modo que las válidas
 * quedan registradas y las inválidas se informan con su número de fila y motivo.
 */
export async function importBatteriesCsv(actor: Actor & { user: SessionUser }, text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw badRequest("El archivo no tiene filas de datos");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw badRequest(`Faltan columnas: ${missing.join(", ")}`);
  if (rows.length - 1 > MAX_ROWS) throw badRequest(`Máximo ${MAX_ROWS} filas por archivo`);

  const models = await prisma.batteryModel.findMany({ where: { operatorId: actor.user.organizationId } });
  const byName = new Map(models.map((m) => [m.name.toLowerCase(), m]));
  const seen = new Set<string>();
  const results: ImportRowResult[] = [];

  for (let i = 1; i < rows.length; i++) {
    const rowNum = i + 1; // línea del archivo (la 1 es el encabezado)
    const raw = Object.fromEntries(header.map((h, j) => [h, rows[i][j] ?? ""]));
    const parsed = csvRowSchema.safeParse(raw);
    if (!parsed.success) {
      results.push({
        row: rowNum,
        ok: false,
        serialNumber: raw.numero_serie,
        errors: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`),
      });
      continue;
    }
    const { modelo, numero_serie, fecha_fabricacion } = parsed.data;
    const model = byName.get(modelo.toLowerCase());
    if (!model) {
      results.push({ row: rowNum, ok: false, serialNumber: numero_serie, errors: [`Modelo inexistente: ${modelo}`] });
      continue;
    }
    const key = `${model.id}:${numero_serie}`;
    if (seen.has(key)) {
      results.push({
        row: rowNum,
        ok: false,
        serialNumber: numero_serie,
        errors: ["Número de serie repetido en el archivo"],
      });
      continue;
    }
    seen.add(key);
    try {
      const { battery } = await prisma.$transaction((tx) =>
        createBatteryTx(tx, actor, {
          modelId: model.id,
          serialNumber: numero_serie,
          manufactureDate: fecha_fabricacion,
        }),
      );
      results.push({ row: rowNum, ok: true, serialNumber: numero_serie, passportId: battery.passportId });
    } catch (e) {
      results.push({
        row: rowNum,
        ok: false,
        serialNumber: numero_serie,
        errors: [e instanceof ApiError ? e.message : "Error al registrar la fila"],
      });
    }
  }
  return {
    total: results.length,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    rows: results,
  };
}
