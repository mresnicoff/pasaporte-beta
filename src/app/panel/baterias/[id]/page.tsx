import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { getPassportDocument } from "@/modules/passport/projection";
import { PassportView } from "@/components/PassportView";
import { ApiForm } from "@/components/ApiForm";

export default async function BatteryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  const user = actor.user!;
  const battery = await prisma.battery.findUnique({ where: { id } });
  if (!battery) notFound();
  const result = await getPassportDocument(battery.passportId, actor);
  if (!result) notFound();

  const [pendingCert, pendingReceipt, validCert, operators] = await Promise.all([
    prisma.healthCertificate.findFirst({
      where: { batteryId: id, status: "PENDIENTE" },
      include: { workshop: { select: { name: true } } },
    }),
    prisma.recyclerReceipt.findFirst({
      where: { batteryId: id, status: "PENDIENTE" },
      include: { recycler: { select: { name: true } } },
    }),
    prisma.healthCertificate.findFirst({
      where: { batteryId: id, status: "VALIDADO", validUntil: { gt: new Date() } },
      orderBy: { reviewedAt: "desc" },
    }),
    prisma.organization.findMany({
      where: { operatorCode: { not: null } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const org = user.organizationId;
  const s = battery.state;
  const role = user.role;
  const ownIntervention = battery.serviceOrgId === org;
  const actions: React.ReactNode[] = [];

  if (role === "CONCESIONARIO" && s === "EN_USO" && (!battery.dealerOrgId || battery.dealerOrgId === org)) {
    actions.push(
      <ActionCard key="sell" title={battery.dealerOrgId ? "Recambio: asociar a otro vehículo" : "Registrar venta"}>
        <ApiForm
          action={`/api/batteries/${id}/link-vehicle`}
          submitLabel={battery.dealerOrgId ? "Asociar vehículo" : "Registrar venta"}
          successMessage="Vehículo asociado"
        >
          <VehicleFields withSaleDate={!battery.dealerOrgId} />
        </ApiForm>
      </ActionCard>,
    );
  }

  if (role === "TALLER") {
    if (s === "EN_USO") {
      actions.push(
        <ActionCard key="int" title="Registrar intervención de servicio">
          <ApiForm action={`/api/batteries/${id}/intervention`} submitLabel="Registrar intervención">
            <label>
              Motivo
              <input name="reason" required minLength={3} placeholder="Diagnóstico por pérdida de autonomía" />
            </label>
          </ApiForm>
        </ActionCard>,
      );
    }
    if (s === "EN_SERVICIO" && ownIntervention) {
      if (!pendingCert) {
        actions.push(
          <ActionCard key="cert" title="Cargar ensayo de estado de salud">
            <ApiForm
              action={`/api/batteries/${id}/health-certificates`}
              submitLabel="Enviar al CENT"
              multipart
              successMessage="Ensayo enviado. Queda pendiente de validación del CENT."
            >
              <div className="fields">
                <label>
                  Estado de salud (%)
                  <input name="sohPercent" type="number" step="0.1" min="0" max="100" required />
                </label>
                <label>
                  Capacidad medida (kWh)
                  <input name="measuredCapacityKwh" type="number" step="0.01" min="0" required />
                </label>
                <label>
                  Resistencia interna (mΩ)
                  <input name="internalResistanceMOhm" type="number" step="0.01" min="0" required />
                </label>
              </div>
              <label>
                Método de ensayo
                <input name="testMethod" required placeholder="Descarga completa a C/3, 25 °C (IEC 62660-1)" />
              </label>
              <label>
                Informe del ensayo (PDF o imagen)
                <input name="file" type="file" accept="application/pdf,image/png,image/jpeg" />
              </label>
              <label className="check">
                <input type="checkbox" name="reusable" value="true" /> La batería es apta para reutilización
              </label>
            </ApiForm>
          </ActionCard>,
        );
      } else {
        actions.push(
          <ActionCard key="certp" title="Ensayo en revisión">
            <p className="muted">El CENT todavía no validó el ensayo cargado.</p>
          </ActionCard>,
        );
      }
      actions.push(
        <ActionCard key="close" title="Cerrar intervención">
          <p className="muted small">Devuelve la batería a uso. Requiere un certificado validado en esta intervención.</p>
          <ApiForm action={`/api/batteries/${id}/close-intervention`} submitLabel="Cerrar intervención" variant="secondary">
            {null}
          </ApiForm>
        </ActionCard>,
      );
      actions.push(
        <ActionCard key="sv" title="Reclasificar a segunda vida">
          <p className="muted small">Requiere certificado validado y vigente que indique que es reutilizable.</p>
          <ApiForm
            action={`/api/batteries/${id}/second-life`}
            submitLabel="Reclasificar"
            redirectTo="/panel/baterias/{newBatteryId}"
            confirmText="Se creará un pasaporte nuevo vinculado al original. ¿Continuar?"
          >
            <label>
              Aplicación de segunda vida
              <input name="application" required placeholder="Almacenamiento estacionario" />
            </label>
            <label>
              Nuevo operador responsable
              <select name="newOperatorId" defaultValue={battery.operatorId}>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </ApiForm>
        </ActionCard>,
      );
    }
    if (["EN_USO", "EN_SERVICIO", "SEGUNDA_VIDA"].includes(s) && (!battery.serviceOrgId || ownIntervention)) {
      actions.push(
        <ActionCard key="baja" title="Solicitar baja">
          <p className="muted small">
            Requiere certificado validado que indique que la batería no es reutilizable.
            {validCert && !validCert.reusable ? " ✔ Disponible." : ""}
          </p>
          <ApiForm
            action={`/api/batteries/${id}/decommission`}
            submitLabel="Solicitar baja"
            variant="danger"
            confirmText="La baja deriva la batería al reciclador. ¿Continuar?"
          >
            <label>
              Motivo
              <input name="reason" required minLength={3} placeholder="Celdas degradadas, no reutilizable" />
            </label>
          </ApiForm>
        </ActionCard>,
      );
    }
  }

  if (role === "RECICLADOR" && s === "BAJA_SOLICITADA" && !pendingReceipt) {
    actions.push(
      <ActionCard key="rec" title="Registrar constancia de recepción">
        <ApiForm
          action={`/api/batteries/${id}/recycler-receipt`}
          submitLabel="Registrar recepción"
          multipart
          successMessage="Constancia registrada. El CENT debe validarla para cerrar el pasaporte."
        >
          <div className="fields">
            <label>
              Fecha de recepción
              <input name="receivedAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>
            <label>
              Masa recibida (kg)
              <input name="receivedMassKg" type="number" step="0.1" min="0.1" required />
            </label>
            <label>
              N.º de manifiesto (Ley 24.051)
              <input name="manifestNumber" required placeholder="MAN-2026-000123" />
            </label>
          </div>
          <label>
            Constancia escaneada
            <input name="file" type="file" accept="application/pdf,image/png,image/jpeg" />
          </label>
        </ApiForm>
      </ActionCard>,
    );
  }

  if (role === "ENTIDAD_TECNICA" && pendingCert) {
    actions.push(
      <ActionCard key="vc" title={`Validar ensayo de ${pendingCert.workshop.name}`}>
        <p>
          SoH <b>{pendingCert.sohPercent}%</b> · {pendingCert.measuredCapacityKwh} kWh ·{" "}
          {pendingCert.internalResistanceMOhm} mΩ · {pendingCert.testMethod} · Reutilizable:{" "}
          {pendingCert.reusable ? "Sí" : "No"}
          {pendingCert.fileUrl && (
            <>
              {" "}
              ·{" "}
              <a href={pendingCert.fileUrl} target="_blank">
                informe
              </a>
            </>
          )}
        </p>
        <ReviewForms action={`/api/health-certificates/${pendingCert.id}/validate`} />
      </ActionCard>,
    );
  }
  if (role === "ENTIDAD_TECNICA" && pendingReceipt) {
    actions.push(
      <ActionCard key="vr" title={`Validar constancia de ${pendingReceipt.recycler.name}`}>
        <p>
          Manifiesto <span className="mono">{pendingReceipt.manifestNumber}</span> · {pendingReceipt.receivedMassKg} kg
          {pendingReceipt.fileUrl && (
            <>
              {" "}
              ·{" "}
              <a href={pendingReceipt.fileUrl} target="_blank">
                constancia
              </a>
            </>
          )}
        </p>
        <ReviewForms action={`/api/recycler-receipts/${pendingReceipt.id}/validate`} approveLabel="Validar y cerrar pasaporte" />
      </ActionCard>,
    );
  }

  return (
    <>
      <PassportView doc={result.doc} level={result.level} linkBase="/p" />
      {actions.length > 0 && (
        <>
          <h2 style={{ marginTop: "1.5rem" }}>Acciones disponibles</h2>
          <div className="grid grid-2">{actions}</div>
        </>
      )}
    </>
  );
}

function ActionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function ReviewForms({ action, approveLabel = "Validar" }: { action: string; approveLabel?: string }) {
  return (
    <div className="grid grid-2">
      <ApiForm action={action} submitLabel={approveLabel} extra={{ approve: "true" }} successMessage="Validado">
        {null}
      </ApiForm>
      <ApiForm action={action} submitLabel="Rechazar" variant="danger" extra={{ approve: "false" }} successMessage="Rechazado">
        <label>
          Motivo del rechazo
          <input name="reason" required minLength={3} />
        </label>
      </ApiForm>
    </div>
  );
}

function VehicleFields({ withSaleDate }: { withSaleDate?: boolean }) {
  return (
    <div className="fields">
      <label>
        VIN
        <input name="vin" required minLength={17} maxLength={17} placeholder="17 caracteres" />
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
      {withSaleDate && (
        <label>
          Fecha de venta
          <input name="saleDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
      )}
    </div>
  );
}
