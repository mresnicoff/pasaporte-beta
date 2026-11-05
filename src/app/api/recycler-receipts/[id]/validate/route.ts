import { requireActor } from "@/lib/auth";
import { idempotent, readBody, route } from "@/lib/http";
import { reviewSchema } from "@/lib/validation";
import { reviewRecyclerReceipt } from "@/modules/certificates/service";

/** El CENT valida la constancia del reciclador; si la aprueba, el pasaporte pasa a RECICLADA. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const actor = await requireActor(["ENTIDAD_TECNICA"]);
  const input = reviewSchema.parse((await readBody(req)).fields);
  return idempotent(req, actor.user, async () => {
    const r = await reviewRecyclerReceipt(actor, id, input);
    return { status: 200, body: { id: r.receipt.id, status: r.receipt.status, batteryState: r.battery.state } };
  });
});
