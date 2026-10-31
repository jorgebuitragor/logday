// El teclado y la posición de la ayuda contextual (specs/ayuda-contextual
// AY7–AY10, AY24–AY29), sin React ni DOM, para probarlos solos.
import type { AnchorRect } from '../../lib/menuPosition';

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
  if (isHelpShortcut(e)) return true;
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.length === 1 && e.key !== ' ';
}

/** AY27: ⌘/ (Ctrl+/ fuera de macOS) abre o cierra la ayuda de la pantalla.
 *  Como los demás atajos globales de App.tsx, vale ⌘ o Ctrl. Se mira la
 *  tecla escrita, no su posición: en el teclado en español "/" es ⇧7, así
 *  que ⇧ no lo descarta; en el inglés, ⇧/ escribe "?" (⌘? es la ayuda del
 *  sistema en macOS) y no cuenta. Con ⌥ no, para no pisar caracteres. */
export function isHelpShortcut(e: KeyLike): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && e.key === '/';
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

interface Container {
  contains: (node: Node | null) => boolean;
}

/** AY10: un desplazamiento cierra la ayuda solo si mueve el botón que la
 *  abrió (el popover quedaría flotando lejos de él). El del propio popover,
 *  que tiene su scroll, y el de la pantalla de al lado, no: el botón está
 *  fijo en el menú lateral y se puede leer la ayuda mientras se desplaza. */
export function scrollCloses(target: unknown, popover: Container | null, trigger: Node | null): boolean {
  if (!popover || !trigger) return false;
  const scrolled = target as (Container & Node) | null;
  if (!scrolled || typeof scrolled.contains !== 'function') return false;
  if (popover.contains(scrolled)) return false;
  return scrolled.contains(trigger);
}

/** AY28: dónde se ancla la ayuda. A la derecha del menú lateral (`edge`, su
 *  borde derecho), fuera de él y sobre el contenido, a la altura del botón;
 *  `menuPosition` la alinea por abajo con él y la voltea si no cabe. Sin
 *  botón visible (no se dibuja o mide 0), en la esquina inferior izquierda. */
export function helpAnchor(button: AnchorRect | null, edge: number | null, viewportHeight: number): AnchorRect {
  const visible = button && (button.right > button.left || button.bottom > button.top);
  if (!visible) return { left: 0, right: 0, top: viewportHeight, bottom: viewportHeight };
  const x = Math.max(edge ?? button.right, button.right);
  return { left: x, right: x, top: button.top, bottom: button.bottom };
}
