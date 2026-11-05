import { prisma } from "@/lib/db";

const LATEST_SOH = `SELECT DISTINCT ON ("batteryId") "sohPercent" AS soh FROM "HealthCertificate"
  WHERE status = 'VALIDADO' ORDER BY "batteryId", "reviewedAt" DESC`;

/** Estadísticas anonimizadas del parque (observatorio). No incluye VIN, dominio ni números de serie. */
export async function getFleetStats() {
  const [byState, byChemistry, sohAgg, sohBuckets, certs, recycled, byOperator, byYear] = await Promise.all([
    prisma.battery.groupBy({ by: ["state"], _count: true }),
    prisma.$queryRawUnsafe<{ chemistry: string; count: bigint; capacity: number }[]>(
      `SELECT m.chemistry, COUNT(*)::bigint AS count, COALESCE(SUM(m."nominalCapacityKwh"),0)::float AS capacity
       FROM "Battery" b JOIN "BatteryModel" m ON m.id = b."modelId"
       GROUP BY m.chemistry ORDER BY count DESC`,
    ),
    prisma.$queryRawUnsafe<{ avg: number | null; min: number | null; max: number | null; n: bigint }[]>(
      `SELECT AVG(s.soh)::float AS avg, MIN(s.soh)::float AS min, MAX(s.soh)::float AS max, COUNT(*)::bigint AS n
       FROM (${LATEST_SOH}) s`,
    ),
    prisma.$queryRawUnsafe<{ bucket: string; count: bigint }[]>(
      `SELECT CASE WHEN soh >= 90 THEN '90-100' WHEN soh >= 80 THEN '80-89' WHEN soh >= 70 THEN '70-79'
                   WHEN soh >= 60 THEN '60-69' ELSE '<60' END AS bucket, COUNT(*)::bigint AS count
       FROM (${LATEST_SOH}) s GROUP BY bucket`,
    ),
    prisma.healthCertificate.groupBy({ by: ["status"], _count: true }),
    prisma.recyclerReceipt.aggregate({ where: { status: "VALIDADO" }, _sum: { receivedMassKg: true }, _count: true }),
    prisma.$queryRawUnsafe<{ operator: string; count: bigint }[]>(
      `SELECT o.name AS operator, COUNT(*)::bigint AS count FROM "Battery" b
       JOIN "Organization" o ON o.id = b."operatorId" GROUP BY o.name ORDER BY count DESC`,
    ),
    prisma.$queryRawUnsafe<{ year: number; count: bigint }[]>(
      `SELECT EXTRACT(YEAR FROM "manufactureDate")::int AS year, COUNT(*)::bigint AS count
       FROM "Battery" GROUP BY year ORDER BY year`,
    ),
  ]);

  const total = byState.reduce((a, s) => a + s._count, 0);
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    generatedAt: new Date().toISOString(),
    totalBatteries: total,
    byState: Object.fromEntries(byState.map((s) => [s.state, s._count])) as Record<string, number>,
    byChemistry: byChemistry.map((c) => ({
      chemistry: c.chemistry,
      count: Number(c.count),
      nominalCapacityKwh: round1(c.capacity),
    })),
    byOperator: byOperator.map((o) => ({ operator: o.operator, count: Number(o.count) })),
    byManufactureYear: byYear.map((y) => ({ year: Number(y.year), count: Number(y.count) })),
    stateOfHealth: {
      batteriesWithCertificate: Number(sohAgg[0]?.n ?? 0),
      averagePercent: sohAgg[0]?.avg != null ? round1(sohAgg[0].avg) : null,
      minPercent: sohAgg[0]?.min ?? null,
      maxPercent: sohAgg[0]?.max ?? null,
      distribution: ["90-100", "80-89", "70-79", "60-69", "<60"].map((b) => ({
        bucket: b,
        count: Number(sohBuckets.find((x) => x.bucket === b)?.count ?? 0),
      })),
    },
    certificates: Object.fromEntries(certs.map((c) => [c.status, c._count])) as Record<string, number>,
    recycling: {
      validatedReceipts: recycled._count,
      recoveredMassKg: round1(recycled._sum.receivedMassKg ?? 0),
    },
  };
}
