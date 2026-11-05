import { requireActor } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getFleetStats } from "@/modules/stats/service";

/** Estadísticas anonimizadas del parque. Con ?download=1 se descarga como archivo JSON. */
export const GET = route(async (req) => {
  await requireActor(["AUTORIDAD", "ENTIDAD_TECNICA"]);
  const stats = await getFleetStats();
  const res = json(stats);
  if (new URL(req.url).searchParams.get("download")) {
    res.headers.set(
      "Content-Disposition",
      `attachment; filename="observatorio-${stats.generatedAt.slice(0, 10)}.json"`,
    );
  }
  return res;
});
