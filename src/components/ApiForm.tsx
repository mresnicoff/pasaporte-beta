"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

type Props = {
  action: string;
  children: ReactNode;
  submitLabel: string;
  /** Envía multipart/form-data (necesario para adjuntos). Si no, JSON. */
  multipart?: boolean;
  /** Mensaje al terminar bien. Admite {campo} con valores de la respuesta. */
  successMessage?: string;
  /** Redirección al terminar bien. Admite {campo} con valores de la respuesta. */
  redirectTo?: string;
  /** Campos fijos que se agregan al envío. */
  extra?: Record<string, string>;
  confirmText?: string;
  variant?: "primary" | "secondary" | "danger";
  resetOnSuccess?: boolean;
};

const fill = (tpl: string, data: Record<string, unknown>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(data?.[k] ?? ""));

/**
 * Formulario genérico que envía a un endpoint REST. Agrega una clave de idempotencia por envío
 * para que un doble clic o un reintento no generen eventos duplicados.
 */
export function ApiForm({
  action,
  children,
  submitLabel,
  multipart,
  successMessage,
  redirectTo,
  extra,
  confirmText,
  variant = "primary",
  resetOnSuccess = true,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; details?: { path: string; message: string }[] } | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const keyRef = useRef<string>(crypto.randomUUID());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const fd = new FormData(form);
      for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
      let body: BodyInit;
      const headers: Record<string, string> = { "Idempotency-Key": keyRef.current };
      if (multipart) body = fd;
      else {
        const obj: Record<string, unknown> = {};
        fd.forEach((v, k) => {
          if (typeof v === "string") obj[k] = v;
        });
        form.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((c) => {
          if (c.name) obj[c.name] = c.checked;
        });
        body = JSON.stringify(obj);
        headers["Content-Type"] = "application/json";
      }
      const res = await fetch(action, { method: "POST", body, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: data.message ?? `Error ${res.status}`, details: data.details });
        return;
      }
      keyRef.current = crypto.randomUUID();
      if (resetOnSuccess) form.reset();
      if (redirectTo) {
        router.push(fill(redirectTo, data));
        router.refresh();
        return;
      }
      setOk(successMessage ? fill(successMessage, data) : "Listo");
      router.refresh();
    } catch {
      setError({ message: "No se pudo conectar con el servidor" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      {children}
      {error && (
        <div className="alert error" role="alert">
          {error.message}
          {Array.isArray(error.details) && error.details.length > 0 && (
            <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem" }}>
              {error.details.map((d, i) => (
                <li key={i}>
                  {d.path ? <b>{d.path}: </b> : null}
                  {d.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {ok && <div className="alert success">{ok}</div>}
      <div className="actions">
        <button type="submit" disabled={busy} className={variant === "primary" ? "" : variant}>
          {busy ? "Enviando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
