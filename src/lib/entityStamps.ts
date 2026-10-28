import type { Note } from '../types/note';
import type { Task } from '../types/task';
import { nowInstant } from './localDate';

// Cuándo se escriben las marcas `created`, `completedAt` y `updated` (etapa 2
// de specs/fechas-creacion-edicion). Se escriben como instantes de
// `nowInstant()`. Los `YYYY-MM-DD` legados no se tocan: solo cambia una marca
// cuando estas reglas lo piden, nunca por releer o resincronizar. Las mismas
// reglas (D1 y D2) valen en Web y Mobile.

// ── Tareas (D2) ─────────────────────────────────────────────────────────────

/** Marcas de una tarea nueva: `created` siempre, y `completedAt` con el mismo
 *  instante si nace ya hecha. */
export function newTaskStamps(status: Task['status'], now: string = nowInstant()): Pick<Task, 'created' | 'completedAt'> {
  return status === 'done' ? { created: now, completedAt: now } : { created: now };
}

/** `completedAt` que le toca a `next` al guardarla sobre `prev`:
 *  - pasa de no-`done` a `done`: el instante actual, aunque `next` traiga un
 *    valor viejo (de otro cliente que no lo limpió al reabrir);
 *  - sigue en `done`: conserva su valor tal cual, también si está vacío. Una
 *    tarea legada hecha sin `completedAt` no se da por completada hoy porque
 *    se le edite el título (igual que en Web y Mobile);
 *  - no está en `done`: ninguno (se limpia).
 *  Sin `prev` no se sabe si es una transición: se conserva lo que traiga y,
 *  si no trae nada, se sella. */
export function nextCompletedAt(
  prev: Pick<Task, 'status' | 'completedAt'> | undefined,
  next: Pick<Task, 'status' | 'completedAt'>,
  now: () => string = nowInstant,
): string | undefined {
  if (next.status !== 'done') return undefined;
  if (!prev) return next.completedAt || now();
  if (prev.status !== 'done') return now();
  return next.completedAt || prev.completedAt || undefined;
}

/** La tarea con el `completedAt` con que se guarda: D2 (`nextCompletedAt`),
 *  salvo en un deshacer (`restore`), que trae el valor exacto de antes de la
 *  acción. Sin valor, la tarea queda sin la clave. */
export function withCompletedAt(
  prev: Task | undefined,
  next: Task,
  opts: { restore?: boolean; now?: () => string } = {},
): Task {
  const task: Task = { ...next };
  const completedAt = opts.restore ? task.completedAt : nextCompletedAt(prev, task, opts.now);
  if (completedAt) task.completedAt = completedAt;
  else delete task.completedAt;
  return task;
}

// ── Deshacer ────────────────────────────────────────────────────────────────

/** Campos de una tarea que devuelve el deshacer de un cambio rápido (estado,
 *  vencimiento, proyecto) y su `completedAt`. */
export const UNDO_TASK_FIELDS = ['status', 'due', 'project', 'completedAt'] as const;

/** Lo que el deshacer debe restaurar: los campos que cambiaron entre la tarea
 *  de antes de la acción y la que quedó guardada. Se compara con la guardada
 *  (no con la que se pidió) porque `updateTask` es quien decide `completedAt`:
 *  así deshacer un "reabrir" recupera el instante de completado original y
 *  deshacer un "completar" lo deja como estaba, también si estaba vacío. */
export function undoRestore(before: Task, after: Task): Partial<Task> {
  const restore: Partial<Task> = {};
  for (const f of UNDO_TASK_FIELDS) {
    if (before[f] !== after[f]) (restore as Record<string, unknown>)[f] = before[f];
  }
  return restore;
}

/** Aplica lo que restaura el deshacer sobre la tarea como esté ahora, con
 *  `completedAt` exacto: si antes no tenía, queda sin la clave. Lo que se
 *  guarda así no pasa por `nextCompletedAt` (`updateTask` con `restore`). */
export function applyUndoRestore(current: Task, restore: Partial<Task>): Task {
  const task: Task = { ...current, ...restore };
  if (!task.completedAt) delete task.completedAt;
  return task;
}

