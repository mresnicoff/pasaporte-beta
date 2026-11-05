import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { STATE_LABEL } from "@/lib/labels";
import { getFleetStats } from "@/modules/stats/service";

function Bars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div>
      {items.map((i) => (
        <div className="bar-row" key={i.label}>
          <span>{i.label}</span>
          <div className="bar">
            <span style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
          <span style={{ textAlign: "right" }}>{i.value}</span>
        </div>
      ))}
    </div>
  );
}

export default async function ObservatoryPage() {
  const user = (await getSessionUser())!;
  if (user.role !== "ENTIDAD_TECNICA" && user.role !== "AUTORIDAD") redirect("/panel");
  const s = await getFleetStats();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Observatorio del parque</h1>
          <p className="muted">Estadísticas anonimizadas: no incluyen VIN, dominio ni números de serie.</p>
        </div>
        <a className="btn secondary" href="/api/stats?download=1">
          Exportar JSON
        </a>
      </div>
      <div className="grid grid-4" style={{ marginBottom: "1rem" }}>
        <div className="card stat">
          <div className="label">Baterías registradas</div>
          <div className="value">{s.totalBatteries}</div>
        </div>
        <div className="card stat">
          <div className="label">SoH promedio certificado</div>
          <div className="value">{s.stateOfHealth.averagePercent ?? "—"}%</div>
        </div>
        <div className="card stat">
          <div className="label">Certificados validados</div>
          <div className="value">{s.certificates.VALIDADO ?? 0}</div>
        </div>
        <div className="card stat">
          <div className="label">Masa reciclada</div>
          <div className="value">{s.recycling.recoveredMassKg} kg</div>
        </div>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h2>Por estado</h2>
          <Bars
            items={(Object.keys(STATE_LABEL) as (keyof typeof STATE_LABEL)[]).map((k) => ({
              label: STATE_LABEL[k],
              value: s.byState[k] ?? 0,
            }))}
          />
        </div>
        <div className="card">
          <h2>Estado de salud (último certificado)</h2>
          <Bars items={s.stateOfHealth.distribution.map((d) => ({ label: `${d.bucket} %`, value: d.count }))} />
        </div>
        <div className="card">
          <h2>Por química</h2>
          <Bars items={s.byChemistry.map((c) => ({ label: c.chemistry, value: c.count }))} />
          <p className="muted small">
            Capacidad nominal total:{" "}
            {s.byChemistry.reduce((a, c) => a + c.nominalCapacityKwh, 0).toLocaleString("es-AR")} kWh
          </p>
        </div>
        <div className="card">
          <h2>Por operador responsable</h2>
          <Bars items={s.byOperator.map((o) => ({ label: o.operator, value: o.count }))} />
        </div>
        <div className="card">
          <h2>Por año de fabricación</h2>
          <Bars items={s.byManufactureYear.map((y) => ({ label: String(y.year), value: y.count }))} />
        </div>
      </div>
    </>
  );
}
