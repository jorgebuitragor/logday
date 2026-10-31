// El teclado de la ayuda contextual (specs/ayuda-contextual AY7–AY10), sin
// React ni DOM, para probarlo solo.

/** Lo que se lee de un evento de teclado. */
export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** AY7: a qué control va Tab dentro de la ayuda, en ciclo. `current` es el
 *  índice del control con el foco, o -1 si lo tiene el contenedor: desde
 *  ahí, Tab va al primero y ⇧Tab al último. Sin controles, -1. */
export function nextTrapIndex(current: number, count: number, back: boolean): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return back ? count - 1 : 0;
  return back ? (current - 1 + count) % count : (current + 1) % count;
}

/** AY9: las teclas que siguen hasta los atajos globales de la app (⌘N, ⌘T,
 *  ⌘F, ⌘0…⌘9: ⌘ o Ctrl con una sola tecla, sin ⇧ ni ⌥). Las demás no
 *  salen de la ayuda.
 *
 *  Por qué no se corta todo: React escucha los eventos del portal en
 *  `document.body`, así que `stopPropagation()` en el portal también para
 *  el evento nativo antes de `window`, donde escuchan los atajos globales
 *  (App.tsx). Los de las pantallas que no deben llegar (Espacio en el
 *  Pomodoro, ⌘⇧C o ⌘↵ en DevTools) llevan ⇧, ⌥ o una tecla con nombre. */
export function passesToApp(e: KeyLike): boolean {
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.length === 1 && e.key !== ' ';
}

/** AY8: Esc cierra solo la ayuda. Se llama desde un `keydown` de `window`
 *  en captura, antes que el de Opciones (SettingsModal) o el buscador de
 *  DevTools. Devuelve si la cerró. */
export function closeOnEscape(
  e: Pick<KeyboardEvent, 'key' | 'preventDefault' | 'stopPropagation'>,
  close: () => void,
): boolean {
  if (e.key !== 'Escape') return false;
  e.preventDefault();
  e.stopPropagation();
  close();
  return true;
}

/** AY10: un desplazamiento cierra la ayuda, salvo el del propio popover,
 *  que tiene su scroll. */
export function scrollCloses(target: unknown, popover: { contains: (node: Node | null) => boolean } | null): boolean {
  if (!popover) return false;
  return !popover.contains(target as Node | null);
}
