// Bloques compactos (specs/cliente-http, bloque compacto): si un bloque
// ```http de una nota se ve en una línea. Es una comodidad de este equipo:
// no va en el texto de la nota (Web y Mobile leen la cerca y se
// sincroniza) ni en la configuración de la extensión, sino en
// `localStorage` (ver `loadCompact`). Puro salvo esas tres funciones, que
// reciben el almacenamiento para probarlas.
import { parseHttpBlock, type ParsedRequest } from './parse';

export const COMPACT_STORAGE_KEY = 'logday:http-client:compact';
/** Bloques recordados; al pasar, se olvidan los tocados hace más tiempo. */
export const COMPACT_MAX = 500;

export interface CompactEntry {
  compact: boolean;
  /** Cuándo se eligió, para olvidar los más viejos. */
  at: number;
}

export type CompactMap = Record<string, CompactEntry>;

/** Lo que distingue a un bloque de los demás de su nota: el método y la
 *  URL sin resolver de su primera petición (`firstLine`). Sin petición, la
 *  primera línea con texto. */
export function blockSignature(code: string): string {
  const first = parseHttpBlock(code).requests[0];
  if (first?.firstLine) return first.firstLine;
  return code.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
}

/** FNV-1a de 32 bits: corto y estable. No es para ocultar nada (la URL no
 *  lleva secretos resueltos); solo para no guardar URLs enteras. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** La clave de un bloque: la nota, la firma de su primera petición y
 *  cuántos bloques antes que él tienen la misma firma. Así, agregar,
 *  quitar o mover otros bloques no la cambia (con el índice a secas, sí);
 *  lo que la cambia es editar el método o la URL de su primera petición, o
 *  que se agregue arriba un bloque con la misma. */
export function compactKey(noteId: string, code: string, before: readonly string[] = []): string {
  const sig = blockSignature(code);
  const twins = before.filter((c) => blockSignature(c) === sig).length;
  return `${noteId}#${hashText(sig)}#${twins}`;
}

/** Lo que haya en el almacenamiento; lo que no se entienda se descarta. */
export function parseCompactMap(raw: string | null | undefined): CompactMap {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: CompactMap = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const v = value as Partial<CompactEntry> | null;
    if (v && typeof v.compact === 'boolean' && typeof v.at === 'number' && Number.isFinite(v.at)) out[key] = { compact: v.compact, at: v.at };
  }
  return out;
}

/** El mapa con ese bloque anotado y, si pasa del tope, sin los más viejos. */
export function withCompact(map: CompactMap, key: string, compact: boolean, at: number, max = COMPACT_MAX): CompactMap {
  const next: CompactMap = { ...map, [key]: { compact, at } };
  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  keys.sort((a, b) => next[a].at - next[b].at);
  for (const k of keys.slice(0, keys.length - max)) if (k !== key) delete next[k];
  return next;
}

/** La firma del bloque cambió mientras estaba abierto (se editó su URL):
 *  lo elegido pasa a la clave nueva. */
export function movedCompact(map: CompactMap, from: string, to: string): CompactMap {
  const entry = map[from];
  if (!entry || from === to) return map;
  const next = { ...map, [to]: entry };
  delete next[from];
  return next;
}

/** Si el bloque arranca compacto: lo que el usuario eligió para él o, si
 *  nunca eligió, la opción "Bloques compactos al abrir una nota". */
export const initialCompact = (stored: boolean | null, compactOnOpen: boolean) => stored ?? compactOnOpen;

/** Lo que dice la barra en compacto: la URL sin `https://` (el método ya
 *  está en su menú). Sin URL, `null`. */
export function compactSummary(req: ParsedRequest | null | undefined): string | null {
  if (!req?.url) return null;
  return req.url.replace(/^https?:\/\//i, '');
}

// ---------- Almacenamiento ----------
// `localStorage`, envuelto en try/catch: puede no estar (ventana privada,
// pruebas) y perderlo no hace daño, el bloque vuelve a la opción de serie.
// No `extensions['http-client'].settings` (config.json): eso es
// configuración, va a los respaldos y se restaura, y cada clic reescribiría
// el archivo entero y volvería a dibujar todo lo que lee los ajustes. Es lo
// mismo que el plegado de "Completadas" en las tareas.

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readMap(storage: Storage | null): CompactMap {
  try {
    return parseCompactMap(storage?.getItem(COMPACT_STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeMap(storage: Storage | null, map: CompactMap) {
  try {
    storage?.setItem(COMPACT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* sin almacenamiento: se olvida al cerrar la nota */
  }
}

export function loadCompact(key: string, storage: Storage | null = defaultStorage()): boolean | null {
  return readMap(storage)[key]?.compact ?? null;
}

export function saveCompact(key: string, compact: boolean, at = Date.now(), storage: Storage | null = defaultStorage()) {
  writeMap(storage, withCompact(readMap(storage), key, compact, at));
}

export function moveCompact(from: string, to: string, storage: Storage | null = defaultStorage()) {
  const map = readMap(storage);
  const next = movedCompact(map, from, to);
  if (next !== map) writeMap(storage, next);
}
