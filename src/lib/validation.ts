import { z } from "zod";
import { isValidPassportId, normalizePassportId } from "./passport-id";

/** Esquemas compartidos entre cliente y servidor. */

export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+?\d{8,15}$/, "Teléfono inválido"));

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "Ingrese la contraseña"),
});

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const optionalNum = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(min).max(max).optional());

export const batteryModelSchema = z.object({
  brand: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  chemistry: z.string().trim().min(2).max(40),
  nominalCapacityKwh: num(0.1, 500),
  nominalVoltageV: num(1, 2000),
  massKg: num(0.1, 5000),
  carbonFootprintKgCo2e: optionalNum(0, 1_000_000),
});

export const passportIdSchema = z
  .string()
  .transform(normalizePassportId)
  .refine(isValidPassportId, "Identificador inválido: revise el dígito verificador");

const dateSchema = z.coerce.date().refine((d) => !isNaN(d.getTime()), "Fecha inválida");

export const createBatterySchema = z.object({
  modelId: z.string().min(1),
  serialNumber: z.string().trim().min(1).max(60),
  manufactureDate: dateSchema,
});

export const vehicleSchema = z.object({
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN inválido (17 caracteres, sin I, O ni Q)"),
  domain: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .toUpperCase()
      .transform((s) => s.replace(/\s|-/g, ""))
      .pipe(z.string().regex(/^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/, "Dominio inválido"))
      .optional(),
  ),
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z.coerce.number().int().min(1990).max(2100),
});

export const linkVehicleSchema = vehicleSchema.extend({
  saleDate: dateSchema.optional(),
});

export const sellSchema = linkVehicleSchema.extend({ passportId: passportIdSchema });

export const interventionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const healthCertificateSchema = z.object({
  sohPercent: num(0, 100),
  measuredCapacityKwh: num(0, 500),
  internalResistanceMOhm: num(0, 10_000),
  testMethod: z.string().trim().min(3).max(200),
  reusable: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
});

export const reviewSchema = z
  .object({
    approve: z.preprocess((v) => v === true || v === "true", z.boolean()),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.approve || (d.reason && d.reason.length >= 3), {
    message: "Indique el motivo del rechazo",
    path: ["reason"],
  });

export const secondLifeSchema = z.object({
  application: z.string().trim().min(3).max(200),
  newOperatorId: z.string().optional(),
});

export const decommissionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const recyclerReceiptSchema = z.object({
  receivedAt: dateSchema,
  receivedMassKg: num(0.1, 5000),
  manifestNumber: z.string().trim().min(3).max(60),
});

export const csvRowSchema = z.object({
  modelo: z.string().trim().min(1, "Falta el modelo"),
  numero_serie: z.string().trim().min(1, "Falta el número de serie").max(60),
  fecha_fabricacion: dateSchema,
});
