import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ORG_TYPE_LABEL } from "@/lib/labels";
import { ApiForm } from "@/components/ApiForm";

export default async function OrganizationsPage() {
  const user = (await getSessionUser())!;
  if (user.role !== "ENTIDAD_TECNICA" && user.role !== "AUTORIDAD") redirect("/panel");
  const orgs = await prisma.organization.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });
  const canEdit = user.role === "ENTIDAD_TECNICA";

  return (
    <>
      <h1>Organizaciones</h1>
      <p className="muted">El CENT habilita talleres y recicladores. Una organización suspendida no puede registrar eventos.</p>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organización</th>
                <th>Tipo</th>
                <th>CUIT</th>
                <th>Cód. operador</th>
                <th>Usuarios</th>
                <th>Estado</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{ORG_TYPE_LABEL[o.type]}</td>
                  <td className="mono">{o.cuit}</td>
                  <td className="mono">{o.operatorCode ?? "—"}</td>
                  <td>{o._count.users}</td>
                  <td>
                    <span className={`badge ${o.enabled ? "ok" : "fail"}`}>{o.enabled ? "Habilitada" : "No habilitada"}</span>
                  </td>
                  {canEdit && (
                    <td>
                      {(o.type === "TALLER" || o.type === "RECICLADOR") && (
                        <ApiForm
                          action={`/api/organizations/${o.id}/enable`}
                          extra={{ enabled: String(!o.enabled) }}
                          submitLabel={o.enabled ? "Suspender" : "Habilitar"}
                          variant={o.enabled ? "danger" : "primary"}
                        >
                          {null}
                        </ApiForm>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
