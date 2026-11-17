import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiForm } from "@/components/ApiForm";
import { CsvImport } from "@/components/CsvImport";

export default async function AltaPage() {
  const user = (await getSessionUser())!;
  if (user.role !== "OPERADOR" && user.role !== "CONCESIONARIO") redirect("/panel");
  const isOperator = user.role === "OPERADOR";
  const models = await prisma.batteryModel.findMany({
    where: isOperator ? { operatorId: user.organizationId } : {},
    include: { operator: { select: { name: true } }, _count: { select: { batteries: true } } },
    orderBy: [{ operator: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isOperator ? "Modelos y alta de baterías" : "Alta de baterías"}</h1>
          <p className="muted">El identificador de cada batería es el GTIN de su modelo más el número de serie impresos en la etiqueta. El sistema no los genera.</p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Alta individual</h2>
          {models.length === 0 ? (
            <p className="muted">Primero cargue un modelo de batería.</p>
          ) : (
            <ApiForm
              action="/api/batteries"
              submitLabel="Dar de alta"
              redirectTo="/panel/baterias/{id}"
            >
              <label>
                Modelo
                <select name="modelId" required>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {isOperator ? "" : `${m.operator.name} · `}
                      {m.brand} {m.name} · GTIN {m.gtin} ({m.nominalCapacityKwh} kWh, {m.chemistry})
                    </option>
                  ))}
                </select>
              </label>
              <div className="fields">
                <label>
                  Número de serie (como figura en la etiqueta)
                  <input name="serialNumber" required maxLength={20} pattern="[A-Za-z0-9]{1,20}" title="Hasta 20 letras o dígitos, sin espacios" />
                </label>
                <label>
                  Fecha de fabricación
                  <input name="manufactureDate" type="date" required />
                </label>
              </div>
            </ApiForm>
          )}
        </div>

        {isOperator && (
          <div className="card">
            <h2>Alta masiva por CSV</h2>
            <p className="muted small">
              Las filas válidas se registran y las inválidas se informan con su número de fila. Fechas en formato
              AAAA-MM-DD.
            </p>
            <CsvImport />
          </div>
        )}
      </div>

      {isOperator && (
        <div className="grid grid-2">
          <div className="card">
            <h2>Nuevo modelo</h2>
            <ApiForm action="/api/models" submitLabel="Guardar modelo" multipart successMessage="Modelo {name} creado">
              <div className="fields">
                <label>
                  GTIN del modelo (8 a 14 dígitos)
                  <input name="gtin" required inputMode="numeric" pattern="[0-9]{8,14}" className="mono" placeholder="07612345000011" />
                </label>
                <label>
                  Marca
                  <input name="brand" required defaultValue={user.organization.name.split(" ")[0]} />
                </label>
                <label>
                  Nombre del modelo
                  <input name="name" required />
                </label>
                <label>
                  Química
                  <select name="chemistry" defaultValue="LFP">
                    <option>LFP</option>
                    <option>NMC</option>
                    <option>NCA</option>
                    <option>LMO</option>
                    <option>LTO</option>
                    <option>Sodio-ion</option>
                  </select>
                </label>
                <label>
                  Capacidad nominal (kWh)
                  <input name="nominalCapacityKwh" type="number" step="0.1" required />
                </label>
                <label>
                  Tensión nominal (V)
                  <input name="nominalVoltageV" type="number" step="0.1" required />
                </label>
                <label>
                  Masa (kg)
                  <input name="massKg" type="number" step="0.1" required />
                </label>
                <label>
                  Huella de carbono (kg CO₂e, opcional)
                  <input name="carbonFootprintKgCo2e" type="number" step="1" />
                </label>
              </div>
              <label>
                Instrucciones de desmontaje y seguridad (PDF)
                <input name="dismantlingFile" type="file" accept="application/pdf" />
              </label>
            </ApiForm>
          </div>
          <div className="card">
            <h2>Modelos registrados</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>GTIN</th>
                    <th>Química</th>
                    <th>kWh</th>
                    <th>Unidades</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {m.brand} {m.name}
                      </td>
                      <td className="mono">{m.gtin}</td>
                      <td>{m.chemistry}</td>
                      <td>{m.nominalCapacityKwh}</td>
                      <td>{m._count.batteries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
