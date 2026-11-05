import { prisma } from "@/lib/db";
import type { Actor, SessionUser } from "@/lib/auth";
import { badRequest, notFound } from "@/lib/errors";
import { appendAudit } from "@/modules/audit/service";

/** El CENT habilita o suspende talleres y recicladores. */
export async function setOrganizationEnabled(actor: Actor & { user: SessionUser }, orgId: string, enabled: boolean) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({ where: { id: orgId } });
    if (!org) throw notFound("Organización no encontrada");
    if (!["TALLER", "RECICLADOR"].includes(org.type))
      throw badRequest("Solo se habilitan talleres y recicladores");
    const updated = await tx.organization.update({ where: { id: orgId }, data: { enabled } });
    await appendAudit(tx, actor, {
      action: enabled ? "ORG_HABILITADA" : "ORG_SUSPENDIDA",
      entity: "Organization",
      entityId: orgId,
      details: { name: org.name },
    });
    return updated;
  });
}
