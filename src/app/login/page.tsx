"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fd.get("phone"), password: fd.get("password") }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.details?.[0]?.message ?? data.message ?? "No se pudo iniciar sesión");
        return;
      }
      const next = params.get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/panel");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <label>
        Teléfono
        <input name="phone" type="tel" autoComplete="username" placeholder="1150000001" required />
      </label>
      <label>
        Contraseña
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <div className="alert error">{error}</div>}
      <button disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}</button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: "3rem" }}>
      <Link href="/" className="brand" style={{ marginBottom: "1rem" }}>
        <span className="brand-mark">PB</span> Pasaporte de Baterías
      </Link>
      <div className="card" style={{ marginTop: "1rem" }}>
        <h1>Ingresar</h1>
        <p className="muted small">Acceso para organizaciones registradas.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <p className="muted small">Beta con datos sintéticos. Los usuarios de prueba figuran en el README.</p>
    </main>
  );
}
