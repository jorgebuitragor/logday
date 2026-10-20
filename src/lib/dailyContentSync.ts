import * as Y from 'yjs';
import { fs } from './invoke';
import { getContentText, applyTextEdit, bytesToBase64, base64ToBytes } from './noteContentSync';

// ── Sync de contenido de Daily entries vía CRDT (Yjs) ────────────────────
// Mismo mecanismo que Note.content (ver noteContentSync.ts) — la key CRDT
// "content" es la misma para todo texto CRDT del lado servidor
// (internal/crdt/text.go, textKey = "content", compartida entre dominios,
// no una key distinta por entidad), así que las primitivas de diff/encode
// se reusan tal cual. Lo único propio de Daily es dónde vive el sidecar:
// un daily no tiene archivo propio (vive como sección dentro del archivo
// del mes, ver dailyFileFormat.ts), así que el `.ydoc` es un archivo
// hermano nuevo junto al archivo del mes, nombrado por fecha.

export { applyTextEdit, getContentText };

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
