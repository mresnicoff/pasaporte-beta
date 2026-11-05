import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { ROLE_LABEL, fmtDateTime } from "@/lib/labels";
import { appendAudit, verifyAuditChain } from "@/modules/audit/service";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ batteryId?: string }> }) {
  const actor = await getActor();
  const user = actor.user!;
  if (user.role !== "ENTIDAD_TECNICA" && user.role !== "AUTORIDAD") redirect("/panel");
  const { batteryId } = await searchParams;

  const [chain, entries] = await Promise.all([
    verifyAuditChain(),
    prisma.auditLog.findMany({
      where: batteryId ? { batteryId } : {},
      orderBy: { seq: "desc" },
      take: 200,
      include: { user: { select: { name: true, role: true } } },
    }),
  ]);
  await prisma.$transaction((tx) =>
    appendAudit(tx, actor, { action: "LECTURA_AUDITORIA", entity: "AuditLog", batteryId: batteryId ?? null }),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Auditoría</h1>
          <p className="muted">
            Cada escritura y cada lectura de nivel autoridad o interés legítimo queda registrada. Cada fila guarda el
            hash SHA-256 de la anterior.
          </p>
        </div>
        <a className="btn secondary" href={`/api/audit${batteryId ? `?batteryId=${batteryId}` : ""}`} target="_blank">
          Exportar JSON
        </a>
      </div>
      <div className={`alert ${chain.ok ? "success" : "error"}`} style={{ marginBottom: "1rem" }}>
        {chain.ok
          ? `Cadena verificada: ${chain.checked} filas íntegras.`
          : `Cadena alterada en la fila #${chain.brokenAtSeq}: ${chain.reason}. Filas verificadas antes de la falla: ${chain.checked}.`}
      </div>
      {batteryId && (
        <p>
          Filtrado por batería. <Link href="/panel/auditoria">Ver todo</Link>
        </p>
      )}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>IP</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={chain.brokenAtSeq === e.seq ? { background: "var(--danger-soft)" } : undefined}>
                  <td>{e.seq}</td>
                  <td>{fmtDateTime(e.occurredAt)}</td>
                  <td>
                    {e.user?.name ?? "—"}
                    {e.user && <div className="muted small">{ROLE_LABEL[e.user.role]}</div>}
                  </td>
                  <td>{e.action}</td>
                  <td>
                    {e.entity}
                    {e.batteryId && (
                      <div>
                        <Link className="small" href={`/panel/baterias/${e.batteryId}`}>
                          batería
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className="mono small">{e.ip ?? "—"}</td>
                  <td className="hash" style={{ maxWidth: 200 }}>
                    {e.hash.slice(0, 16)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
