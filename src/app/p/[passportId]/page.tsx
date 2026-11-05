import Link from "next/link";
import { notFound } from "next/navigation";
import { getActor } from "@/lib/auth";
import { isValidPassportId, normalizePassportId } from "@/lib/passport-id";
import { getPassportDocument } from "@/modules/passport/projection";
import { PassportView } from "@/components/PassportView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ passportId: string }> }) {
  return { title: `Pasaporte ${decodeURIComponent((await params).passportId)}` };
}

/** Página pública del pasaporte (destino del QR). El contenido depende del nivel de acceso. */
export default async function PublicPassportPage({ params }: { params: Promise<{ passportId: string }> }) {
  const id = normalizePassportId(decodeURIComponent((await params).passportId));
  const actor = await getActor();
  const result = isValidPassportId(id) ? await getPassportDocument(id, actor) : null;
  if (!result) notFound();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">PB</span> Pasaporte de Baterías
          </Link>
          <div className="nav" />
          <div className="userbox">
            {actor.user ? (
              <Link href={`/panel/baterias/${result.battery.id}`}>Abrir en el panel</Link>
            ) : (
              <Link href={`/login?next=/p/${id}`}>Ingresar</Link>
            )}
          </div>
        </div>
      </header>
      <main className="container">
        <PassportView doc={result.doc} level={result.level} />
        <p className="muted small">
          Beta con datos sintéticos. Pasaporte administrado por el CENT (UTN) con financiamiento de ACARA.
        </p>
      </main>
    </>
  );
}
