import { getActor } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { json, route } from "@/lib/http";
import { normalizePassportId } from "@/lib/passport-id";
import { rateLimit } from "@/lib/rate-limit";
import { getPassportDocument } from "@/modules/passport/projection";

/** Documento JSON del pasaporte, filtrado según el nivel de acceso del solicitante. */
export const GET = route<{ passportId: string }>(async (_req, { params }) => {
  const actor = await getActor();
  if (!actor.user) rateLimit(`public:${actor.ip}`, 120, 60_000);
  const { passportId } = await params;
  const result = await getPassportDocument(normalizePassportId(decodeURIComponent(passportId)), actor);
  if (!result) throw notFound("Pasaporte inexistente");
  return json(result.doc);
});
