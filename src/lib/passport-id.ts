/**
 * Identificador compatible en estructura con ISO/IEC 15459:
 *   <emisor>-<operador 4 dígitos>-<secuencial 9 dígitos>-<dígito verificador>
 * Ejemplo: AR-BP-0042-000001837-K
 * El dígito verificador usa ISO/IEC 7064 MOD 37,36 (alfanumérico), que detecta
 * todos los errores de un carácter y la mayoría de las transposiciones.
 */
export const ISSUER_PREFIX = "AR-BP"; // provisorio en la beta

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function checkChar(body: string): string {
  const M = 36;
  let p = M;
  for (const ch of body.toUpperCase()) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) continue;
    p = (p + v) % M;
    if (p === 0) p = M;
    p = (p * 2) % (M + 1);
  }
  return ALPHABET[(M + 1 - p) % M];
}

export function buildPassportId(operatorCode: string, serial: number): string {
  const op = operatorCode.padStart(4, "0");
  const seq = String(serial).padStart(9, "0");
  const base = `${ISSUER_PREFIX}-${op}-${seq}`;
  return `${base}-${checkChar(base.replace(/-/g, ""))}`;
}

const PATTERN = /^([A-Z]{2}-[A-Z]{2})-(\d{4})-(\d{9})-([0-9A-Z])$/;

export function normalizePassportId(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidPassportId(raw: string): boolean {
  const id = normalizePassportId(raw);
  const m = PATTERN.exec(id);
  if (!m) return false;
  const base = `${m[1]}-${m[2]}-${m[3]}`;
  return checkChar(base.replace(/-/g, "")) === m[4];
}
