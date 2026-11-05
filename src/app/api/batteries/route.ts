import { requireActor } from "@/lib/auth";
import { idempotent, readBody, route } from "@/lib/http";
import { createBatterySchema } from "@/lib/validation";
import { createBattery } from "@/modules/batteries/service";

export const POST = route(async (req) => {
  const actor = await requireActor(["OPERADOR", "CONCESIONARIO"]);
  const input = createBatterySchema.parse((await readBody(req)).fields);
  return idempotent(req, actor.user, async () => {
    const { battery } = await createBattery(actor, input);
    return { status: 201, body: { id: battery.id, passportId: battery.passportId, state: battery.state } };
  });
});
