import { requireActor } from "@/lib/auth";
import { idempotent, readBody, route } from "@/lib/http";
import { healthCertificateSchema } from "@/lib/validation";
import { uploadHealthCertificate } from "@/modules/certificates/service";

/** Carga un ensayo de estado de salud (queda pendiente de validación del CENT). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const actor = await requireActor(["TALLER"]);
  const { fields, files } = await readBody(req);
  const input = healthCertificateSchema.parse(fields);
  return idempotent(req, actor.user, async () => {
    const r = await uploadHealthCertificate(actor, id, input, files.file);
    return { status: 201, body: { id: r.id, status: r.status } };
  });
});
