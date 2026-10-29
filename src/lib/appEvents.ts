// Eventos de la app para las extensiones (R23 de specs/extensiones; la
// primera es el webhook saliente). Los emiten las acciones del store
// después de escribir en disco, así que también cuentan los cambios que
// hace el agente por MCP.
import type { Task } from '../types/task';
import type { OvertimeEntry } from '../types/overtime';

export type AppEvent =
  | { type: 'task.created'; task: Task }
  | { type: 'task.updated'; prev: Task | undefined; next: Task }
  | { type: 'overtime.saved'; entry: OvertimeEntry };

type Listener = (event: AppEvent) => void;
const listeners = new Set<Listener>();

/** Escucha los eventos; devuelve cómo dejar de escuchar. */
export function onAppEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Un oyente que falla no corta a los demás ni a la acción que emitió. */
export function emitAppEvent(event: AppEvent): void {
  for (const fn of [...listeners]) {
    try {
      fn(event);
    } catch (err) {
      console.error('[appEvents]', event.type, err);
    }
  }
}
