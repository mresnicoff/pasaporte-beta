import { requireActor } from "@/lib/auth";
import { idempotent, readBody, route } from "@/lib/http";
import { linkVehicleSchema } from "@/lib/validation";
import { linkVehicle } from "@/modules/batteries/service";

/** Asocia la batería a un vehículo (venta o recambio). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const actor = await requireActor(["CONCESIONARIO"]);
  const input = linkVehicleSchema.parse((await readBody(req)).fields);
  return idempotent(req, actor.user, async () => {
    const r = await linkVehicle(actor, id, input);
    return { status: 201, body: { event: r.event.type, state: r.battery.state, vehicleId: r.vehicle.id } };
  });
});
