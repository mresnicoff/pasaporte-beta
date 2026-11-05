import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

const NAV: { href: string; label: string; roles?: Role[] }[] = [
  { href: "/panel", label: "Inicio" },
  { href: "/panel/baterias", label: "Baterías" },
  { href: "/panel/alta", label: "Modelos y alta", roles: ["OPERADOR"] },
  { href: "/panel/alta", label: "Alta", roles: ["CONCESIONARIO"] },
  { href: "/panel/venta", label: "Registrar venta", roles: ["CONCESIONARIO"] },
  { href: "/panel/validaciones", label: "Validaciones", roles: ["ENTIDAD_TECNICA"] },
  { href: "/panel/organizaciones", label: "Organizaciones", roles: ["ENTIDAD_TECNICA", "AUTORIDAD"] },
  { href: "/panel/auditoria", label: "Auditoría", roles: ["ENTIDAD_TECNICA", "AUTORIDAD"] },
  { href: "/panel/observatorio", label: "Observatorio", roles: ["ENTIDAD_TECNICA", "AUTORIDAD"] },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/panel" className="brand">
            <span className="brand-mark">PB</span> Pasaporte
          </Link>
          <nav className="nav">
            {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map((n) => (
              <Link key={n.label} href={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="userbox">
            <span>
              <b style={{ color: "var(--text)" }}>{user.name}</b> · {user.organization.name} ·{" "}
              {ROLE_LABEL[user.role]}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      {!user.organization.enabled && (
        <div className="container" style={{ paddingBottom: 0 }}>
          <div className="alert warn">
            Su organización no está habilitada por el CENT: puede consultar pero no registrar eventos.
          </div>
        </div>
      )}
      <main className="container">{children}</main>
    </>
  );
}
