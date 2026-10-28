import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import type { AnchorRect } from '../../lib/menuPosition';
import { AppCalendarGrid } from '../shared/AppDatePicker';

// Calendario flotante para elegir el vencimiento sin abrir el panel: la
// tecla `d` sobre una fila y "Elegir fecha…" de la barra de selección.
// `anchor` tiene que tener identidad estable (guardado en estado).

interface Props {
  anchor: AnchorRect;
  value?: string;
  onPick: (due: string | undefined) => void;
  onClose: () => void;
}

export function DatePickerPopover({ anchor, value, onPick, onClose }: Props) {
  const language = useAppStore((s) => s.language);
  const { ref, style } = usePositionedMenu(anchor, {
    estimatedSize: { width: 272, height: 320 },
    onClose,
    anchorOptions: { alignY: 'start', gap: 6 },
  });

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={t(language, 'tasks', 'chooseDate')}
      style={{ ...style, zIndex: 9999 }}
      className="w-64 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-3 shadow-2xl"
    >
      <AppCalendarGrid value={value ?? ''} onChange={(iso) => { onPick(iso); onClose(); }} />
      {value && (
        <button
          type="button"
          onClick={() => { onPick(undefined); onClose(); }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1 text-xs text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-red-400"
        >
          <X size={11} /> {t(language, 'tasks', 'dueClear')}
        </button>
      )}
    </div>,
    document.body,
  );
}
