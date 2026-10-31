// "Ver todos los atajos" de la ayuda de Tareas (specs/ayuda-contextual AY17,
// AY25). La ayuda vive en el menú lateral y la hoja de atajos en cada vista
// (Lista, Kanban, Calendario), con su propio estado: la ayuda la pide con un
// evento de ventana, como `logday:new-task`, y la abre la vista activa.
import { useEffect, useEffectEvent } from 'react';

export const TASK_SHORTCUTS_EVENT = 'logday:show-task-shortcuts';

/** Pide que la vista de Tareas activa abra `TaskShortcutsSheet`. */
export function requestTaskShortcuts(target: EventTarget = window): void {
  target.dispatchEvent(new Event(TASK_SHORTCUTS_EVENT));
}

/** Escucha el pedido; devuelve cómo dejar de escucharlo. */
export function onTaskShortcutsRequest(show: () => void, target: EventTarget = window): () => void {
  const handler = () => show();
  target.addEventListener(TASK_SHORTCUTS_EVENT, handler);
  return () => target.removeEventListener(TASK_SHORTCUTS_EVENT, handler);
}

/** Las tres vistas están montadas a la vez (cada una se dibuja solo si es la
 *  actual): escucha solo la que está activa, para no abrir tres hojas. */
export function useTaskShortcutsRequest(active: boolean, show: () => void): void {
  const onShow = useEffectEvent(show);
  useEffect(() => {
    if (!active) return;
    return onTaskShortcutsRequest(() => onShow());
  }, [active]);
}
