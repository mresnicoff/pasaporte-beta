/**
 * Identificador de la batería: GTIN-14 (modelo) + número de serie (unidad), como en GS1 Digital Link.
 * El identificador lo trae la etiqueta impresa por el fabricante; el sistema no lo genera.
 *
 *   URL pública : {PUBLIC_BASE_URL}/01/{GTIN}/21/{serie}
 *   Clave interna (passportId): {GTIN}-{SERIE}
 *
 * El GTIN lo emite la organización GS1 nacional del fabricante y su último dígito es de control
 * (módulo 10). El número de serie tiene hasta 20 caracteres, solo letras y dígitos.
 */

export const SERIAL_MAX = 20;
const SERIAL_PATTERN = /^[A-Z0-9]{1,20}$/;

/** Dígito de control GS1 (módulo 10) para los 13 primeros dígitos de un GTIN-14. */
export function gtinCheckDigit(body13: string): number {
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = Number(body13[12 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Normaliza un GTIN de 8 a 14 dígitos a GTIN-14 (relleno con ceros a la izquierda). Devuelve null si no es válido. */
export function normalizeGtin(raw: string): string | null {
  const digits = raw.trim().replace(/[\s-]/g, "");
  if (!/^\d{8,14}$/.test(digits)) return null;
  const g = digits.padStart(14, "0");
  return gtinCheckDigit(g.slice(0, 13)) === Number(g[13]) ? g : null;
}

export function isValidGtin(raw: string): boolean {
  return normalizeGtin(raw) !== null;
}

export function normalizeSerial(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSerial(raw: string): boolean {
  return SERIAL_PATTERN.test(normalizeSerial(raw));
}

export function buildPassportId(gtin: string, serial: string): string {
  return `${gtin}-${normalizeSerial(serial)}`;
}

export type ParsedId = { gtin: string; serial: string };

/**
 * Interpreta un identificador escrito o escaneado. Acepta:
 *   - la URL completa ( .../01/{GTIN}/21/{serie} ),
 *   - la cadena GS1 con paréntesis ( (01){GTIN}(21){serie} ) o sin ellos,
 *   - la clave interna {GTIN}-{SERIE} o "{GTIN} {SERIE}".
 * Devuelve null si el GTIN no es válido o la serie no cumple el formato.
 */
export function parseIdentifier(raw: string): ParsedId | null {
  let text = raw.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    /* texto con % suelto: se usa tal cual */
  }
  let gtinRaw: string | undefined;
  let serialRaw: string | undefined;

  let m = /\/01\/(\d{8,14})\/21\/([^/?#\s]+)/i.exec(text);
  if (m) [, gtinRaw, serialRaw] = m;
  if (!m) {
    m = /^\(?01\)?(\d{14})\(?21\)?(.+)$/i.exec(text.replace(/\s/g, ""));
    if (m) [, gtinRaw, serialRaw] = m;
  }
  if (!m) {
    m = /^(\d{8,14})[\s\-/]+([A-Za-z0-9]+)$/.exec(text);
    if (m) [, gtinRaw, serialRaw] = m;
  }
  if (!gtinRaw || !serialRaw) return null;
  const gtin = normalizeGtin(gtinRaw);
  const serial = normalizeSerial(serialRaw);
  if (!gtin || !SERIAL_PATTERN.test(serial)) return null;
  return { gtin, serial };
}

/** Lleva cualquier forma aceptada a la clave interna; si no se reconoce, devuelve el texto en mayúsculas. */
export function normalizePassportId(raw: string): string {
  const p = parseIdentifier(raw);
  return p ? buildPassportId(p.gtin, p.serial) : raw.trim().toUpperCase();
}

export function isValidPassportId(raw: string): boolean {
  return parseIdentifier(raw) !== null;
}

/** Ruta pública relativa de un pasaporte. */
export function publicPath(passportId: string): string | null {
  const p = parseIdentifier(passportId);
  return p ? `/01/${p.gtin}/21/${encodeURIComponent(p.serial)}` : null;
}
