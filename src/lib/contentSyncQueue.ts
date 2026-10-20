// Cola de contenido CRDT (Yjs) pendiente de mandar a logday-server —
// persistida en localStorage, igual que syncQueue.ts, pero NO es un array
// FIFO: es un mapa por (entidad, key). Cada guardado nuevo pisa la entrada
// anterior de la misma entidad — el estado Yjs ya viaja completo y
// acumulativo (ver noteContentSync.ts/dailyContentSync.ts), no hace falta
// reenviar historial, así que coalescer sale gratis. syncQueue.ts no encaja
// acá: su semántica de "cola gana sobre respuesta tardía"
// (hasNewerQueuedField) resuelve un problema de LWW por campo que Yjs no
// tiene (merge conmutativo).
//
// Entidad + key en vez de solo key: hoy sirve a Note (key = uuid) y Daily
// entry (key = fecha YYYY-MM-DD) — formatos distintos que no colisionan en
// la práctica, pero separar por entidad evita depender de eso a futuro.

export type ContentEntity = 'note' | 'daily_entry';

export interface QueuedContent {
  updateB64: string;
  queuedAt: string; // rfc3339
}

const STORAGE_KEY = 'contentSyncQueue';

function storageKey(entity: ContentEntity, key: string): string {
  return `${entity}:${key}`;
}

function loadQueue(): Record<string, QueuedContent> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveQueue(queue: Record<string, QueuedContent>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function enqueue(entity: ContentEntity, key: string, updateB64: string): void {
  const queue = loadQueue();
  queue[storageKey(entity, key)] = { updateB64, queuedAt: new Date().toISOString() };
  saveQueue(queue);
}

function dequeue(storageKeyStr: string): void {
  const queue = loadQueue();
  delete queue[storageKeyStr];
  saveQueue(queue);
}

export function queueLength(): number {
  return Object.keys(loadQueue()).length;
}

/**
 * Drena la cola en orden de `queuedAt`, una entrada a la vez. Mismo
 * contrato que syncQueue.drainQueue: si `send` lanza (fallo transitorio —
 * red caída, 5xx), corta el drenado ahí; las entradas restantes quedan en
 * cola para el próximo intento.
 */
export async function drain(
  send: (entity: ContentEntity, key: string, updateB64: string) => Promise<void>
): Promise<void> {
  const queue = loadQueue();
  const entries = Object.entries(queue).sort((a, b) => a[1].queuedAt.localeCompare(b[1].queuedAt));
  for (const [storageKeyStr, entry] of entries) {
    const sepIdx = storageKeyStr.indexOf(':');
    if (sepIdx === -1) {
      // Formato viejo (de antes de generalizar esta cola a
      // "entidad:key" — era solo el noteId, sin prefijo). No hay forma
      // segura de saber a qué entidad pertenecía esta entrada — se
      // descarta en vez de arriesgar mandarla a la entidad equivocada
      // (bug real: esto llegó a mandar ids de Note al endpoint de
      // daily-entries, creando filas basura del lado servidor).
      dequeue(storageKeyStr);
      continue;
    }
    const entity = storageKeyStr.slice(0, sepIdx) as ContentEntity;
    const key = storageKeyStr.slice(sepIdx + 1);
    try {
      await send(entity, key, entry.updateB64);
      dequeue(storageKeyStr);
    } catch {
      break;
    }
  }
}
