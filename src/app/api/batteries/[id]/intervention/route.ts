import { requireActor } from "@/lib/auth";
import { idempotent, readBody, route } from "@/lib/http";
import { interventionSchema } from "@/lib/validation";
import { startIntervention } from "@/modules/batteries/service";

/** El taller registra una intervención de servicio (EN_USO -> EN_SERVICIO). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const actor = await requireActor(["TALLER"]);
  const input = interventionSchema.parse((await readBody(req)).fields);
  return idempotent(req, actor.user, async () => {
    const r = await startIntervention(actor, id, input);
    return { status: 201, body: { event: r.event.type, state: r.battery.state } };
  });
});
