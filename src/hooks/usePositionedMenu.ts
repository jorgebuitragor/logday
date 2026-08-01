import { useEffect, useRef, useState } from 'react';
import {
  placeMenuAtPointer,
  placeMenuNearAnchor,
  type MenuPoint,
  type MenuSize,
  type AnchorRect,
} from '../lib/menuPosition';

interface UsePositionedMenuOptions {
  estimatedSize: MenuSize;
  onClose: () => void;
  closeOnEscape?: boolean;
  padding?: number;
  anchorOptions?: { sideX?: 'right' | 'left'; alignY?: 'start' | 'end'; gap?: number; flip?: boolean };
}

function isAnchorRect(anchor: MenuPoint | AnchorRect): anchor is AnchorRect {
  return 'left' in anchor;
}

/**
 * Encapsula el mecanismo repetido en ~15+ menús/popovers de la app:
 * posición estimada al abrir, medición real en dos pasadas, cierre en
 * click-afuera, cierre con Escape, y recálculo en resize. `anchor` debe
 * ser un valor con identidad estable (p. ej. guardado en estado, no un
 * objeto literal recreado cada render) — igual que el patrón que ya
 * usaban todos los call sites originales.
 */
export function usePositionedMenu(
  anchor: MenuPoint | AnchorRect | null,
  { estimatedSize, onClose, closeOnEscape = true, padding = 8, anchorOptions }: UsePositionedMenuOptions,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint>({ x: 0, y: 0 });
  const [isReady, setIsReady] = useState(false);

  const place = (size: MenuSize) =>
    anchor && isAnchorRect(anchor)
      ? placeMenuNearAnchor(anchor, size, { padding, ...anchorOptions })
      : placeMenuAtPointer(anchor as MenuPoint, size, { padding });

  useEffect(() => {
    if (!anchor) return;
    setIsReady(false);
    setPos(place(estimatedSize));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  useEffect(() => {
    if (!anchor || !ref.current) return;

    const recalc = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPos(place({ width: rect.width, height: rect.height }));
      setIsReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const handleClickOutside = (e: MouseEvent) => {
      // Si el ref no está montado (p. ej. el componente reemplazó su
      // render habitual por otro árbol, como un ConfirmDeleteModal
      // anclado), no hay nada que cerrar — tratarlo como "afuera" cerraría
      // ese otro árbol antes de que su propio click llegue a procesarse.
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  useEffect(() => {
    if (!anchor || !closeOnEscape) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, closeOnEscape]);

  return {
    ref,
    style: {
      position: 'fixed' as const,
      top: pos.y,
      left: pos.x,
      visibility: (isReady ? 'visible' : 'hidden') as 'visible' | 'hidden',
    },
    isReady,
  };
}
