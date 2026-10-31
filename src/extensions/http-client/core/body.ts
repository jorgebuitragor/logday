// Qué vista lleva el cuerpo de una respuesta (specs/cliente-http HT10,
// HT12, design A9): JSON o XML formateados, HTML y demás texto tal cual,
// imágenes como imagen y el resto como binario. Puro.
import { formatJson, formatXml } from '../../devtools/tools/formats';

/** Por encima, el texto se muestra cortado (HT12). */
export const DISPLAY_LIMIT = 2 * 1024 * 1024;
/** Imágenes que se ven como imagen, hasta este tamaño (decisión 8). */
export const IMAGE_LIMIT = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export type ResponseBody =
  | { kind: 'empty' }
  | { kind: 'text'; text: string; lossy: boolean }
  | { kind: 'binary'; base64: string };

export type BodyView =
  | { kind: 'empty' }
  | {
    kind: 'text';
    /** Para resaltar: json, xml (también el HTML, que nunca se dibuja) o nada. */
    language: 'json' | 'xml' | null;
    raw: string;
    /** Formateado, si es JSON o XML válido. */
    pretty: string | null;
    /** Si se esperaba JSON o XML y no lo es. */
    invalid: 'json' | 'xml' | null;
    lossy: boolean;
    /** Se muestran solo los primeros 2 MB. */
    partial: boolean;
  }
  | { kind: 'image'; mime: string; base64: string; bytes: number }
  | { kind: 'binary'; mime: string; base64: string; bytes: number };

/** El tipo sin parámetros, en minúsculas ("application/json"). */
export function mimeOf(headers: readonly [string, string][]): string {
  const ct = headers.find(([n]) => n.toLowerCase() === 'content-type')?.[1] ?? '';
  return ct.split(';')[0].trim().toLowerCase();
}

const isJsonMime = (m: string) => m === 'application/json' || m.endsWith('+json') || m.endsWith('/json');
const isXmlMime = (m: string) => m.endsWith('/xml') || m.endsWith('+xml');
const looksJson = (t: string) => /^\s*[[{]/.test(t);

const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

export function chooseBodyView(body: ResponseBody, headers: readonly [string, string][]): BodyView {
  if (body.kind === 'empty') return { kind: 'empty' };
  const mime = mimeOf(headers);
  if (body.kind === 'binary') {
    const bytes = base64Bytes(body.base64);
    if (IMAGE_TYPES.includes(mime) && bytes <= IMAGE_LIMIT) return { kind: 'image', mime, base64: body.base64, bytes };
    return { kind: 'binary', mime: mime || 'application/octet-stream', base64: body.base64, bytes };
  }
  const raw = body.text;
  if (raw === '') return { kind: 'empty' };
  const partial = raw.length > DISPLAY_LIMIT;
  const shown = partial ? raw.slice(0, DISPLAY_LIMIT) : raw;
  const base = { kind: 'text' as const, raw: shown, lossy: body.lossy, partial };
  // Un cuerpo cortado no se puede formatear: se muestra tal cual.
  if (isJsonMime(mime) || (!mime && looksJson(raw))) {
    const r = partial ? null : formatJson(raw, 2);
    if (r?.ok) return { ...base, language: 'json', pretty: r.value, invalid: null };
    return { ...base, language: null, pretty: null, invalid: partial || !isJsonMime(mime) ? null : 'json' };
  }
  if (isXmlMime(mime) || mime === 'image/svg+xml') {
    const r = partial ? null : formatXml(raw, 2);
    if (r?.ok) return { ...base, language: 'xml', pretty: r.value, invalid: null };
    return { ...base, language: null, pretty: null, invalid: partial ? null : 'xml' };
  }
  // HT12: el HTML se muestra como texto, resaltado como xml.
  if (mime === 'text/html') return { ...base, language: 'xml', pretty: null, invalid: null };
  return { ...base, language: null, pretty: null, invalid: null };
}

/** Bytes que ocupa en memoria (para el tope de la caché). */
export function bodyBytes(body: ResponseBody): number {
  if (body.kind === 'empty') return 0;
  if (body.kind === 'binary') return body.base64.length;
  return body.text.length * 2;
}

const EXT_BY_MIME: Record<string, string> = {
  'application/json': 'json', 'application/xml': 'xml', 'text/xml': 'xml', 'text/html': 'html',
  'text/plain': 'txt', 'text/csv': 'csv', 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg',
  'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/zip': 'zip',
  'application/javascript': 'js', 'text/javascript': 'js', 'application/yaml': 'yaml', 'text/yaml': 'yaml',
};

/** Nombre por defecto al guardar: el último segmento de la ruta, o
 *  "respuesta", con la extensión del tipo. */
export function defaultFileName(url: string, mime: string, fallback: string): string {
  let base = fallback;
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (seg) base = decodeURIComponent(seg).replace(/[\\/:*?"<>|]/g, '_');
  } catch {
    // La URL enmascarada puede no ser válida: queda el nombre por defecto.
  }
  const ext = EXT_BY_MIME[mime] ?? (isJsonMime(mime) ? 'json' : isXmlMime(mime) ? 'xml' : mime.startsWith('text/') ? 'txt' : 'bin');
  return /\.[A-Za-z0-9]{1,5}$/.test(base) ? base : `${base}.${ext}`;
}
