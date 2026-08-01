import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { placeMenuAtPointer } from '../lib/menuPosition';

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
  const resolvedZIndex = zIndex ?? (isSoft && !position ? 500 : 10000);

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
    return <PositionedPanel position={position} zIndex={resolvedZIndex}>{panel}</PositionedPanel>;
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center ${isSoft ? 'bg-black/50' : 'bg-black/40'}`}
      style={{ zIndex: resolvedZIndex }}
    >
      {panel}
    </div>
  );
}

function PositionedPanel({
  position,
  zIndex,
  children,
}: {
  position: { x: number; y: number };
  zIndex: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => placeMenuAtPointer(position, ESTIMATED_POSITIONED_SIZE, { padding: 8 }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const recalc = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPos(placeMenuAtPointer(position, { width: rect.width, height: rect.height }, { padding: 8 }));
      setReady(true);
    };
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.x, position.y]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex, visibility: ready ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}
