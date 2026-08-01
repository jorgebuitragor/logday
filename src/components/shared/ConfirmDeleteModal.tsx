import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import { ModalOverlay } from './ModalOverlay';
import { ModalPanel } from './ModalPanel';
import { Z_MODAL } from '../../lib/zIndex';

interface ConfirmDeleteModalProps {
  title: React.ReactNode;
  message?: React.ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'solid' | 'soft';
  zIndex?: number;
  /** Si se da, se renderiza anclado a este punto (sin backdrop) en vez de centrado. */
  position?: { x: number; y: number };
}

const ESTIMATED_POSITIONED_SIZE = { width: 260, height: 170 };

export function ConfirmDeleteModal({
  title,
  message,
  cancelLabel,
  confirmLabel,
  onConfirm,
  onCancel,
  variant = 'solid',
  zIndex,
  position,
}: ConfirmDeleteModalProps) {
  const isSoft = variant === 'soft';
  const compact = !!position;
  // El backdrop/panel "soft" (DailyEditor/DailyList) usa un juego de
  // tokens de color distinto al resto (bg-panel/border planos en vez de
  // bg-elevated/border-card) — no es un descuido, así estaban ambas
  // ocurrencias originales, así que se preserva atado a la variante.
  const resolvedZIndex = zIndex ?? Z_MODAL;

  const confirmButtonClass = isSoft
    ? 'rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20'
    : 'rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600';

  const buttonRowClass = `flex justify-end gap-2 ${isSoft || !message ? 'mt-4' : ''}`;

  const panel = (
    <div
      className={`modal-spring-in rounded-2xl shadow-2xl ${
        compact
          ? 'w-64 p-4 border border-[var(--border-card)] bg-[var(--bg-elevated)]'
          : isSoft
            ? 'w-80 p-5 border border-[var(--border)] bg-[var(--bg-panel)]'
            : 'w-80 p-5 border border-[var(--border-card)] bg-[var(--bg-elevated)]'
      }`}
    >
      {isSoft ? (
        <div className="mb-3 flex items-center gap-2 text-red-400">
          <Trash2 size={compact ? 14 : 16} />
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold`}>{title}</span>
        </div>
      ) : (
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Trash2 size={15} className="text-red-400" />
          {title}
        </div>
      )}
      {message && (
        <div
          className={
            isSoft
              ? `text-xs leading-relaxed text-[var(--text-hint)] ${compact ? 'mb-3' : ''}`
              : 'mb-4 text-xs text-[var(--text-secondary)]'
          }
        >
          {message}
        </div>
      )}
      <div className={buttonRowClass}>
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
        >
          {cancelLabel}
        </button>
        <button onClick={onConfirm} className={confirmButtonClass}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );

  if (position) {
    return (
      <PositionedPanel position={position} zIndex={resolvedZIndex} onCancel={onCancel}>
        {panel}
      </PositionedPanel>
    );
  }

  return (
    <ModalOverlay zIndex={resolvedZIndex}>
      <ModalPanel>{panel}</ModalPanel>
    </ModalOverlay>
  );
}

function PositionedPanel({
  position,
  zIndex,
  onCancel,
  children,
}: {
  position: { x: number; y: number };
  zIndex: number;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const { ref, style } = usePositionedMenu(position, {
    estimatedSize: ESTIMATED_POSITIONED_SIZE,
    onClose: onCancel,
  });

  return createPortal(
    <div ref={ref} style={{ ...style, zIndex }}>
      {children}
    </div>,
    document.body,
  );
}
