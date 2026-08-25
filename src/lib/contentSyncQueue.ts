// Cola de contenido de notas (Yjs) pendiente de mandar a logday-server —
// persistida en localStorage, igual que syncQueue.ts, pero NO es un array
// FIFO: es un mapa por noteId. Cada guardado nuevo pisa la entrada anterior
// de la misma nota — el estado Yjs ya viaja completo y acumulativo (ver
// noteContentSync.ts), no hace falta reenviar historial, así que coalescer
// por nota sale gratis. syncQueue.ts no encaja acá: su semántica de "cola
// gana sobre respuesta tardía" (hasNewerQueuedField) resuelve un problema
// de LWW por campo que Yjs no tiene (merge conmutativo).

export interface QueuedContent {
  updateB64: string;
  queuedAt: string; // rfc3339
}

const STORAGE_KEY = 'contentSyncQueue';

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

export function enqueue(noteId: string, updateB64: string): void {
  const queue = loadQueue();
  queue[noteId] = { updateB64, queuedAt: new Date().toISOString() };
  saveQueue(queue);
}

function dequeue(noteId: string): void {
  const queue = loadQueue();
  delete queue[noteId];
  saveQueue(queue);
}

export function queueLength(): number {
  return Object.keys(loadQueue()).length;
}

/**
 * Drena la cola en orden de `queuedAt`, una nota a la vez. Mismo contrato
 * que syncQueue.drainQueue: si `send` lanza (fallo transitorio — red caída,
 * 5xx), corta el drenado ahí; las entradas restantes quedan en cola para el
 * próximo intento.
 */
export async function drain(send: (noteId: string, updateB64: string) => Promise<void>): Promise<void> {
  const queue = loadQueue();
  const entries = Object.entries(queue).sort((a, b) => a[1].queuedAt.localeCompare(b[1].queuedAt));
  for (const [noteId, entry] of entries) {
    try {
      await send(noteId, entry.updateB64);
      dequeue(noteId);
    } catch {
      break;
    }
  }
}
