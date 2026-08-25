import * as Y from 'yjs';
import { fs } from './invoke';

// ── Sync de contenido de notas vía CRDT (Yjs) ────────────────────────────
// Ver specs/sync-servidor/design.md "CRDT: Note.content..." y, sobre todo,
// la implementación real ya validada contra logday-server en
// logday-web/src/lib/yText.ts — el protocolo real es texto plano (`Y.Text`
// bajo la key "content", igual que `ygo` del lado servidor, Go), NO un
// documento estructurado. Un `Y.XmlFragment` vía
// `@tiptap/extension-collaboration` (lo que se intentó primero acá) es un
// shared type distinto dentro del mismo Y.Doc — nunca se fusionaría con lo
// que escribe logday-web. El Y.Doc es la fuente de verdad para el contenido
// en curso; el Markdown en disco (y `Note.content` en memoria) se deriva de
// su estado, nunca al revés.

/** Misma key que usa ygo del lado servidor (internal/crdt/text.go) y
 *  logday-web (src/lib/yText.ts) — tiene que coincidir exactamente, Yjs no
 *  mergea shared types con distinto nombre. */
export const CONTENT_KEY = 'content';

/** Archivo binario hermano del .md de la nota, mismo id — guarda siempre el
 *  estado Yjs completo (`Y.encodeStateAsUpdate`), no un log incremental. */
export function noteContentStatePath(filePath: string): string {
  return filePath.replace(/\.md$/, '.ydoc');
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function getContentText(doc: Y.Doc): string {
  return doc.getText(CONTENT_KEY).toString();
}

/**
 * Aplica una edición del Markdown de una nota al `Y.Text` del doc como un
 * diff mínimo (prefijo/sufijo común), no reemplazando todo el texto en cada
 * guardado — así dos ediciones concurrentes en partes distintas del texto
 * se mezclan bien en vez de pisarse. Puerto directo de
 * `applyTextareaEdit` en logday-web/src/lib/yText.ts (ahí aplicado a un
 * `<textarea>`; acá al Markdown serializado del editor Tiptap) — mismo
 * algoritmo, tiene que producir las mismas operaciones Yjs para que ambos
 * clientes mergeen igual.
 */
export function applyTextEdit(doc: Y.Doc, oldValue: string, newValue: string): void {
  if (oldValue === newValue) return;
  const yText = doc.getText(CONTENT_KEY);

  let start = 0;
  const minLen = Math.min(oldValue.length, newValue.length);
  while (start < minLen && oldValue[start] === newValue[start]) start++;

  let oldEnd = oldValue.length;
  let newEnd = newValue.length;
  while (oldEnd > start && newEnd > start && oldValue[oldEnd - 1] === newValue[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  doc.transact(() => {
    if (oldEnd > start) yText.delete(start, oldEnd - start);
    if (newEnd > start) yText.insert(start, newValue.slice(start, newEnd));
  });
}

/** Bytes del `.ydoc` hermano de una nota, si existe. `null` si la nota
 *  todavía no tiene estado CRDT local (todas las notas de antes de esta
 *  feature, y cualquier nota nueva hasta su primer guardado). */
export async function readPersistedUpdate(filePath: string): Promise<Uint8Array | null> {
  const path = noteContentStatePath(filePath);
  const exists = await fs.exists(path).catch(() => false);
  if (!exists) return null;
  const b64 = await fs.readBinary(path);
  return base64ToBytes(b64);
}

/** Igual que `readPersistedUpdate`, pero ya materializado en un `Y.Doc`
 *  nuevo — para cuando el llamador necesita un doc standalone (merge en
 *  background), no aplicar sobre uno ya existente. */
export async function loadPersistedYDoc(filePath: string): Promise<Y.Doc | null> {
  const bytes = await readPersistedUpdate(filePath);
  if (!bytes) return null;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  return doc;
}

/** Persiste el estado Yjs completo actual — sobreescribe, no acumula. */
export async function persistYDoc(filePath: string, ydoc: Y.Doc): Promise<void> {
  const b64 = bytesToBase64(Y.encodeStateAsUpdate(ydoc));
  await fs.writeBinary(noteContentStatePath(filePath), b64);
}

/** Aplica un `content_state` (base64) recibido del servidor (creación/patch
 *  propio, push de contenido, o `/sync/changes`) al estado CRDT local de
 *  una nota. Pura E/S de archivos — quien llama se encarga de actualizar
 *  el store y reescribir el `.md` con el `content` devuelto.
 *
 *  El merge es conmutativo/idempotente (propiedad de Yjs): no importa el
 *  orden de llegada ni si ese update ya se había aplicado antes. */
export async function applyIncomingContentState(
  filePath: string,
  contentStateB64: string
): Promise<{ content: string }> {
  const existing = await loadPersistedYDoc(filePath);
  const doc = existing ?? new Y.Doc();
  Y.applyUpdate(doc, base64ToBytes(contentStateB64));
  await persistYDoc(filePath, doc);
  const content = getContentText(doc);
  doc.destroy();
  return { content };
}
