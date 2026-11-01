// Arrastrar filas de una lista con el puntero, sin librería (specs/devtools
// design §G.3). Salió de Opciones → Navegación (`SidebarSettings`) porque la
// página de DevTools necesita tres listas a la vez: los grupos y las
// herramientas de cada uno. El asa recibe los manejadores; al soltar, la
// fila arrastrada va a la posición de la fila sobre la que quedó.
import { useRef, useState, type PointerEvent } from 'react';

interface DragState {
  id: string;
  from: number;
  over: number;
}

/** El índice de la fila (`selector`) sobre la que está el puntero. */
function rowIndexAt(list: HTMLElement | null, selector: string, clientY: number): number | null {
  if (!list) return null;
  const rows = [...list.querySelectorAll<HTMLElement>(selector)];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return rows.length ? rows.length - 1 : null;
}

/**
 * `rowSelector`: las filas que cuentan dentro de `listRef` (`[data-section-row]`…).
 * `onDrop(id, to)`: se llama solo si la fila cambió de lugar.
 */
export function useRowDrag<L extends HTMLElement>(rowSelector: string, onDrop: (id: string, to: number) => void) {
  const listRef = useRef<L>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  /** Los manejadores del asa de la fila `index`, con id `id`. */
  const gripProps = (index: number, id: string) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDrag({ id, from: index, over: index });
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!drag) return;
      const over = rowIndexAt(listRef.current, rowSelector, e.clientY);
      if (over !== null && over !== drag.over) setDrag({ ...drag, over });
    },
    onPointerUp: () => {
      if (!drag) return;
      if (drag.over !== drag.from) onDrop(drag.id, drag.over);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
  });

  /** Las clases de la fila: la arrastrada, atenuada; la de destino, con una
   *  raya del acento arriba (si sube) o abajo (si baja). */
  const rowClass = (index: number, id: string) => {
    if (!drag) return '';
    if (drag.id === id) return 'opacity-50';
    if (drag.over !== index) return '';
    return drag.over < drag.from ? 'shadow-[inset_0_2px_0_var(--accent)]' : 'shadow-[inset_0_-2px_0_var(--accent)]';
  };

  return { listRef, drag, gripProps, rowClass };
}