// ── Notas (D1) ──────────────────────────────────────────────────────────────

/** Marcas de una nota nueva, duplicada o importada. */
export function newNoteStamps(now: string = nowInstant()): Pick<Note, 'created' | 'updated'> {
  return { created: now, updated: now };
}

/** Qué cambió en un guardado: los metadatos (título, carpeta, tags, fijado)
 *  sellan al momento; el contenido solo, con el límite de 60 s. */
export type NoteSaveKind = 'none' | 'content' | 'meta';

export function noteSaveKind(prev: Note | undefined, next: Note): NoteSaveKind {
  if (!prev) return 'meta';
  if (
    prev.title !== next.title
    || prev.folder !== next.folder
    || prev.pinned !== next.pinned
    || JSON.stringify(prev.tags) !== JSON.stringify(next.tags)
  ) return 'meta';
  return prev.content !== next.content ? 'content' : 'none';
}

/** Intervalo mínimo entre dos sellos de `updated` por editar el contenido. */
export const NOTE_UPDATED_MIN_INTERVAL_MS = 60_000;

/** Límite del sello de `updated` mientras se edita el contenido (D1).
 *
 *  El editor autoguarda cada 600 ms, y sellar `updated` en cada guardado
 *  mandaba un PATCH de metadatos por guardado (más su eco) y movía la nota en
 *  "ordenar por edición" sin parar. Por eso el límite vive en el store y no en
 *  el editor: el `.md` sigue guardando el contenido en cada autoguardado y
 *  solo se espacia el sello, sea quien sea el que llame a `updateNote`.
 *
 *  Por nota recuerda cuándo se selló por última vez en esta sesión y si quedó
 *  contenido sin sellar. Un guardado de contenido sella si pasaron 60 s desde
 *  el último sello; si no, queda pendiente hasta el próximo guardado que pase
 *  el límite o hasta salir de la nota (`leaving`), que sella lo pendiente.
 *  Un cambio de metadatos sella siempre y cubre lo pendiente. */
export class NoteUpdatedThrottle {
  private lastStampAt = new Map<string, number>();
  private pending = new Set<string>();

  constructor(
    private readonly minIntervalMs: number = NOTE_UPDATED_MIN_INTERVAL_MS,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  /** Si este guardado debe sellar `updated` ahora. Si sella, lo registra. */
  shouldStamp(noteId: string, kind: NoteSaveKind, leaving = false): boolean {
    let stamp = false;
    if (kind === 'meta') {
      stamp = true;
    } else if (kind === 'content') {
      const last = this.lastStampAt.get(noteId);
      if (last === undefined || this.clock() - last >= this.minIntervalMs) stamp = true;
      else this.pending.add(noteId);
    }
    if (!stamp && leaving && this.pending.has(noteId)) stamp = true;
    if (stamp) this.markStamped(noteId);
    return stamp;
  }

  /** Registra un sello hecho fuera de `shouldStamp` (crear, mover). */
  markStamped(noteId: string): void {
    this.lastStampAt.set(noteId, this.clock());
    this.pending.delete(noteId);
  }

  /** Si hay contenido guardado sin sellar. */
  hasPending(noteId: string): boolean {
    return this.pending.has(noteId);
  }

  /** Olvida la nota (se borró). */
  forget(noteId: string): void {
    this.lastStampAt.delete(noteId);
    this.pending.delete(noteId);
  }
}

/** La nota que se guarda: con `updated` sellado ahora si toca, o con el
 *  `updated` que ya tenía en el store si no (no el de `next`, que puede venir
 *  de un snapshot viejo del editor). */
export function stampNoteSave(
  prev: Note | undefined,
  next: Note,
  throttle: NoteUpdatedThrottle,
  opts: { leaving?: boolean; now?: () => string } = {},
): Note {
  const stamp = throttle.shouldStamp(next.id, noteSaveKind(prev, next), opts.leaving);
  if (stamp) return { ...next, updated: (opts.now ?? nowInstant)() };
  return { ...next, updated: prev?.updated ?? next.updated };
}
