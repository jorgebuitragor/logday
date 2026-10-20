import * as Y from 'yjs';
import diff from 'fast-diff';
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

/** Un cambio sobre un texto, en coordenadas del texto original: en `index`
 *  se borran `deleteCount` caracteres y se inserta `insert`. */
export interface TextChange {
  index: number;
  deleteCount: number;
  insert: string;
}

/** `fast-diff` puede agotar la pila con surrogates UTF-16 sueltos (visto al
 *  probar con texto aleatorio). Un guardado nunca debe fallar por eso: en ese
 *  caso se cae a una sola ventana prefijo/sufijo, que es peor para el merge
 *  pero siempre termina. */
function safeDiff(oldValue: string, newValue: string): diff.Diff[] {
  try {
    return diff(oldValue, newValue);
  } catch {
    let start = 0;
    const minLen = Math.min(oldValue.length, newValue.length);
    while (start < minLen && oldValue[start] === newValue[start]) start++;
    let oldEnd = oldValue.length;
    let newEnd = newValue.length;
    while (oldEnd > start && newEnd > start && oldValue[oldEnd - 1] === newValue[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    const result: diff.Diff[] = [[diff.EQUAL, oldValue.slice(0, start)]];
    if (oldEnd > start) result.push([diff.DELETE, oldValue.slice(start, oldEnd)]);
    if (newEnd > start) result.push([diff.INSERT, newValue.slice(start, newEnd)]);
    result.push([diff.EQUAL, oldValue.slice(oldEnd)]);
    return result.filter(([, text]) => text.length > 0);
  }
}

/** Cambios para pasar de `oldValue` a `newValue`, ordenados y sin solaparse.
 *  Usa un diff real (Myers, vía `fast-diff`) en vez de una sola ventana
 *  prefijo/sufijo: con la ventana, si el primer y el último carácter
 *  difieren (p. ej. se antepone texto y además cambia el `\n` final), el
 *  "diff mínimo" degenera en borrar todo y reinsertar todo. Bug real (19 oct
 *  2026): Desktop antepuso "[DESK] " mientras Web agregaba " [WEB]" al final;
 *  la reinserción completa dejó el texto de Web anclado a caracteres ya
 *  borrados y el merge lo puso al principio. */
function diffChanges(oldValue: string, newValue: string): TextChange[] {
  const changes: TextChange[] = [];
  let index = 0;
  for (const [op, text] of safeDiff(oldValue, newValue)) {
    if (op === diff.EQUAL) {
      index += text.length;
    } else if (op === diff.DELETE) {
      changes.push({ index, deleteCount: text.length, insert: '' });
      index += text.length;
    } else {
      // Un borrado seguido de una inserción en el mismo punto es un reemplazo.
      const last = changes[changes.length - 1];
      if (last && last.insert === '' && last.index + last.deleteCount === index) last.insert = text;
      else changes.push({ index, deleteCount: 0, insert: text });
    }
  }
  return changes;
}

/** Aplica `changes` (en coordenadas del texto actual del `Y.Text`) en una
 *  sola transacción. Van de atrás hacia adelante para que los índices de los
 *  cambios anteriores sigan siendo válidos. En un reemplazo se inserta antes
 *  de borrar: así el texto nuevo queda anclado a su vecino izquierdo y no
 *  detrás de las lápidas de lo borrado. */
function applyChanges(doc: Y.Doc, changes: TextChange[]): void {
  if (changes.length === 0) return;
  const yText = doc.getText(CONTENT_KEY);
  doc.transact(() => {
    for (let i = changes.length - 1; i >= 0; i -= 1) {
      const { index, deleteCount, insert } = changes[i];
      if (insert) yText.insert(index, insert);
      if (deleteCount > 0) yText.delete(index + insert.length, deleteCount);
    }
  });
}

/**
 * Aplica una edición al `Y.Text` del doc como un diff de verdad, no
 * reemplazando todo el texto en cada guardado — así dos ediciones
 * concurrentes en partes distintas del texto se mezclan bien en vez de
 * pisarse. `oldValue` tiene que ser el texto actual del `Y.Text`.
 * Equivale a `applyTextareaEdit` de logday-web/src/lib/yText.ts para el caso
 * de una sola tecla (ahí el prefijo/sufijo basta: el textarea es el mismo
 * texto que el `Y.Text`), pero no degenera en un reemplazo completo cuando
 * el cambio toca el principio y el final a la vez.
 */
export function applyTextEdit(doc: Y.Doc, oldValue: string, newValue: string): void {
  if (oldValue === newValue) return;
  applyChanges(doc, diffChanges(oldValue, newValue));
}

/** Tramo de la alineación entre dos textos: `[base, base + baseLen)` del
 *  primero corresponde a `[current, current + currentLen)` del segundo.
 *  `equal` indica si son el mismo texto carácter a carácter. */
interface AlignedSpan {
  base: number;
  baseLen: number;
  current: number;
  currentLen: number;
  equal: boolean;
}

function alignTexts(baseValue: string, currentValue: string): AlignedSpan[] {
  const spans: AlignedSpan[] = [];
  let base = 0;
  let current = 0;
  for (const [op, text] of safeDiff(baseValue, currentValue)) {
    const last = spans[spans.length - 1];
    if (op === diff.EQUAL) {
      spans.push({ base, baseLen: text.length, current, currentLen: text.length, equal: true });
      base += text.length;
      current += text.length;
      continue;
    }
    // Borrados e inserciones contiguos forman un solo tramo distinto.
    const span = last && !last.equal ? last : { base, baseLen: 0, current, currentLen: 0, equal: false };
    if (span !== last) spans.push(span);
    if (op === diff.DELETE) {
      span.baseLen += text.length;
      base += text.length;
    } else {
      span.currentLen += text.length;
      current += text.length;
    }
  }
  return spans;
}

/** Lleva una posición del texto base al texto actual. En los bordes de un
 *  tramo distinto (o dentro de él) la posición es ambigua: `'before'` elige
 *  la menor y `'after'` la mayor. */
function mapPosition(spans: AlignedSpan[], pos: number, bias: 'before' | 'after'): number {
  let result: number | null = null;
  for (const s of spans) {
    if (pos < s.base) break;
    if (pos > s.base + s.baseLen) continue;
    let candidate: number;
    if (s.equal) candidate = s.current + (pos - s.base);
    // Tramo que solo existe en `current` (texto insertado ahí): la
    // posición queda antes o después de esa inserción según el sesgo
    // (ver insertBias en translateEdit).
    else if (s.baseLen === 0) candidate = bias === 'before' ? s.current : s.current + s.currentLen;
    else if (pos === s.base) candidate = s.current;
    else if (pos === s.base + s.baseLen) candidate = s.current + s.currentLen;
    else candidate = bias === 'before' ? s.current : s.current + s.currentLen;
    if (result === null) result = candidate;
    else result = bias === 'before' ? Math.min(result, candidate) : Math.max(result, candidate);
  }
  return result ?? 0;
}

/**
 * Aplica al `Y.Text` solo lo que el usuario cambió en el editor: el delta
 * entre `baseValue` (lo que el editor mostraba antes, en su propia
 * representación) y `newValue`, trasladado a las posiciones del `Y.Text`.
 *
 * Hace falta porque el editor de Desktop no devuelve el mismo texto que
 * guarda el `Y.Text`: el round-trip Markdown de Tiptap no es identidad (pierde
 * el `\n` final, escapa `[` como `\[`, cambia marcadores de listas y énfasis),
 * y además `parseNote` recorta el contenido del `.md`. Diffear el `Y.Text`
 * contra `getMarkdown()` mete esas diferencias de representación como si
 * fueran ediciones, y reescribe texto que escribió otro cliente (p. ej.
 * "[WEB]" de logday-web pasa a "\[WEB\]") aunque el usuario no lo haya tocado.
 * Así, todo lo que no editó el usuario queda tal cual en el `Y.Text`.
 */
export function applyEditorEdit(doc: Y.Doc, baseValue: string, newValue: string): void {
  if (baseValue === newValue) return;
  applyChanges(doc, translateEdit(baseValue, newValue, getContentText(doc)));
}

/** El delta `baseValue` → `newValue`, trasladado a las posiciones de
 *  `currentValue` con una alineación `baseValue`↔`currentValue`. Lo que
 *  difiere entre `baseValue` y `currentValue` sin que el delta lo toque
 *  queda tal cual en `currentValue`.
 *
 *  `insertBias` decide el empate cuando una inserción del delta cae justo
 *  donde `currentValue` ya insertó algo: 'before' la deja antes, 'after'
 *  después. Los dos sentidos tienen que coincidir en "lo local queda antes
 *  de lo remoto": applyEditorEdit (delta local sobre el Y.Text con lo
 *  remoto) usa 'before', y rebaseText (delta remoto sobre el texto local
 *  del editor) usa 'after'. Si no, el editor mostraba un orden y el
 *  Y.Text guardaba otro — p. ej. en un daily, el usuario escribiendo al
 *  final del último ítem mientras Web agregaba uno nuevo terminaba con el
 *  texto pegado al ítem de Web. */
function translateEdit(baseValue: string, newValue: string, currentValue: string, insertBias: 'before' | 'after' = 'before'): TextChange[] {
  if (baseValue === currentValue) return diffChanges(baseValue, newValue);
  const spans = alignTexts(baseValue, currentValue);
  const changes = diffChanges(baseValue, newValue).map((change): TextChange => {
    if (change.deleteCount === 0) {
      return { index: mapPosition(spans, change.index, insertBias), deleteCount: 0, insert: change.insert };
    }
    const start = mapPosition(spans, change.index, 'after');
    const end = mapPosition(spans, change.index + change.deleteCount, 'before');
    return { index: start, deleteCount: Math.max(0, end - start), insert: change.insert };
  });
  // La traslación es monótona, pero se recorta por las dudas para que
  // ningún cambio se meta en el tramo del siguiente.
  for (let i = changes.length - 2; i >= 0; i -= 1) {
    const limit = changes[i + 1].index;
    if (changes[i].index > limit) changes[i].index = limit;
    changes[i].deleteCount = Math.min(changes[i].deleteCount, limit - changes[i].index);
  }
  return changes;
}

/** Resultado de `rebaseText`: el texto nuevo y los cambios que se le
 *  aplicaron al texto original, para trasladar posiciones (la selección
 *  del textarea) con `mapTextIndex`. */
export interface RebasedText {
  text: string;
  changes: TextChange[];
}

/**
 * Lleva a `targetValue` el cambio `baseValue` → `newValue`. Es la
 * traslación de `applyEditorEdit` en sentido contrario: ahí el delta va
 * del editor al `Y.Text`, acá un update remoto va del `Y.Text` (antes →
 * después de `Y.applyUpdate`) al Markdown que muestra el editor. Lo que el
 * editor tiene con otra representación (`\[`, marcadores de listas) y el
 * update no toca queda igual.
 */
export function rebaseText(baseValue: string, newValue: string, targetValue: string): RebasedText {
  if (baseValue === newValue) return { text: targetValue, changes: [] };
  const changes = translateEdit(baseValue, newValue, targetValue, 'after');
  let text = targetValue;
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    const { index, deleteCount, insert } = changes[i];
    text = text.slice(0, index) + insert + text.slice(index + deleteCount);
  }
  return { text, changes };
}

/** Posición `index` del texto original trasladada a través de `changes`
 *  (en orden y en coordenadas del original, como los devuelve
 *  `rebaseText`). Una inserción justo en `index` queda después de la
 *  posición, y una posición dentro de un tramo borrado va a su inicio. */
export function mapTextIndex(changes: TextChange[], index: number): number {
  let shift = 0;
  for (const change of changes) {
    if (index <= change.index) break;
    if (index < change.index + change.deleteCount) return change.index + shift;
    shift += change.insert.length - change.deleteCount;
  }
  return index + shift;
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

// ── Notas abiertas en el editor ─────────────────────────────────────────
// Un `NoteEditor` montado tiene su propio `Y.Doc` en memoria. Un
// `content_state` remoto de esa nota tiene que llegar a ese doc, no solo
// al `.ydoc` en disco: si no, el usuario no ve la edición del otro cliente
// hasta reabrir la nota. Se usa un registro (y no un evento del store)
// para que el store sepa si la nota está abierta y, en ese caso, deje que
// el editor sea el único que escribe su `.ydoc`. Con dos escritores, el
// store podía persistir un estado sin las ediciones locales del editor.

/** Aplica un `content_state` remoto (base64) al `Y.Doc` abierto, lo
 *  persiste y devuelve el texto resultante del `Y.Text`. `null` si el
 *  editor ya se estaba cerrando y no lo aplicó. */
export type OpenNoteHandler = (contentStateB64: string) => Promise<string | null>;

const openNoteHandlers = new Map<string, OpenNoteHandler>();

/** Registra el `Y.Doc` abierto de una nota. Devuelve la baja, que solo
 *  quita el registro si sigue siendo este handler (en un remontaje
 *  rápido de la misma nota, el nuevo puede registrarse antes de que el
 *  viejo se dé de baja). */
export function registerOpenNoteDoc(noteId: string, handler: OpenNoteHandler): () => void {
  openNoteHandlers.set(noteId, handler);
  return () => {
    if (openNoteHandlers.get(noteId) === handler) openNoteHandlers.delete(noteId);
  };
}

/** Entrega un `content_state` (base64) al editor de la nota si está
 *  abierta. `null` si no lo está (o se cerró en el medio): quien llama lo
 *  aplica en disco con `applyIncomingContentState`. */
export async function deliverToOpenNote(noteId: string, contentStateB64: string): Promise<{ content: string } | null> {
  const handler = openNoteHandlers.get(noteId);
  if (!handler) return null;
  const content = await handler(contentStateB64);
  return content === null ? null : { content };
}
