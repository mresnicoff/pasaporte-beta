import { getActor } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { json, route } from "@/lib/http";
import { buildPassportId, parseIdentifier } from "@/lib/passport-id";
import { rateLimit } from "@/lib/rate-limit";
import { getPassportDocument } from "@/modules/passport/projection";

/** Documento JSON del pasaporte para /01/{GTIN}/21/{serie}, filtrado según el nivel de acceso del solicitante. */
export const GET = route<{ gtin: string; serial: string }>(async (_req, { params }) => {
  const actor = await getActor();
  if (!actor.user) rateLimit(`public:${actor.ip}`, 120, 60_000);
  const { gtin, serial } = await params;
  const p = parseIdentifier(`/01/${gtin}/21/${serial}`);
  const result = p ? await getPassportDocument(buildPassportId(p.gtin, p.serial), actor) : null;
  if (!result) throw notFound("Pasaporte inexistente");
  return json(result.doc);
});
