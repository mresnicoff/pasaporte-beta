import { notFound, redirect } from "next/navigation";
import { publicPath } from "@/lib/passport-id";

/** Compatibilidad: /p/{GTIN}-{SERIE} redirige a la dirección pública /01/{GTIN}/21/{serie}. */
export default async function LegacyPassportRedirect({ params }: { params: Promise<{ passportId: string }> }) {
  const path = publicPath(decodeURIComponent((await params).passportId));
  if (!path) notFound();
  redirect(path);
}
