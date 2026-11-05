/**
 * Datos sintéticos de la beta: organizaciones, usuarios de prueba y un parque de baterías
 * en distintos estados. Todo se registra a través de los servicios de dominio, de modo que
 * los eventos y la auditoría quedan encadenados como en el uso real.
 *
 * Contraseña de todos los usuarios de prueba: beta1234
 */
import bcrypt from "bcryptjs";
import type { OrgType, Role } from "@prisma/client";
import { prisma } from "../src/lib/db";
import type { Actor, SessionUser } from "../src/lib/auth";
import {
  closeIntervention,
  createBattery,
  createModel,
  linkVehicle,
  requestDecommission,
  requestSecondLife,
  startIntervention,
} from "../src/modules/batteries/service";
import {
  createRecyclerReceipt,
  reviewHealthCertificate,
  reviewRecyclerReceipt,
  uploadHealthCertificate,
} from "../src/modules/certificates/service";

export const TEST_PASSWORD = "beta1234";

// Generador pseudoaleatorio determinístico, para que el parque sea siempre el mismo.
let seed = 20261105;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const round1 = (n: number) => Math.round(n * 10) / 10;

const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
const vin = () => Array.from({ length: 17 }, () => pick([...VIN_CHARS])).join("");
const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const domain = (i: number) =>
  `A${L[Math.floor(i / 26) % 26]}${String(100 + (i % 900)).padStart(3, "0")}${L[i % 26]}${L[(i * 7) % 26]}`;

const ORGS: { key: string; name: string; type: OrgType; cuit: string; operatorCode?: string; enabled?: boolean }[] = [
  { key: "voltra", name: "Voltra Baterías SA", type: "FABRICANTE", cuit: "30-71000001-1", operatorCode: "0042" },
  { key: "importcell", name: "ImportCell Argentina SRL", type: "IMPORTADOR", cuit: "30-71000002-9", operatorCode: "0107" },
  { key: "delplata", name: "Concesionaria Del Plata SA", type: "CONCESIONARIO", cuit: "30-71000003-7" },
  { key: "cuyo", name: "Autos Cuyo SA", type: "CONCESIONARIO", cuit: "30-71000004-5" },
  { key: "electro", name: "ElectroService Taller", type: "TALLER", cuit: "20-30000005-3" },
  { key: "sur", name: "Desarmadero Sur", type: "TALLER", cuit: "30-71000006-1" },
  { key: "nuevo", name: "Taller Nuevo (sin habilitar)", type: "TALLER", cuit: "20-30000007-8", enabled: false },
  { key: "cent", name: "CENT – UTN", type: "ENTIDAD_TECNICA", cuit: "30-54667000-6" },
  { key: "eco", name: "EcoReciclar SA", type: "RECICLADOR", cuit: "30-71000009-4" },
  { key: "dnrpa", name: "DNRPA", type: "AUTORIDAD", cuit: "30-99900001-2" },
  { key: "ambiente", name: "Secretaría de Ambiente", type: "AUTORIDAD", cuit: "30-99900002-0" },
];

const USERS: { org: string; role: Role; name: string; phone: string }[] = [
  { org: "voltra", role: "OPERADOR", name: "Lucía Fabbri", phone: "1150000001" },
  { org: "importcell", role: "OPERADOR", name: "Martín Ortega", phone: "1150000002" },
  { org: "delplata", role: "CONCESIONARIO", name: "Diego Paz", phone: "1150000003" },
  { org: "cuyo", role: "CONCESIONARIO", name: "Sofía Gil", phone: "1150000004" },
  { org: "electro", role: "TALLER", name: "Ramiro Sosa", phone: "1150000005" },
  { org: "sur", role: "TALLER", name: "Ana Quiroga", phone: "1150000006" },
  { org: "nuevo", role: "TALLER", name: "Pablo Nieto", phone: "1150000007" },
  { org: "cent", role: "ENTIDAD_TECNICA", name: "Ing. Laura Méndez", phone: "1150000008" },
  { org: "eco", role: "RECICLADOR", name: "Carlos Rey", phone: "1150000009" },
  { org: "dnrpa", role: "AUTORIDAD", name: "Inspectora Julia Vera", phone: "1150000010" },
  { org: "ambiente", role: "AUTORIDAD", name: "Gonzalo Ibarra", phone: "1150000011" },
];

const VEHICLES = [
  { brand: "Andina", model: "E-Urbano", },
  { brand: "Pampa Motors", model: "Volta S" },
  { brand: "Austral", model: "EV Cargo" },
  { brand: "Ríos", model: "Moto E4" },
];

