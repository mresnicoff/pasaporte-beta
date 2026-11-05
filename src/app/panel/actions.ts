"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { normalizePassportId } from "@/lib/passport-id";

/** Buscar una batería por identificador de pasaporte, número de serie, VIN o dominio. */
export async function findBattery(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const q = String(formData.get("q") ?? "").trim();
  if (!q) redirect("/panel/baterias");
  const pid = normalizePassportId(q);
  const b = await prisma.battery.findFirst({
    where: {
      OR: [
        { passportId: pid },
        { serialNumber: q },
        { vehicleLinks: { some: { to: null, vehicle: { OR: [{ vin: q.toUpperCase() }, { domain: q.toUpperCase() }] } } } },
      ],
    },
    select: { id: true },
  });
  redirect(b ? `/panel/baterias/${b.id}` : `/panel/baterias?q=${encodeURIComponent(q)}&nf=1`);
}
