import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ApiForm } from "@/components/ApiForm";

export default async function SalePage() {
  const user = (await getSessionUser())!;
  if (user.role !== "CONCESIONARIO") redirect("/panel");
  return (
    <div className="narrow">
      <h1>Registrar venta</h1>
      <p className="muted">
        Escanee el QR o ingrese el GTIN y el número de serie de la batería (GTIN-SERIE) y los datos del vehículo. El sistema crea el vínculo y el
        evento de venta. No se registran datos del comprador.
      </p>
      <div className="card">
        <ApiForm action="/api/sales" submitLabel="Registrar venta" redirectTo="/panel/baterias/{batteryId}">
          <label>
            GTIN y número de serie (GTIN-SERIE)
            <input name="passportId" required className="mono" placeholder="07612345000011-VX602026001000" />
          </label>
          <div className="fields">
            <label>
              VIN
              <input name="vin" required minLength={17} maxLength={17} />
            </label>
            <label>
              Dominio (patente)
              <input name="domain" placeholder="AB123CD" />
            </label>
            <label>
              Marca
              <input name="brand" required />
            </label>
            <label>
              Modelo
              <input name="model" required />
            </label>
            <label>
              Año
              <input name="year" type="number" min={1990} max={2100} required defaultValue={new Date().getFullYear()} />
            </label>
            <label>
              Fecha de venta
              <input name="saleDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>
          </div>
        </ApiForm>
      </div>
    </div>
  );
}
