import type { ReactNode } from 'react';
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
  return (
    <div
      className={`fixed inset-0 flex ${alignClass} bg-black/60 ${blur ? 'backdrop-blur-sm' : ''} ${className ?? ''}`}
      style={{ zIndex }}
      onClick={onClose}
    >
      {children}
    </div>
  );
}
