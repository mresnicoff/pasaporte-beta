import Link from "next/link";
import type { BatteryState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { STATE_LABEL, fmtDate } from "@/lib/labels";
import { visibleBatteriesWhere } from "@/modules/batteries/service";

const PAGE = 50;
const STATES = Object.keys(STATE_LABEL) as BatteryState[];

export default async function BatteriesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; q?: string; page?: string; nf?: string }>;
}) {
  const user = (await getSessionUser())!;
  const sp = await searchParams;
  const state = STATES.includes(sp.state as BatteryState) ? (sp.state as BatteryState) : undefined;
  const q = sp.q?.trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.BatteryWhereInput = {
    AND: [
      visibleBatteriesWhere(user),
      state ? { state } : {},
      q
        ? {
            OR: [
              { passportId: { contains: q.toUpperCase() } },
              { serialNumber: { contains: q, mode: "insensitive" } },
              { model: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.battery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        model: { select: { brand: true, name: true, chemistry: true } },
        operator: { select: { name: true } },
        healthCertificates: {
          where: { status: "VALIDADO" },
          orderBy: { reviewedAt: "desc" },
          take: 1,
          select: { sohPercent: true },
        },
      },
    }),
    prisma.battery.count({ where }),
  ]);
  const qs = (p: number) =>
    `?${new URLSearchParams({ ...(state ? { state } : {}), ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Baterías</h1>
          <p className="muted">{total} resultados</p>
        </div>
        <form className="actions">
          <input name="q" defaultValue={q} placeholder="Identificador, serie o modelo" />
          <select name="state" defaultValue={state ?? ""}>
            <option value="">Todos los estados</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABEL[s]}
              </option>
            ))}
          </select>
          <button>Filtrar</button>
        </form>
      </div>
      {sp.nf && <div className="alert warn" style={{ marginBottom: "1rem" }}>No se encontró una batería con «{q}».</div>}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pasaporte</th>
                <th>Modelo</th>
                <th>Operador</th>
                <th>Fabricación</th>
                <th>SoH</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link className="mono" href={`/panel/baterias/${b.id}`}>
                      {b.passportId}
                    </Link>
                    <div className="muted small">{b.serialNumber}</div>
                  </td>
                  <td>
                    {b.model.brand} {b.model.name}
                    <div className="muted small">{b.model.chemistry}</div>
                  </td>
                  <td>{b.operator.name}</td>
                  <td>{fmtDate(b.manufactureDate)}</td>
                  <td>{b.healthCertificates[0] ? `${b.healthCertificates[0].sohPercent}%` : "—"}</td>
                  <td>
                    <span className={`badge ${b.state}`}>{STATE_LABEL[b.state]}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No hay baterías para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE && (
          <div className="actions" style={{ marginTop: "0.75rem" }}>
            {page > 1 && (
              <Link className="btn secondary" href={qs(page - 1)}>
                Anterior
              </Link>
            )}
            <span className="muted small">
              Página {page} de {Math.ceil(total / PAGE)}
            </span>
            {page * PAGE < total && (
              <Link className="btn secondary" href={qs(page + 1)}>
                Siguiente
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}
