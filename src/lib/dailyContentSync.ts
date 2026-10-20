import * as Y from 'yjs';
import { fs } from './invoke';
import { getContentText, applyTextEdit, applyEditorEdit, rebaseText, bytesToBase64, base64ToBytes } from './noteContentSync';

// ── Sync de contenido de Daily entries vía CRDT (Yjs) ────────────────────
// Mismo mecanismo que Note.content (ver noteContentSync.ts) — la key CRDT
// "content" es la misma para todo texto CRDT del lado servidor
// (internal/crdt/text.go, textKey = "content", compartida entre dominios,
// no una key distinta por entidad), así que las primitivas de diff/encode
// se reusan tal cual. Lo único propio de Daily es dónde vive el sidecar:
// un daily no tiene archivo propio (vive como sección dentro del archivo
// del mes, ver dailyFileFormat.ts), así que el `.ydoc` es un archivo
// hermano nuevo junto al archivo del mes, nombrado por fecha.

export { applyTextEdit, getContentText, rebaseText };

/**
 * Aplica al `.ydoc` del día solo lo que cambió el usuario en el editor
 * (`baseText` → `newText`), no el texto completo. El editor puede estar
 * mostrando una versión vieja del día (llegó una edición remota mientras
 * se escribía): diffear su texto completo contra el `Y.Text` interpretaba
 * lo remoto que el editor todavía no tenía como "borrado por el usuario"
 * y lo eliminaba — mismo bug que se corrigió en notas (applyEditorEdit,
 * specs/sync-servidor). Devuelve el texto ya mezclado y el update a mandar
 * al servidor (`null` si no cambió nada).
 *
 * Si el día todavía no tiene `.ydoc` (un daily de antes del sync), se
 * siembra con `baseText` antes de aplicar el delta, como hace la
 * migración con las notas.
 */
export async function applyDailyEditorEdit(
  basePath: string,
  date: string,
  baseText: string,
  newText: string,
): Promise<{ merged: string; updateB64: string | null }> {
  let doc = await loadPersistedDailyYDoc(basePath, date);
  if (!doc) {
    doc = new Y.Doc();
    if (baseText) applyTextEdit(doc, '', baseText);
  }
  const before = getContentText(doc);
  applyEditorEdit(doc, baseText, newText);
  const merged = getContentText(doc);
  let updateB64: string | null = null;
  if (merged !== before) {
    await persistDailyYDoc(basePath, date, doc);
    updateB64 = bytesToBase64(Y.encodeStateAsUpdate(doc));
  }
  doc.destroy();
  return { merged, updateB64 };
}

export function dailyContentStatePath(basePath: string, date: string): string {
  const year = date.slice(0, 4);
  const month = date.slice(5, 7);
  return `${basePath}/dailys/${year}/${month}/${date}.ydoc`;
}

export async function readPersistedDailyUpdate(basePath: string, date: string): Promise<Uint8Array | null> {
  const path = dailyContentStatePath(basePath, date);
  const exists = await fs.exists(path).catch(() => false);
  if (!exists) return null;
  const b64 = await fs.readBinary(path);
  return base64ToBytes(b64);
}

export async function loadPersistedDailyYDoc(basePath: string, date: string): Promise<Y.Doc | null> {
  const bytes = await readPersistedDailyUpdate(basePath, date);
  if (!bytes) return null;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  return doc;
}

export async function persistDailyYDoc(basePath: string, date: string, ydoc: Y.Doc): Promise<void> {
  const year = date.slice(0, 4);
  const month = date.slice(5, 7);
  await fs.createDir(`${basePath}/dailys/${year}/${month}`).catch(() => {});
  const b64 = bytesToBase64(Y.encodeStateAsUpdate(ydoc));
  await fs.writeBinary(dailyContentStatePath(basePath, date), b64);
}

export async function deleteDailyContentState(basePath: string, date: string): Promise<void> {
  await fs.deleteFile(dailyContentStatePath(basePath, date)).catch(() => {});
}

/** Aplica un `content_state` (base64) recibido del servidor (echo del
 *  propio push, o /sync/changes) al estado CRDT local de un daily. Pura
 *  E/S de archivos — quien llama reescribe la sección del día en el
 *  archivo del mes con el `content` devuelto. Merge conmutativo/idempotente
 *  (propiedad de Yjs), igual que applyIncomingContentState de notas. */
export async function applyIncomingDailyContentState(
  basePath: string,
  date: string,
  contentStateB64: string
): Promise<{ content: string }> {
  const existing = await loadPersistedDailyYDoc(basePath, date);
  const doc = existing ?? new Y.Doc();
  Y.applyUpdate(doc, base64ToBytes(contentStateB64));
  await persistDailyYDoc(basePath, date, doc);
  const content = getContentText(doc);
  doc.destroy();
  return { content };
}

// ── Estado de un panel del editor de Dailys (DailyEditor.tsx) ──

export interface PanelState {
  date: string | null;
  base: string;
  text: string;
}

/** Lleva al panel lo que llegó del store para su día. Devuelve el texto
 *  que debe mostrar el editor, o `null` si no cambia nada. Al cambiar de
 *  día se carga tal cual; si es el mismo día, lo que el usuario escribió
 *  desde la base se rebasa sobre lo nuevo en vez de pisarse. */
export function syncPanel(panel: PanelState, date: string | null, incoming: string): string | null {
  if (panel.date !== date) {
    panel.date = date;
    panel.base = incoming;
    panel.text = incoming;
    return incoming;
  }
  if (!date || incoming === panel.base) return null;
  const next = panel.text === panel.base ? incoming : rebaseText(panel.base, incoming, panel.text).text;
  panel.base = incoming;
  panel.text = next;
  return next;
}
