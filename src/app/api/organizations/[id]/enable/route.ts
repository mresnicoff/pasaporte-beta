import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { json, readBody, route } from "@/lib/http";
import { setOrganizationEnabled } from "@/modules/organizations/service";

const schema = z.object({ enabled: z.preprocess((v) => v === true || v === "true", z.boolean()) });

/** El CENT habilita o suspende talleres y recicladores. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const actor = await requireActor(["ENTIDAD_TECNICA"]);
  const { enabled } = schema.parse((await readBody(req)).fields);
  const org = await setOrganizationEnabled(actor, id, enabled);
  return json({ id: org.id, enabled: org.enabled });
});
