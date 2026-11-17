import type { BatteryState, OrgType, ReviewStatus, Role } from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = {
  OPERADOR: "Operador responsable",
  CONCESIONARIO: "Concesionario",
  TALLER: "Taller habilitado",
  ENTIDAD_TECNICA: "Entidad técnica (CENT)",
  RECICLADOR: "Reciclador",
  AUTORIDAD: "Autoridad",
};

export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  FABRICANTE: "Fabricante",
  IMPORTADOR: "Importador",
  CONCESIONARIO: "Concesionario",
  TALLER: "Taller",
  ENTIDAD_TECNICA: "Entidad técnica",
  RECICLADOR: "Reciclador",
  AUTORIDAD: "Autoridad",
};

export const STATE_LABEL: Record<BatteryState, string> = {
  EN_USO: "En uso",
  EN_SERVICIO: "En servicio",
  SEGUNDA_VIDA: "Segunda vida",
  BAJA_SOLICITADA: "Baja solicitada",
  RECICLADA: "Reciclada",
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  PENDIENTE: "Pendiente de validación",
  VALIDADO: "Validado",
  RECHAZADO: "Rechazado",
};

export const EVENT_LABEL: Record<string, string> = {
  ALTA: "Alta del pasaporte",
  ALTA_SEGUNDA_VIDA: "Alta de pasaporte de segunda vida",
  VENTA: "Venta y vínculo con vehículo",
  VINCULO_VEHICULO: "Recambio de vehículo",
  INTERVENCION: "Intervención de servicio",
  CIERRE_INTERVENCION: "Cierre de intervención",
  CERTIFICADO_CARGADO: "Ensayo de estado de salud cargado",
  CERTIFICADO_VALIDADO: "Certificado validado por el CENT",
  CERTIFICADO_RECHAZADO: "Certificado rechazado por el CENT",
  SEGUNDA_VIDA: "Reclasificación a segunda vida",
  SOLICITUD_BAJA: "Solicitud de baja",
  CONSTANCIA_RECEPCION: "Constancia de recepción del reciclador",
  CONSTANCIA_RECHAZADA: "Constancia rechazada por el CENT",
  RECICLADO: "Pasaporte cerrado: batería reciclada",
};

// Las fechas cargadas solo con día (p. ej. "2026-10-01") se guardan como medianoche UTC.
// Si se mostraran en horario de Buenos Aires retrocederían un día, así que se muestran en UTC.
const isDateOnly = (dt: Date) =>
  dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0 && dt.getUTCMilliseconds() === 0;

export const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("es-AR", {
    timeZone: isDateOnly(dt) ? "UTC" : "America/Argentina/Buenos_Aires",
  });
};
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
    : "—";
