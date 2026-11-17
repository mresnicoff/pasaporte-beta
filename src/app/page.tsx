import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { normalizePassportId, publicPath } from "@/lib/passport-id";

async function lookup(formData: FormData) {
  "use server";
  const raw = String(formData.get("id") ?? "");
  const path = publicPath(normalizePassportId(raw));
  if (!path) notFound();
  redirect(path);
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
          Cada batería de tracción tiene un pasaporte identificado por el GTIN de su modelo y su número de serie, con su código QR y el registro auditable de
          su ciclo de vida: venta, estado de salud, segunda vida y reciclaje.
        </p>
        <form action={lookup} className="actions" style={{ marginTop: "1rem" }}>
          <input name="id" placeholder="GTIN-SERIE, por ejemplo 07612345000011-VX602026001000" aria-label="Identificador del pasaporte (GTIN y número de serie)" required />
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
