import { v4 as uuidv4 } from 'uuid';

// Cola de escrituras pendientes de mandar a logday-server — persistida
// en localStorage, mismo mecanismo que el resto del config del store
// (gitConfig, syncConfig, ver appStore.ts), no un archivo aparte (ver
// specs/sync-servidor/design.md "Cola de escrituras offline").

export type EntityType =
  | 'task'
  | 'note'
  | 'overtime_entry'
  | 'overtime_month_meta'
  | 'calendar_event'
  | 'absence_day';

// PATCH no crea-si-no-existe salvo overtime_month_meta (ver
// syncMapping.ts) — una entidad recién creada offline tiene que
// drenar como create (POST), no patch, o el servidor la rechaza con
// 404. delete no lleva fields.
export type WriteOp = 'create' | 'patch' | 'delete';

export interface QueuedWrite {
  id: string;                      // uuid de esta entrada, no el id de la entidad
  entity: EntityType;
  entityId: string;                // id de la entidad, o year_month para overtime_month_meta
  op: WriteOp;
  fields: Record<string, unknown>; // payload completo (create) o parcial (patch) en shape del
                                    // servidor (ver syncMapping.ts), updated_at ya congelado al
                                    // momento de la edición — vacío para delete
  queuedAt: string;                // rfc3339, cuándo se encoló (no cuándo se drena)
}

const STORAGE_KEY = 'syncQueue';

function loadQueue(): QueuedWrite[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedWrite[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function enqueue(
  entity: EntityType,
  entityId: string,
  op: WriteOp,
  fields: Record<string, unknown> = {},
): void {
  const queue = loadQueue();
  queue.push({ id: uuidv4(), entity, entityId, op, fields, queuedAt: new Date().toISOString() });
  saveQueue(queue);
}

export function peekQueue(): QueuedWrite[] {
  return loadQueue();
}

export function queueLength(): number {
  return loadQueue().length;
}

function dequeue(id: string): void {
  saveQueue(loadQueue().filter((w) => w.id !== id));
}

/**
 * ¿Hay una entrada en cola, más nueva que `sinceIso`, que también
 * toca ese mismo campo de esa misma entidad? Si sí, una respuesta
 * tardía de un PATCH viejo no debe pisar ese campo — la entrada en
 * cola es, por definición, la edición vigente del usuario (ver
 * "Regla de prioridad cola vs. respuesta tardía" en design.md).
 */
export function hasNewerQueuedField(
  entity: EntityType,
  entityId: string,
  field: string,
  sinceIso: string,
): boolean {
  return loadQueue().some(
    (w) => w.entity === entity && w.entityId === entityId && field in w.fields && w.queuedAt > sinceIso,
  );
}

/**
 * Drena la cola en orden de `queuedAt`, un envío a la vez (no en
 * paralelo — evita reordenar escrituras al mismo campo por timing de
 * red). Corta al primer fallo en vez de saltearlo: si el servidor se
 * cayó de nuevo a mitad del drenado, las entradas restantes quedan en
 * cola en su orden original para el próximo intento.
 */
export async function drainQueue(send: (write: QueuedWrite) => Promise<void>): Promise<void> {
  const queue = [...loadQueue()].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  for (const write of queue) {
    try {
      await send(write);
      dequeue(write.id);
    } catch {
      break;
    }
  }
}
