// Codificar y decodificar: Base64, URL, entidades HTML y JWT (specs/devtools D2).
import { fail, ok, type ToolResult } from './result';

// ── Base64 (texto en UTF-8) ──────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64Encode(text: string, urlSafe: boolean): string {
  const b64 = bytesToBase64(new TextEncoder().encode(text));
  return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64;
}

/** Acepta las dos variantes (con `-_` o `+/`, con o sin relleno) y
 *  espacios o saltos de línea en medio, como trae un PEM o un correo. */
export function base64DecodeBytes(input: string): Uint8Array | null {
  const clean = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
  const body = clean.replace(/=+$/, '');
  if (body.length % 4 === 1) return null;
  const padded = body + '='.repeat((4 - (body.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** El primer carácter que no es del alfabeto de Base64 (ni de base64url),
 *  con su posición desde 1 en el texto tal como se pegó. `null` si todos
 *  son válidos (el error es entonces de longitud o de relleno). */
export function base64InvalidAt(input: string): { char: string; pos: number } | null {
  let pos = 0;
  let padding = false;
  for (const ch of input) {
    pos++;
    if (/\s/.test(ch)) continue;
    if (ch === '=') {
      padding = true;
      continue;
    }
    // Después del relleno ya no puede venir nada más.
    if (padding || !/[A-Za-z0-9+/_-]/.test(ch)) return { char: ch, pos };
  }
  return null;
}

export function base64Decode(input: string): ToolResult {
  const bytes = base64DecodeBytes(input);
  if (!bytes) return fail('base64-invalid');
  try {
    return ok(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    // Bytes que no son texto (una imagen, un binario): no se muestran.
    return fail('base64-invalid', { detail: 'not UTF-8 text' });
  }
}

// ── URL ──────────────────────────────────────────────────────────────

export const urlEncode = (text: string) => encodeURIComponent(text);

export function urlDecode(text: string): ToolResult {
  try {
    // `+` es espacio en los formularios (application/x-www-form-urlencoded).
    return ok(decodeURIComponent(text.replace(/\+/g, ' ')));
  } catch {
    return fail('url-invalid');
  }
}

/** Dónde empieza la primera secuencia `%` mal formada (desde 1): un `%`
 *  sin dos cifras hexadecimales detrás, o bytes que no son UTF-8. */
export function urlInvalidAt(text: string): number | null {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '%') continue;
    if (!/^[0-9a-fA-F]{2}$/.test(text.slice(i + 1, i + 3))) return i + 1;
    // Una secuencia de bytes seguidos (%C3%B1) tiene que ser UTF-8 válido.
    let j = i;
    while (text[j] === '%' && /^[0-9a-fA-F]{2}$/.test(text.slice(j + 1, j + 3))) j += 3;
    try {
      decodeURIComponent(text.slice(i, j));
    } catch {
      return i + 1;
    }
    i = j - 1;
  }
  return null;
}

// ── Entidades HTML ───────────────────────────────────────────────────

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', euro: '€', aacute: 'á', eacute: 'é',
  iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í',
  Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', iexcl: '¡', iquest: '¿', deg: '°',
};

/** Los cinco caracteres especiales; con `nonAscii`, también todo lo que
 *  no es ASCII, como entidad numérica (`é` → `&#233;`). */
export function htmlEncode(text: string, nonAscii = false): string {
  const basic = text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  if (!nonAscii) return basic;
  let out = '';
  for (const ch of basic) {
    const code = ch.codePointAt(0)!;
    out += code > 0x7e ? `&#${code};` : ch;
  }
  return out;
}

/** Las entidades numéricas y las con nombre más comunes. Una desconocida
 *  se deja como está. */
export function htmlDecode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body] ?? whole;
  });
}

// ── JWT ──────────────────────────────────────────────────────────────

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** Fechas de los claims de tiempo que vengan (segundos Unix → ms). */
  times: Partial<Record<'exp' | 'iat' | 'nbf', number>>;
  /** Sin `exp`, `null`. */
  expired: boolean | null;
  /** `nbf` en el futuro. */
  notYetValid: boolean;
  hasSignature: boolean;
}

function decodePart(part: string): Record<string, unknown> | null {
  const bytes = base64DecodeBytes(part);
  if (!bytes) return null;
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Decodifica la cabecera y el payload. La firma NO se verifica: para
 *  eso hace falta la clave, y aquí solo se mira el contenido (D2). */
export function decodeJwt(token: string, now: number = Date.now()): ToolResult<DecodedJwt> {
  const parts = token.trim().replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3) return fail('jwt-parts');
  const header = decodePart(parts[0]);
  if (!header) return fail('jwt-part-invalid', { detail: 'header' });
  const payload = decodePart(parts[1]);
  if (!payload) return fail('jwt-part-invalid', { detail: 'payload' });
  const times: DecodedJwt['times'] = {};
  for (const claim of ['exp', 'iat', 'nbf'] as const) {
    const v = payload[claim];
    if (typeof v === 'number' && Number.isFinite(v)) times[claim] = v * 1000;
  }
  return ok({
    header,
    payload,
    times,
    expired: times.exp === undefined ? null : times.exp <= now,
    notYetValid: times.nbf !== undefined && times.nbf > now,
    hasSignature: parts[2].length > 0,
  });
}
