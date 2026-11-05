import QRCode from "qrcode";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { route } from "@/lib/http";
import { STATE_LABEL } from "@/lib/labels";
import { rateLimit } from "@/lib/rate-limit";
import { ACCESS_LEVEL_LABEL, getPassportDocument } from "@/modules/passport/projection";

export const runtime = "nodejs";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#555" },
  id: { fontSize: 13, fontFamily: "Courier-Bold", marginTop: 8 },
  section: { marginTop: 14, borderTop: "1pt solid #ccc", paddingTop: 8 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  row: { flexDirection: "row", marginBottom: 3 },
  k: { width: 170, color: "#555" },
  v: { flex: 1 },
  big: { fontSize: 28, fontFamily: "Helvetica-Bold", color: "#0b6e4f" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#777" },
});

const Row = ({ k, v }: { k: string; v: string | number | null | undefined }) => (
  <View style={s.row}>
    <Text style={s.k}>{k}</Text>
    <Text style={s.v}>{v === null || v === undefined || v === "" ? "—" : String(v)}</Text>
  </View>
);

const d = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "—");

type Cert = {
  workshop: string;
  status: string;
  sohPercent: number;
  measuredCapacityKwh: number;
  internalResistanceMOhm: number;
  testMethod: string;
  reusable: boolean;
  reviewedAt: string | null;
  validUntil: string | null;
};

/** Certificado imprimible con QR. El contenido respeta el nivel de acceso del solicitante. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const actor = await getActor();
  if (!actor.user) rateLimit(`pdf:${actor.ip}`, 30, 60_000);
  const { id } = await params;
  const battery = await prisma.battery.findFirst({ where: { OR: [{ id }, { passportId: id }] } });
  if (!battery) throw notFound("Batería no encontrada");
  const result = await getPassportDocument(battery.passportId, actor);
  if (!result) throw notFound();
  const doc = result.doc as Record<string, any>;
  const qr = await QRCode.toDataURL(doc.url, { errorCorrectionLevel: "Q", margin: 1, width: 300 });
  const cert: Cert | undefined = (doc.healthCertificates as Cert[] | undefined)?.find((c) => c.status === "VALIDADO");

  const pdf = await renderToBuffer(
    <Document title={`Pasaporte ${doc.passportId}`} author="CENT - UTN">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>Pasaporte digital de batería</Text>
            <Text style={s.subtitle}>Certificado de estado de salud · Beta con datos sintéticos</Text>
            <Text style={s.subtitle}>Entidad técnica: CENT – Universidad Tecnológica Nacional</Text>
            <Text style={s.id}>{doc.passportId}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={qr} style={{ width: 110, height: 110 }} />
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Batería</Text>
          <Row k="Fabricante / operador" v={doc.manufacturer} />
          <Row k="Modelo" v={`${doc.model.brand} ${doc.model.name}`} />
          <Row k="Química" v={doc.model.chemistry} />
          <Row k="Capacidad nominal" v={`${doc.model.nominalCapacityKwh} kWh`} />
          <Row k="Tensión nominal" v={`${doc.model.nominalVoltageV} V`} />
          <Row k="Masa" v={`${doc.model.massKg} kg`} />
          <Row k="Año de fabricación" v={doc.manufactureYear} />
          <Row k="Estado del pasaporte" v={STATE_LABEL[doc.state as keyof typeof STATE_LABEL]} />
          {doc.serialNumber && <Row k="Número de serie" v={doc.serialNumber} />}
          {doc.vehicle && <Row k="Vehículo (VIN / dominio)" v={`${doc.vehicle.vin} / ${doc.vehicle.domain ?? "—"}`} />}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Estado de salud certificado</Text>
          {doc.lastHealth ? (
            <>
              <Text style={s.big}>{doc.lastHealth.sohPercent}%</Text>
              <Row k="Certificado el" v={d(doc.lastHealth.certifiedAt)} />
              <Row k="Vigente hasta" v={d(doc.lastHealth.validUntil)} />
              {cert && (
                <>
                  <Row k="Taller" v={cert.workshop} />
                  <Row k="Capacidad medida" v={`${cert.measuredCapacityKwh} kWh`} />
                  <Row k="Resistencia interna" v={`${cert.internalResistanceMOhm} mΩ`} />
                  <Row k="Método de ensayo" v={cert.testMethod} />
                  <Row k="Apta para reutilización" v={cert.reusable ? "Sí" : "No"} />
                </>
              )}
            </>
          ) : (
            <Text>La batería no tiene un certificado de estado de salud validado por el CENT.</Text>
          )}
        </View>

        {doc.previousPassportId && (
          <View style={s.section}>
            <Text>Pasaporte de segunda vida. Pasaporte original: {doc.previousPassportId}</Text>
          </View>
        )}

        <Text style={s.footer} fixed>
          Verifique la autenticidad escaneando el QR o en {doc.url}. Nivel de acceso de esta copia:{" "}
          {ACCESS_LEVEL_LABEL[result.level]}. Emitido el {new Date().toLocaleString("es-AR")}. Documento sin firma
          digital (beta).
        </Text>
      </Page>
    </Document>,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pasaporte-${doc.passportId}.pdf"`,
    },
  });
});
