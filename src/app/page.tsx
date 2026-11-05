import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { normalizePassportId } from "@/lib/passport-id";

async function lookup(formData: FormData) {
  "use server";
  const id = normalizePassportId(String(formData.get("id") ?? ""));
  if (id) redirect(`/p/${encodeURIComponent(id)}`);
}

export default async function Home() {
  const user = await getSessionUser();
  return (
    <main className="container narrow">
      <div className="hero" style={{ marginTop: "1.5rem" }}>
        <div className="small" style={{ opacity: 0.8 }}>
          ACARA · CENT UTN · Beta
        </div>
        <h1>Pasaporte digital de baterías</h1>
        <p>
          Cada batería de tracción tiene un pasaporte con su identificador, su código QR y el registro auditable de
          su ciclo de vida: venta, estado de salud, segunda vida y reciclaje.
        </p>
        <form action={lookup} className="actions" style={{ marginTop: "1rem" }}>
          <input name="id" placeholder="AR-BP-0042-000000001-X" aria-label="Identificador del pasaporte" required />
          <button className="secondary">Consultar pasaporte</button>
        </form>
      </div>
      <div className="grid grid-2" style={{ marginTop: "1rem" }}>
        <div className="card">
          <h2>Acceso de organizaciones</h2>
          <p className="muted">
            Fabricantes, concesionarios, talleres, CENT, recicladores y autoridades ingresan con teléfono y
            contraseña.
          </p>
          <Link className="btn" href={user ? "/panel" : "/login"}>
            {user ? "Ir al panel" : "Ingresar"}
          </Link>
        </div>
        <div className="card">
          <h2>Consulta pública</h2>
          <p className="muted">
            Escaneando el QR de la batería cualquier persona ve el modelo, la química, la capacidad, el fabricante,
            el estado y el último estado de salud certificado.
          </p>
        </div>
      </div>
    </main>
  );
}
