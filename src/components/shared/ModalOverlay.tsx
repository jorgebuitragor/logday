import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Z_MODAL } from '../../lib/zIndex';

interface ModalOverlayProps {
  /** Si se omite, el modal NO cierra al hacer click en el fondo. */
  onClose?: () => void;
  blur?: boolean;
  zIndex?: number;
  /** 'center' (default) centra el panel; 'start' lo alinea arriba (p. ej. SearchModal). */
  align?: 'center' | 'start';
  className?: string;
  children: ReactNode;
}

export function ModalOverlay({ onClose, blur = true, zIndex = Z_MODAL, align = 'center', className, children }: ModalOverlayProps) {
  const alignClass = align === 'start' ? 'items-start justify-center' : 'items-center justify-center';
  // Portal a document.body: si el modal se dispara desde un componente anidado
  // dentro de un ancestro con transform/filter (p. ej. una fila de lista
  // animada), "fixed" quedaría atrapado dentro de ese ancestro en vez de
  // cubrir todo el viewport.
  return createPortal(
    <div
      className={`fixed inset-0 flex ${alignClass} bg-black/60 ${blur ? 'backdrop-blur-sm' : ''} ${className ?? ''}`}
      style={{ zIndex }}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}
