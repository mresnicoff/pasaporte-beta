import { requireActor } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { idempotent, readBody, route } from "@/lib/http";
import { sellSchema } from "@/lib/validation";
import { findBatteryByPassportId, linkVehicle } from "@/modules/batteries/service";

/** Flujo de venta: el concesionario ingresa el identificador de la batería y el VIN del vehículo. */
export const POST = route(async (req) => {
  const actor = await requireActor(["CONCESIONARIO"]);
  const { passportId, ...input } = sellSchema.parse((await readBody(req)).fields);
  const battery = await findBatteryByPassportId(passportId);
  if (!battery) throw notFound("No existe una batería con ese identificador");
  return idempotent(req, actor.user, async () => {
    const r = await linkVehicle(actor, battery.id, input);
    return { status: 201, body: { batteryId: battery.id, passportId, event: r.event.type, vehicleId: r.vehicle.id } };
  });
});
