import { requireActor } from "@/lib/auth";
import { idempotent, route } from "@/lib/http";
import { closeIntervention } from "@/modules/batteries/service";

/** Cierra la intervención con certificado validado (EN_SERVICIO -> EN_USO). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const actor = await requireActor(["TALLER"]);
  return idempotent(req, actor.user, async () => {
    const r = await closeIntervention(actor, id);
    return { status: 201, body: { event: r.event.type, state: r.battery.state } };
  });
});