async function wipe() {
  await prisma.idempotencyKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.batteryEvent.deleteMany();
  await prisma.recyclerReceipt.deleteMany();
  await prisma.healthCertificate.deleteMany();
  await prisma.batteryVehicleLink.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.battery.updateMany({ data: { previousBatteryId: null } });
  await prisma.battery.deleteMany();
  await prisma.batteryModel.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

async function main() {
  console.log("Limpiando base…");
  await wipe();

  const orgIds: Record<string, string> = {};
  for (const o of ORGS) {
    const created = await prisma.organization.create({
      data: { name: o.name, type: o.type, cuit: o.cuit, operatorCode: o.operatorCode, enabled: o.enabled ?? true },
    });
    orgIds[o.key] = created.id;
  }
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const actors: Record<string, Actor & { user: SessionUser }> = {};
  for (const u of USERS) {
    const user = await prisma.user.create({
      data: { organizationId: orgIds[u.org], role: u.role, name: u.name, phone: u.phone, passwordHash: hash },
      include: { organization: true },
    });
    actors[u.org] = { user, ip: "127.0.0.1" };
  }
  const A = actors;

  console.log("Modelos…");
  const vx60 = await createModel(A.voltra, {
    brand: "Voltra", name: "VX-60 Urbana", chemistry: "LFP",
    nominalCapacityKwh: 60, nominalVoltageV: 400, massKg: 410, carbonFootprintKgCo2e: 4800,
  });
  const vx85 = await createModel(A.voltra, {
    brand: "Voltra", name: "VX-85 Ruta", chemistry: "NMC",
    nominalCapacityKwh: 85, nominalVoltageV: 800, massKg: 520, carbonFootprintKgCo2e: 7900,
  });
  const ic40 = await createModel(A.importcell, {
    brand: "ImportCell", name: "IC-40 City", chemistry: "LFP",
    nominalCapacityKwh: 40, nominalVoltageV: 350, massKg: 290,
  });
  const ic4 = await createModel(A.importcell, {
    brand: "ImportCell", name: "IC-M4 Moto", chemistry: "NMC",
    nominalCapacityKwh: 4.2, nominalVoltageV: 72, massKg: 28,
  });
  const models = [
    { m: vx60, op: A.voltra, prefix: "VX60" },
    { m: vx85, op: A.voltra, prefix: "VX85" },
    { m: ic40, op: A.importcell, prefix: "IC40" },
    { m: ic4, op: A.importcell, prefix: "ICM4" },
  ];

  console.log("Baterías…");
  const batteries: { id: string; passportId: string; nominal: number; vehicle: (typeof VEHICLES)[number] }[] = [];
  for (let i = 0; i < 60; i++) {
    const { m, op, prefix } = models[i % models.length];
    const year = 2022 + Math.floor(rnd() * 4);
    const date = new Date(Date.UTC(year, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27)));
    const { battery } = await createBattery(op, {
      modelId: m.id,
      serialNumber: `${prefix}-${year}-${String(1000 + i).padStart(6, "0")}`,
      manufactureDate: date,
    });
    batteries.push({
      id: battery.id,
      passportId: battery.passportId,
      nominal: m.nominalCapacityKwh,
      vehicle: m === ic4 ? VEHICLES[3] : VEHICLES[i % 3],
    });
  }

  console.log("Ventas…");
  const sold = batteries.slice(0, 46);
  for (const [i, b] of sold.entries()) {
    const dealer = i % 2 === 0 ? A.delplata : A.cuyo;
    await linkVehicle(dealer, b.id, {
      vin: vin(),
      domain: domain(i),
      brand: b.vehicle.brand,
      model: b.vehicle.model,
      year: 2023 + (i % 3),
      saleDate: new Date(Date.UTC(2024 + (i % 2), i % 12, 10)),
    });
  }

  // Ensayo completo: intervención, ensayo cargado y validación del CENT.
  async function certify(idx: number, workshop: Actor & { user: SessionUser }, soh: number, reusable: boolean) {
    const b = batteries[idx];
    await startIntervention(workshop, b.id, { reason: pick(["Service de 40.000 km", "Pérdida de autonomía", "Control posterior a choque", "Revisión anual"]) });
    const cert = await uploadHealthCertificate(workshop, b.id, {
      sohPercent: soh,
      measuredCapacityKwh: round1((b.nominal * soh) / 100),
      internalResistanceMOhm: round1(between(60, 180)),
      testMethod: "Descarga completa a C/3, 25 °C (IEC 62660-1)",
      reusable,
    });
    await reviewHealthCertificate(A.cent, cert.id, { approve: true });
    return b;
  }

  console.log("Certificados de estado de salud…");
  for (let i = 0; i < 14; i++) {
    const b = await certify(i, i % 2 ? A.electro : A.sur, round1(between(78, 98)), true);
    await closeIntervention(i % 2 ? A.electro : A.sur, b.id);
  }

  console.log("Segunda vida…");
  for (const idx of [14, 15]) {
    const b = await certify(idx, A.electro, round1(between(68, 76)), true);
    await requestSecondLife(A.electro, b.id, { application: "Almacenamiento estacionario para comercio" });
  }

  console.log("Bajas y reciclaje…");
  for (const idx of [16, 17, 18]) {
    const b = await certify(idx, A.sur, round1(between(42, 58)), false);
    await requestDecommission(A.sur, b.id, { reason: "Celdas degradadas, no apta para reutilización" });
  }
  for (const idx of [16, 17]) {
    const b = batteries[idx];
    const receipt = await createRecyclerReceipt(A.eco, b.id, {
      receivedAt: new Date(),
      receivedMassKg: idx === 16 ? 409.5 : 518,
      manifestNumber: `MAN-2026-${String(4400 + idx)}`,
    });
    if (idx === 16) await reviewRecyclerReceipt(A.cent, receipt.id, { approve: true });
    // idx 17 queda con la constancia pendiente de validación del CENT
  }

  console.log("Casos abiertos para la demostración…");
  // Intervención abierta con ensayo pendiente de validación.
  const open = batteries[19];
  await startIntervention(A.electro, open.id, { reason: "Diagnóstico por pérdida de autonomía" });
  await uploadHealthCertificate(A.electro, open.id, {
    sohPercent: 86.4,
    measuredCapacityKwh: round1(open.nominal * 0.864),
    internalResistanceMOhm: 92,
    testMethod: "Descarga completa a C/3, 25 °C (IEC 62660-1)",
    reusable: true,
  });
  // Intervención abierta sin ensayo.
  await startIntervention(A.sur, batteries[20].id, { reason: "Revisión anual" });

  const counts = await prisma.battery.groupBy({ by: ["state"], _count: true });
  console.log("Listo:", Object.fromEntries(counts.map((c) => [c.state, c._count])));
  console.log(`Ejemplo de pasaporte público: /p/${batteries[0].passportId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
