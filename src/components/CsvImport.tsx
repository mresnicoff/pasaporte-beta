"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Report = {
  total: number;
  created: number;
  failed: number;
  rows: { row: number; ok: boolean; serialNumber?: string; passportId?: string; errors?: string[] }[];
};

export function CsvImport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/batteries/import", { method: "POST", body: new FormData(e.currentTarget) });
      const data = await res.json();
      if (!res.ok) setError(data.message ?? "Error al importar");
      else {
        setReport(data);
        router.refresh();
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="stack" onSubmit={onSubmit}>
        <label>
          Archivo CSV (columnas: modelo, numero_serie, fecha_fabricacion)
          <input type="file" name="file" accept=".csv,text/csv" required />
        </label>
        <div className="actions">
          <button disabled={busy}>{busy ? "Procesando…" : "Importar"}</button>
          <a className="btn secondary" href="/plantilla-baterias.csv" download>
            Descargar plantilla
          </a>
        </div>
      </form>
      {error && <div className="alert error" style={{ marginTop: "0.75rem" }}>{error}</div>}
      {report && (
        <div style={{ marginTop: "1rem" }}>
          <div className={`alert ${report.failed ? "warn" : "success"}`}>
            {report.created} de {report.total} filas registradas · {report.failed} con errores
          </div>
          <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>N.º de serie</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td className="mono">{r.serialNumber || "—"}</td>
                    <td>
                      {r.ok ? (
                        <span className="badge ok">{r.passportId}</span>
                      ) : (
                        <span style={{ color: "var(--danger)" }}>{r.errors?.join("; ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
