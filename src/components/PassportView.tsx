import Link from "next/link";
import { EVENT_LABEL, REVIEW_LABEL, STATE_LABEL, fmtDate, fmtDateTime } from "@/lib/labels";
import { ACCESS_LEVEL_LABEL, type AccessLevel } from "@/modules/passport/projection";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

/** Vista del pasaporte. Solo muestra los bloques que trae el documento ya proyectado por nivel. */
export function PassportView({ doc, level, linkBase = "/p" }: { doc: Doc; level: AccessLevel; linkBase?: string }) {
  const m = doc.model;
  return (
    <>
      <div className="card">
        <div className="passport-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/qr/${doc.passportId}`} alt={`Código QR del pasaporte ${doc.passportId}`} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="muted small">Pasaporte digital de batería</div>
            <h1 className="mono" style={{ fontSize: "1.25rem", overflowWrap: "anywhere" }}>
              {doc.passportId}
            </h1>
            <p>
              {m.brand} {m.name} · {doc.manufacturer}
            </p>
            <div className="actions">
              <span className={`badge ${doc.state}`}>{STATE_LABEL[doc.state as keyof typeof STATE_LABEL]}</span>
              <span className="badge">Nivel de acceso: {ACCESS_LEVEL_LABEL[level]}</span>
            </div>
          </div>
          <div style={{ textAlign: "center", minWidth: 140 }}>
            {doc.lastHealth ? (
              <>
                <div className="soh">{doc.lastHealth.sohPercent}%</div>
                <div className="muted small">Estado de salud certificado</div>
                <div className="muted small">Vigente hasta {fmtDate(doc.lastHealth.validUntil)}</div>
              </>
            ) : (
              <div className="muted small">Sin certificado de estado de salud validado</div>
            )}
          </div>
        </div>
        {(doc.previousPassportId || doc.nextPassportId) && (
          <div className="alert info" style={{ marginTop: "1rem" }}>
            {doc.previousPassportId && (
              <>
                Pasaporte de segunda vida. Original:{" "}
                <Link className="mono" href={`${linkBase}/${doc.previousPassportId}`}>
                  {doc.previousPassportId}
                </Link>
              </>
            )}
            {doc.nextPassportId && (
              <>
                Esta batería fue reclasificada a segunda vida. Nuevo pasaporte:{" "}
                <Link className="mono" href={`${linkBase}/${doc.nextPassportId}`}>
                  {doc.nextPassportId}
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Datos generales</h2>
          <dl className="kv">
            <dt>Fabricante / operador</dt>
            <dd>{doc.manufacturer}</dd>
            <dt>Marca y modelo</dt>
            <dd>
              {m.brand} {m.name}
            </dd>
            <dt>Química</dt>
            <dd>{m.chemistry}</dd>
            <dt>Capacidad nominal</dt>
            <dd>{m.nominalCapacityKwh} kWh</dd>
            <dt>Tensión nominal</dt>
            <dd>{m.nominalVoltageV} V</dd>
            <dt>Masa</dt>
            <dd>{m.massKg} kg</dd>
            {m.carbonFootprintKgCo2e != null && (
              <>
                <dt>Huella de carbono</dt>
                <dd>{m.carbonFootprintKgCo2e} kg CO₂e</dd>
              </>
            )}
            <dt>Año de fabricación</dt>
            <dd>{doc.manufactureYear}</dd>
          </dl>
          <div className="actions" style={{ marginTop: "1rem" }}>
            <a className="btn secondary" href={`/api/batteries/${doc.passportId}/certificate.pdf`} target="_blank">
              Certificado PDF
            </a>
            <a className="btn ghost" href={`/api/p/${doc.passportId}`} target="_blank">
              Ver JSON
            </a>
          </div>
        </div>

        {level !== "PUBLICO" && (
          <div className="card">
            <h2>Unidad y vehículo</h2>
            <dl className="kv">
              <dt>Número de serie</dt>
              <dd className="mono">{doc.serialNumber}</dd>
              <dt>Fecha de fabricación</dt>
              <dd>{fmtDate(doc.manufactureDate)}</dd>
              <dt>Vehículo actual</dt>
              <dd>
                {doc.vehicle ? (
                  <>
                    {doc.vehicle.brand} {doc.vehicle.model} ({doc.vehicle.year})
                    <br />
                    <span className="mono small">VIN {doc.vehicle.vin}</span>
                    <br />
                    <span className="mono small">Dominio {doc.vehicle.domain ?? "—"}</span>
                    <br />
                    <span className="muted small">Desde {fmtDate(doc.vehicle.since)}</span>
                  </>
                ) : (
                  "Sin vehículo asociado"
                )}
              </dd>
              <dt>Desmontaje y seguridad</dt>
              <dd>
                {doc.dismantlingInstructionsUrl ? (
                  <a href={doc.dismantlingInstructionsUrl} target="_blank">
                    Instrucciones del fabricante
                  </a>
                ) : (
                  "No cargadas"
                )}
              </dd>
            </dl>
          </div>
        )}
      </div>

      {level !== "PUBLICO" && (
        <div className="card">
          <h2>Ensayos de estado de salud</h2>
          {doc.healthCertificates?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Taller</th>
                    <th>SoH</th>
                    <th>Capacidad</th>
                    <th>R. interna</th>
                    <th>Método</th>
                    <th>Reutilizable</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.healthCertificates.map((c: Doc) => (
                    <tr key={c.id}>
                      <td>{fmtDate(c.createdAt)}</td>
                      <td>{c.workshop}</td>
                      <td>
                        <b>{c.sohPercent}%</b>
                      </td>
                      <td>{c.measuredCapacityKwh} kWh</td>
                      <td>{c.internalResistanceMOhm} mΩ</td>
                      <td>
                        {c.testMethod}
                        {c.fileUrl && (
                          <>
                            {" "}
                            ·{" "}
                            <a href={c.fileUrl} target="_blank">
                              adjunto
                            </a>
                          </>
                        )}
                      </td>
                      <td>{c.reusable ? "Sí" : "No"}</td>
                      <td>
                        <span className={`badge ${c.status}`}>{REVIEW_LABEL[c.status as "VALIDADO"]}</span>
                        {c.rejectionReason && <div className="small muted">{c.rejectionReason}</div>}
                        {c.validUntil && <div className="small muted">Vence {fmtDate(c.validUntil)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Sin ensayos registrados.</p>
          )}
        </div>
      )}

      {level === "AUTORIDAD" && (
        <>
          <div className="grid grid-2">
            <div className="card">
              <h2>Historial de vehículos</h2>
              {doc.vehicleHistory?.length ? (
                <ul className="timeline">
                  {doc.vehicleHistory.map((v: Doc, i: number) => (
                    <li key={i}>
                      <b>
                        {v.brand} {v.model}
                      </b>{" "}
                      <span className="mono small">
                        {v.domain ?? "—"} · {v.vin}
                      </span>
                      <div className="muted small">
                        {fmtDate(v.from)} → {v.to ? fmtDate(v.to) : "actual"}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Nunca estuvo asociada a un vehículo.</p>
              )}
            </div>
            <div className="card">
              <h2>Constancias del reciclador</h2>
              {doc.recyclerReceipts?.length ? (
                <ul className="timeline">
                  {doc.recyclerReceipts.map((r: Doc) => (
                    <li key={r.id}>
                      <b>{r.recycler}</b> · manifiesto <span className="mono">{r.manifestNumber}</span>
                      <div className="small">
                        Recibida {fmtDate(r.receivedAt)} · {r.receivedMassKg} kg{" "}
                        <span className={`badge ${r.status}`}>{REVIEW_LABEL[r.status as "VALIDADO"]}</span>
                      </div>
                      {r.rejectionReason && <div className="small muted">{r.rejectionReason}</div>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Sin constancias.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="page-head" style={{ marginBottom: "0.5rem" }}>
              <h2 style={{ margin: 0 }}>Historial de eventos</h2>
              <span className={`badge ${doc.eventChain?.ok ? "ok" : "fail"}`}>
                {doc.eventChain?.ok
                  ? `Cadena íntegra (${doc.eventChain.checked} eventos)`
                  : `Cadena alterada en el evento ${doc.eventChain?.brokenAtSeq}: ${doc.eventChain?.reason}`}
              </span>
            </div>
            <ul className="timeline">
              {doc.events?.map((e: Doc) => (
                <li key={e.seq}>
                  <b>{EVENT_LABEL[e.type] ?? e.type}</b>{" "}
                  <span className="muted small">
                    #{e.seq} · {fmtDateTime(e.occurredAt)} · {e.organization ?? "—"}
                    {e.actor ? ` (${e.actor})` : ""}
                  </span>
                  <EventData data={e.data} />
                  <div className="hash">{e.hash}</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

const DATA_LABEL: Record<string, string> = {
  reason: "Motivo",
  vin: "VIN",
  domain: "Dominio",
  saleDate: "Fecha de venta",
  sohPercent: "SoH %",
  reusable: "Reutilizable",
  application: "Aplicación",
  newOperator: "Nuevo operador",
  manifestNumber: "Manifiesto",
  receivedMassKg: "Masa recibida (kg)",
  previousPassportId: "Pasaporte original",
  passportId: "Pasaporte",
  serialNumber: "N.º de serie",
  model: "Modelo",
  workshop: "Taller",
  validUntil: "Vigencia",
};

function EventData({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {}).filter(([k, v]) => DATA_LABEL[k] && v !== null && v !== "");
  if (!entries.length) return null;
  return (
    <div className="small">
      {entries.map(([k, v]) => (
        <span key={k} style={{ marginRight: "0.9rem" }}>
          <span className="muted">{DATA_LABEL[k]}:</span>{" "}
          {typeof v === "boolean"
            ? v
              ? "Sí"
              : "No"
            : /Date|validUntil/.test(k)
              ? fmtDate(String(v))
              : String(v)}
        </span>
      ))}
    </div>
  );
}
