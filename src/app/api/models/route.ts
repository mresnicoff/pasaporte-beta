import { requireActor } from "@/lib/auth";
import { json, readBody, route } from "@/lib/http";
import { batteryModelSchema } from "@/lib/validation";
import { createModel } from "@/modules/batteries/service";

export const POST = route(async (req) => {
  const actor = await requireActor(["OPERADOR"]);
  const { fields, files } = await readBody(req);
  const model = await createModel(actor, batteryModelSchema.parse(fields), files.dismantlingFile);
  return json(model, 201);
});
