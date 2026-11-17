/**
 * Recorrido de punta a punta contra el servidor en marcha (npm run dev), sobre la base sembrada.
 * Verifica los criterios de "listo" de cada etapa del plan de la beta.
 *   npm run e2e            (BASE_URL=http://localhost:3000 por defecto)
 */
import { prisma } from "../src/lib/db";
import { gtinCheckDigit, isValidPassportId, publicPath } from "../src/lib/passport-id";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "beta1234";
let failures = 0;

function check(name: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? "✔" : "✘"} ${name}${!cond && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`);
  if (!cond) failures++;
}

class Client {
  cookie = "";
  async login(phone: string, password = PASSWORD) {
    const r = await this.req("POST", "/api/auth/login", { phone, password });
    return r;
  }
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const init: RequestInit = { method, headers: { ...headers, ...(this.cookie ? { cookie: this.cookie } : {}) } };
    if (body instanceof FormData) init.body = body;
    else if (typeof body === "string") init.body = body;
    else if (body !== undefined) {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)["content-type"] = "application/json";
    }
    const res = await fetch(BASE + path, { ...init, redirect: "manual" });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data: data as any, type };
  }
}

async function as(phone: string) {
  const c = new Client();
  const r = await c.login(phone);
  if (r.status !== 200) throw new Error(`login ${phone}: ${JSON.stringify(r.data)}`);
  return c;
}

async function main() {
  const pub = new Client();
  const voltra = await as("1150000001");
  const dealer = await as("1150000003");
  const otherDealer = await as("1150000004");
  const shop = await as("1150000005");
  const disabledShop = await as("1150000007");
  const cent = await as("1150000008");
  const eco = await as("1150000009");
  const dnrpa = await as("1150000010");

  console.log("\n— Etapa 1: base, roles y niveles de acceso");
  const bad = await pub.login("1150000001", "incorrecta");
  check("contraseña incorrecta → 401", bad.status === 401, bad);
  const anon = await pub.req("POST", "/api/models", { brand: "x" });
  check("escritura sin sesión → 401", anon.status === 401, anon);
  const forb = await dnrpa.req("POST", "/api/batteries", { modelId: "x", serialNumber: "x", manufactureDate: "2025-01-01" });
  check("autoridad no puede escribir → 403", forb.status === 403, forb);

  const sold = await prisma.battery.findFirst({
    where: { state: "EN_USO", vehicleLinks: { some: { to: null } } },
    orderBy: { createdAt: "asc" },
  });
  const pPublic = await pub.req("GET", `/api/p/${sold!.passportId}`);
  check("público ve modelo y química", pPublic.data.model?.chemistry !== undefined, pPublic.data);
  check("público NO ve VIN ni eventos", !("vehicle" in pPublic.data) && !("events" in pPublic.data), Object.keys(pPublic.data));
  check("documento informa nivel PUBLICO", pPublic.data.accessLevel === "PUBLICO");
  const pAuth = await dnrpa.req("GET", `/api/p/${sold!.passportId}`);
  check("autoridad ve vehículo, eventos y cadena", !!pAuth.data.vehicle && Array.isArray(pAuth.data.events) && pAuth.data.eventChain?.ok, pAuth.data.eventChain);
  const pOther = await otherDealer.req("GET", `/api/p/${sold!.passportId}`);
  const soldByOther = sold!.dealerOrgId !== (await prisma.user.findUnique({ where: { phone: "1150000004" } }))!.organizationId;
  if (soldByOther) check("concesionario ajeno ve solo nivel público", pOther.data.accessLevel === "PUBLICO", pOther.data.accessLevel);

  console.log("\n— Etapa 2: pasaporte, identificador y QR");
  const model = await prisma.batteryModel.findFirst({ where: { name: "VX-60 Urbana" } });
  const created = await voltra.req("POST", "/api/batteries", {
    modelId: model!.id, serialNumber: `E2E${Date.now()}`, manufactureDate: "2026-01-15",
  }, { "Idempotency-Key": "e2e-alta-1" + Date.now() });
  check("alta devuelve passportId válido", created.status === 201 && isValidPassportId(created.data.passportId), created);
  const pid: string = created.data.passportId;
  const [pg, ps] = pid.split("-");
  const html = await pub.req("GET", `/01/${pg}/21/${ps}`, undefined, { accept: "text/html" });
  check("/01/{GTIN}/21/{serie} devuelve HTML a un navegador", html.status === 200 && html.type.includes("text/html"), html.status);
  const asJson = await pub.req("GET", `/01/${pg}/21/${ps}`, undefined, { accept: "application/json" });
  check("/01/{GTIN}/21/{serie} devuelve JSON si se pide", asJson.status === 200 && asJson.data.passportId === pid, asJson.status);
  const unknown = await pub.req("GET", `/01/${pg}/21/NOEXISTE999`, undefined, { accept: "application/json" });
  check("batería no registrada → 404", unknown.status === 404, unknown.status);
  const qr = await pub.req("GET", `/api/qr/${pid}`);
  check("QR en PNG", qr.status === 200 && qr.type === "image/png");
  const typoGtin = pg.slice(0, 12) + (pg[12] === "0" ? "1" : "0") + pg[13];
  const typoRes = await pub.req("GET", `/api/qr/${typoGtin}-${ps}`);
  check("el dígito de control del GTIN detecta un error de tipeo", typoRes.status === 404, typoRes.status);
  const qrUrl = publicPath(pid);
  check("la dirección pública es /01/{GTIN}/21/{serie}", qrUrl === `/01/${pg}/21/${ps}`, qrUrl);
  const dupKey = "e2e-dup-" + Date.now();
  const d1 = await voltra.req("POST", "/api/batteries", { modelId: model!.id, serialNumber: `E2EIDEM${Date.now()}`, manufactureDate: "2026-01-15" }, { "Idempotency-Key": dupKey });
  const d2 = await voltra.req("POST", "/api/batteries", { modelId: model!.id, serialNumber: `E2EIDEM${Date.now()}`, manufactureDate: "2026-01-15" }, { "Idempotency-Key": dupKey });
  check("idempotencia: el reintento devuelve el mismo pasaporte", d1.data.passportId === d2.data.passportId, [d1.data, d2.data]);

  console.log("\n— Etapa 3: venta y CSV");
  const sale = await dealer.req("POST", "/api/sales", {
    passportId: pid, vin: "8AP" + String(Date.now()).slice(-10) + "XYZ1", domain: "", brand: "Andina", model: "E-Urbano", year: 2026,
  });
  check("concesionario registra la venta", sale.status === 201 && sale.data.event === "VENTA", sale);
  const steal = await otherDealer.req("POST", `/api/batteries/${created.data.id}/link-vehicle`, {
    vin: "9BW" + String(Date.now()).slice(-10) + "ABC2", brand: "X", model: "Y", year: 2026,
  });
  check("otro concesionario no puede modificarla → 403", steal.status === 403, steal);
  const csv = new FormData();
  csv.set("file", new Blob([
    `modelo,numero_serie,fecha_fabricacion\nVX-60 Urbana,CSV${Date.now()}A,2026-02-01\nModelo Fantasma,CSVX,2026-02-01\nVX-60 Urbana,,2026-02-01\nVX-60 Urbana,CSV${Date.now()}B,fecha-mala\n`,
  ], { type: "text/csv" }), "lote.csv");
  const imp = await voltra.req("POST", "/api/batteries/import", csv);
  check("CSV: informe por fila (1 válida, 3 inválidas)", imp.data.created === 1 && imp.data.failed === 3, imp.data);

  console.log("\n— Etapa 4: estado de salud");
  const bid = created.data.id;
  const noShop = await disabledShop.req("POST", `/api/batteries/${bid}/intervention`, { reason: "Prueba" });
  check("taller no habilitado no registra eventos → 403", noShop.status === 403, noShop);
  const it = await shop.req("POST", `/api/batteries/${bid}/intervention`, { reason: "Pérdida de autonomía" });
  check("intervención → EN_SERVICIO", it.data.state === "EN_SERVICIO", it);
  const cert = await shop.req("POST", `/api/batteries/${bid}/health-certificates`, {
    sohPercent: 47, measuredCapacityKwh: 28.2, internalResistanceMOhm: 190, testMethod: "Descarga C/3", reusable: false,
  });
  check("ensayo cargado (pendiente)", cert.status === 201 && cert.data.status === "PENDIENTE", cert);
  const before = await pub.req("GET", `/api/p/${pid}`);
  check("certificado no validado NO aparece en el pasaporte público", before.data.lastHealth === null, before.data.lastHealth);
  const early = await shop.req("POST", `/api/batteries/${bid}/decommission`, { reason: "No reutilizable" });
  check("baja sin certificado validado → 409", early.status === 409, early);
  const val = await cent.req("POST", `/api/health-certificates/${cert.data.id}/validate`, { approve: true });
  check("CENT valida el certificado", val.data.status === "VALIDADO", val);
  const after = await pub.req("GET", `/api/p/${pid}`);
  check("certificado validado aparece en el público", after.data.lastHealth?.sohPercent === 47, after.data.lastHealth);
  const pdf = await pub.req("GET", `/api/batteries/${pid}/certificate.pdf`);
  check("PDF del certificado", pdf.status === 200 && pdf.type === "application/pdf", pdf.status);

  console.log("\n— Etapa 5: segunda vida y baja");
  const slBody = (n: number) => {
    const body = "0779100" + String(900 + n).padStart(6, "0");
    return { application: "Estacionario", gtin: body + gtinCheckDigit(body), serialNumber: `E2ESV${Date.now()}`.slice(0, 20) };
  };
  const sv = await shop.req("POST", `/api/batteries/${bid}/second-life`, slBody(1));
  check("segunda vida con certificado 'no reutilizable' → 409", sv.status === 409, sv);
  const early2 = await eco.req("POST", `/api/batteries/${bid}/recycler-receipt`, { receivedAt: "2026-11-01", receivedMassKg: 400, manifestNumber: "MAN-E2E-0" });
  check("reciclador antes de la baja → 409", early2.status === 409, early2);
  const dec = await shop.req("POST", `/api/batteries/${bid}/decommission`, { reason: "Celdas degradadas" });
  check("baja solicitada", dec.data.state === "BAJA_SOLICITADA", dec);
  const inv = await shop.req("POST", `/api/batteries/${bid}/intervention`, { reason: "Otra" });
  check("transición inválida → 409", inv.status === 409 && inv.data.code === "INVALID_TRANSITION", inv);
  const rec = await eco.req("POST", `/api/batteries/${bid}/recycler-receipt`, { receivedAt: "2026-11-01", receivedMassKg: 405.2, manifestNumber: "MAN-E2E-1" });
  check("constancia del reciclador (pendiente)", rec.status === 201, rec);
  const stillOpen = await prisma.battery.findUnique({ where: { id: bid } });
  check("sin validación del CENT el pasaporte sigue abierto", stillOpen!.state === "BAJA_SOLICITADA");
  const close = await cent.req("POST", `/api/recycler-receipts/${rec.data.id}/validate`, { approve: true });
  check("CENT valida → RECICLADA", close.data.batteryState === "RECICLADA", close);
  const final = await shop.req("POST", `/api/batteries/${bid}/intervention`, { reason: "Nueva revisión" });
  check("RECICLADA es final → 409", final.status === 409, final);

  // Segunda vida sobre una batería con certificado reutilizable.
  const svTarget = await prisma.battery.findFirst({ where: { state: "EN_USO", serviceOrgId: null, nextBattery: null, previousBatteryId: null }, orderBy: { createdAt: "desc" } });
  await shop.req("POST", `/api/batteries/${svTarget!.id}/intervention`, { reason: "Evaluación de segunda vida" });
  const c2 = await shop.req("POST", `/api/batteries/${svTarget!.id}/health-certificates`, { sohPercent: 72, measuredCapacityKwh: 43, internalResistanceMOhm: 120, testMethod: "Descarga C/3", reusable: true });
  await cent.req("POST", `/api/health-certificates/${c2.data.id}/validate`, { approve: true });
  const sv2 = await shop.req("POST", `/api/batteries/${svTarget!.id}/second-life`, slBody(2));
  check("segunda vida crea pasaporte nuevo vinculado", sv2.status === 201 && isValidPassportId(sv2.data.newPassportId) && sv2.data.originalState === "SEGUNDA_VIDA", sv2);
  const newDoc = await pub.req("GET", `/api/p/${sv2.data.newPassportId}`);
  check("el nuevo pasaporte refiere al original", newDoc.data.previousPassportId === svTarget!.passportId, newDoc.data);

  console.log("\n— Etapa 6: auditoría y estadísticas");
  const audit = await dnrpa.req("GET", `/api/audit?batteryId=${bid}`);
  check("cadena de auditoría íntegra", audit.data.chain?.ok === true, audit.data.chain);
  check("cadena de eventos de la batería íntegra", audit.data.eventChain?.ok === true, audit.data.eventChain);
  const noAudit = await dealer.req("GET", `/api/audit`);
  check("concesionario no accede a auditoría → 403", noAudit.status === 403);
  const stats = await cent.req("GET", "/api/stats");
  check("estadísticas del parque", stats.data.totalBatteries > 0 && stats.data.byState.RECICLADA >= 1, stats.data.byState);

  // Alteración manual de una fila → la verificación debe fallar; luego se restaura.
  const victim = await prisma.auditLog.findFirst({ where: { batteryId: bid }, orderBy: { seq: "asc" } });
  await prisma.$executeRaw`UPDATE "AuditLog" SET action = 'MANIPULADO' WHERE id = ${victim!.id}`;
  const tampered = await dnrpa.req("GET", `/api/audit`);
  check("alterar una fila a mano hace fallar la verificación", tampered.data.chain?.ok === false && tampered.data.chain.brokenAtSeq === victim!.seq, tampered.data.chain);
  await prisma.$executeRaw`UPDATE "AuditLog" SET action = ${victim!.action} WHERE id = ${victim!.id}`;
  const ev = await prisma.batteryEvent.findFirst({ where: { batteryId: bid, type: "SOLICITUD_BAJA" } });
  await prisma.$executeRaw`UPDATE "BatteryEvent" SET data = '{"reason":"otro motivo"}'::jsonb WHERE id = ${ev!.id}`;
  const evTampered = await dnrpa.req("GET", `/api/p/${pid}`);
  check("alterar un evento rompe la cadena de la batería", evTampered.data.eventChain?.ok === false, evTampered.data.eventChain);
  await prisma.batteryEvent.update({ where: { id: ev!.id }, data: { data: ev!.data as object } });
  const restored = await dnrpa.req("GET", `/api/audit?batteryId=${bid}`);
  check("restaurada la fila, la cadena vuelve a verificar", restored.data.chain?.ok === true && restored.data.eventChain?.ok === true, restored.data);

  console.log(failures ? `\n${failures} verificaciones fallidas` : "\nTodas las verificaciones pasaron");
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
