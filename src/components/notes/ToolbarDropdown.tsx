import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Z_TOOLBAR_MENU } from '../../lib/zIndex';

interface Props {
  /** El botón (o su contenedor) del que cuelga el menú. */
  anchorRef: RefObject<HTMLElement | null>;
  /** 'end': el borde derecho del menú con el del botón (por defecto);
   *  'start': el borde izquierdo. Si no cabe, se usa el otro. */
  align?: 'start' | 'end';
  /** Identifica el menú para el cierre por clic afuera
   *  (`[data-toolbar-menu="…"]`), porque ya no está dentro del botón. */
  name: string;
  className?: string;
  onMouseDown?: (e: MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

const MARGIN = 8;
const GAP = 4;

// Menú desplegable de la barra del editor de notas.
//
// Antes cada menú era un `absolute top-full right-0` dentro de la barra.
// Cuando el editor es angosto la barra se parte en dos filas y un botón
// puede quedar a la izquierda: el menú, alineado a la derecha del botón,
// se salía por la izquierda y la columna del editor lo recortaba (visto
// con los menús de Tabla y de Mermaid). Ahora se dibuja en un portal con
// posición fija, fuera de la columna, y se ubica donde quepa: alineado al
// borde que corresponda, dentro de la ventana, y hacia arriba si abajo no
// hay lugar.
export function ToolbarDropdown({ anchorRef, align = 'end', name, className, onMouseDown, children }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const a = anchor.getBoundingClientRect();
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const endLeft = a.right - width;
      const startLeft = a.left;
      let left = align === 'end'
        ? (endLeft >= MARGIN ? endLeft : startLeft)
        : (startLeft + width <= vw - MARGIN ? startLeft : endLeft);
      left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));

      let top = a.bottom + GAP;
      if (top + height > vh - MARGIN && a.top - height - GAP >= MARGIN) top = a.top - height - GAP;
      setPosition({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, align]);

  return createPortal(
    <div
      ref={menuRef}
      data-toolbar-menu={name}
      className={className}
      onMouseDown={onMouseDown}
      style={{
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        zIndex: Z_TOOLBAR_MENU,
        // Hasta medirlo, invisible: evita un parpadeo en la esquina.
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
