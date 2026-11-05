import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/labels";

export default async function ValidationsPage() {
  const user = (await getSessionUser())!;
  if (user.role !== "ENTIDAD_TECNICA") redirect("/panel");
  const [certs, receipts] = await Promise.all([
    prisma.healthCertificate.findMany({
      where: { status: "PENDIENTE" },
      orderBy: { createdAt: "asc" },
      include: { workshop: { select: { name: true } }, battery: { select: { id: true, passportId: true } } },
    }),
    prisma.recyclerReceipt.findMany({
      where: { status: "PENDIENTE" },
      orderBy: { createdAt: "asc" },
      include: { recycler: { select: { name: true } }, battery: { select: { id: true, passportId: true } } },
    }),
  ]);

  return (
    <>
      <h1>Validaciones pendientes</h1>
      <p className="muted">Un certificado o una constancia solo tienen efecto en el pasaporte después de la validación del CENT.</p>
      <div className="card">
        <h2>Certificados de estado de salud ({certs.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cargado</th>
                <th>Pasaporte</th>
                <th>Taller</th>
                <th>SoH</th>
                <th>Reutilizable</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDateTime(c.createdAt)}</td>
                  <td className="mono">{c.battery.passportId}</td>
                  <td>{c.workshop.name}</td>
                  <td>{c.sohPercent}%</td>
                  <td>{c.reusable ? "Sí" : "No"}</td>
                  <td>
                    <Link className="btn secondary" href={`/panel/baterias/${c.battery.id}`}>
                      Revisar
                    </Link>
                  </td>
                </tr>
              ))}
              {certs.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Nada pendiente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>Constancias de reciclador ({receipts.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cargada</th>
                <th>Pasaporte</th>
                <th>Reciclador</th>
                <th>Manifiesto</th>
                <th>Masa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.createdAt)}</td>
                  <td className="mono">{r.battery.passportId}</td>
                  <td>{r.recycler.name}</td>
                  <td className="mono">{r.manifestNumber}</td>
                  <td>{r.receivedMassKg} kg</td>
                  <td>
                    <Link className="btn secondary" href={`/panel/baterias/${r.battery.id}`}>
                      Revisar
                    </Link>
                  </td>
                </tr>
              ))}
              {receipts.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Nada pendiente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
