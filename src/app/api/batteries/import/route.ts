import { requireActor } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { json, readBody, route } from "@/lib/http";
import { importBatteriesCsv } from "@/modules/batteries/import";

export const POST = route(async (req) => {
  const actor = await requireActor(["OPERADOR"]);
  let text: string;
  if ((req.headers.get("content-type") ?? "").startsWith("text/csv")) {
    text = await req.text();
  } else {
    const { files } = await readBody(req);
    if (!files.file) throw badRequest("Adjunte un archivo CSV en el campo file");
    if (files.file.size > 2 * 1024 * 1024) throw badRequest("El CSV supera 2 MB");
    text = await files.file.text();
  }
  return json(await importBatteriesCsv(actor, text));
});
