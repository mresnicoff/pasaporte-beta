import Link from "next/link";
import { notFound } from "next/navigation";
import { getActor } from "@/lib/auth";
import { buildPassportId, parseIdentifier } from "@/lib/passport-id";
import { getPassportDocument } from "@/modules/passport/projection";
import { PassportView } from "@/components/PassportView";

export const dynamic = "force-dynamic";

type Params = Promise<{ gtin: string; serial: string }>;

function idFrom({ gtin, serial }: { gtin: string; serial: string }) {
  const p = parseIdentifier(`/01/${gtin}/21/${serial}`);
  return p ? buildPassportId(p.gtin, p.serial) : null;
}

export async function generateMetadata({ params }: { params: Params }) {
  const { gtin, serial } = await params;
  return { title: `Pasaporte ${gtin} · ${decodeURIComponent(serial)}` };
}

/** Página pública del pasaporte (destino del QR): /01/{GTIN}/21/{serie}. El contenido depende del nivel de acceso. */
export default async function PublicPassportPage({ params }: { params: Params }) {
  const id = idFrom(await params);
  const actor = await getActor();
  const result = id ? await getPassportDocument(id, actor) : null;
  if (!result || !id) notFound();

  const here = `/01/${result.doc.gtin}/21/${encodeURIComponent(String(parseIdentifier(id)!.serial))}`;
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
              <Link href={`/login?next=${here}`}>Ingresar</Link>
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
