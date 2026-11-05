import { requireActor } from "@/lib/auth";
import { idempotent, readBody, route } from "@/lib/http";
import { decommissionSchema } from "@/lib/validation";
import { requestDecommission } from "@/modules/batteries/service";

/** Solicitud de baja. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const actor = await requireActor(["TALLER"]);
  const input = decommissionSchema.parse((await readBody(req)).fields);
  return idempotent(req, actor.user, async () => {
    const r = await requestDecommission(actor, id, input);
    return { status: 201, body: { event: r.event.type, state: r.battery.state } };
  });
});
