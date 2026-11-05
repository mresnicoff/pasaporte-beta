import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ROLE_LABEL, STATE_LABEL, fmtDateTime, EVENT_LABEL } from "@/lib/labels";
import { visibleBatteriesWhere } from "@/modules/batteries/service";
import { findBattery } from "./actions";

const HINTS: Record<string, string> = {
  OPERADOR: "Cargue modelos de batería y dé de alta unidades, una por una o con un archivo CSV.",
  CONCESIONARIO: "Registre la venta ingresando el identificador de la batería y el VIN del vehículo.",
  TALLER:
    "Identifique la batería por su QR o identificador, registre la intervención y cargue el ensayo de estado de salud.",
  ENTIDAD_TECNICA: "Valide certificados y constancias, habilite talleres y supervise la auditoría.",
  RECICLADOR: "Registre la constancia de recepción de las baterías con baja solicitada.",
  AUTORIDAD: "Consulta completa del parque, incluida la auditoría. Sin permisos de escritura.",
};

export default async function PanelHome() {
  const user = (await getSessionUser())!;
  const where = visibleBatteriesWhere(user);
  const [byState, recent, pendingCerts, pendingReceipts] = await Promise.all([
    prisma.battery.groupBy({ by: ["state"], where, _count: true }),
    prisma.batteryEvent.findMany({
      where: user.role === "ENTIDAD_TECNICA" || user.role === "AUTORIDAD" ? {} : { battery: where },
      orderBy: { occurredAt: "desc" },
      take: 8,
      include: { battery: { select: { id: true, passportId: true } }, organization: { select: { name: true } } },
    }),
    user.role === "ENTIDAD_TECNICA" ? prisma.healthCertificate.count({ where: { status: "PENDIENTE" } }) : 0,
    user.role === "ENTIDAD_TECNICA" ? prisma.recyclerReceipt.count({ where: { status: "PENDIENTE" } }) : 0,
  ]);
  const total = byState.reduce((a, s) => a + s._count, 0);
  const count = (s: string) => byState.find((x) => x.state === s)?._count ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hola, {user.name.split(" ")[0]}</h1>
          <p className="muted">
            {ROLE_LABEL[user.role]} · {HINTS[user.role]}
          </p>
        </div>
        <form action={findBattery} className="actions">
          <input name="q" placeholder="Identificador, n.º de serie, VIN o dominio" style={{ minWidth: 300 }} />
          <button>Buscar</button>
        </form>
      </div>

      {user.role === "ENTIDAD_TECNICA" && (pendingCerts > 0 || pendingReceipts > 0) && (
        <div className="alert warn" style={{ marginBottom: "1rem" }}>
          Pendientes de validación: {pendingCerts} certificados y {pendingReceipts} constancias.{" "}
          <Link href="/panel/validaciones">Revisar</Link>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: "1rem" }}>
        <div className="card stat">
          <div className="label">Baterías visibles</div>
          <div className="value">{total}</div>
        </div>
        {(["EN_USO", "EN_SERVICIO", "SEGUNDA_VIDA", "BAJA_SOLICITADA", "RECICLADA"] as const).map((s) => (
          <Link key={s} href={`/panel/baterias?state=${s}`} className="card stat" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="label">{STATE_LABEL[s]}</div>
            <div className="value">{count(s)}</div>
          </Link>
        ))}
      </div>

      <div className="card">
        <h2>Actividad reciente</h2>
        {recent.length === 0 ? (
          <p className="muted">Sin eventos todavía.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Evento</th>
                  <th>Pasaporte</th>
                  <th>Organización</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDateTime(e.occurredAt)}</td>
                    <td>{EVENT_LABEL[e.type] ?? e.type}</td>
                    <td>
                      <Link className="mono" href={`/panel/baterias/${e.battery.id}`}>
                        {e.battery.passportId}
                      </Link>
                    </td>
                    <td>{e.organization?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
