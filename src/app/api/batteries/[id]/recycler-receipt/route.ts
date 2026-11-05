import { requireActor } from "@/lib/auth";
import { idempotent, readBody, route } from "@/lib/http";
import { recyclerReceiptSchema } from "@/lib/validation";
import { createRecyclerReceipt } from "@/modules/certificates/service";

/** El reciclador registra la constancia; el CENT la valida y eso cierra el pasaporte. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const actor = await requireActor(["RECICLADOR"]);
  const { fields, files } = await readBody(req);
  const input = recyclerReceiptSchema.parse(fields);
  return idempotent(req, actor.user, async () => {
    const r = await createRecyclerReceipt(actor, id, input, files.file);
    return { status: 201, body: { id: r.id, status: r.status } };
  });
});
