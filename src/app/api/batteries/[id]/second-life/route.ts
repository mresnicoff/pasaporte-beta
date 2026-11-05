import { requireActor } from "@/lib/auth";
import { idempotent, readBody, route } from "@/lib/http";
import { secondLifeSchema } from "@/lib/validation";
import { requestSecondLife } from "@/modules/batteries/service";

/** Reclasificación a segunda vida: crea un pasaporte nuevo vinculado al original. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const actor = await requireActor(["TALLER"]);
  const input = secondLifeSchema.parse((await readBody(req)).fields);
  return idempotent(req, actor.user, async () => {
    const r = await requestSecondLife(actor, id, input);
    return { status: 201, body: { originalState: r.original.state, newBatteryId: r.secondLife.id, newPassportId: r.secondLife.passportId } };
  });
});
