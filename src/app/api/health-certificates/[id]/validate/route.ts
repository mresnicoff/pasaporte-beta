import { requireActor } from "@/lib/auth";
import { idempotent, readBody, route } from "@/lib/http";
import { reviewSchema } from "@/lib/validation";
import { reviewHealthCertificate } from "@/modules/certificates/service";

/** El CENT valida o rechaza (con motivo) un certificado de estado de salud. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const actor = await requireActor(["ENTIDAD_TECNICA"]);
  const input = reviewSchema.parse((await readBody(req)).fields);
  return idempotent(req, actor.user, async () => {
    const r = await reviewHealthCertificate(actor, id, input);
    return { status: 200, body: { id: r.id, status: r.status, validUntil: r.validUntil } };
  });
});
