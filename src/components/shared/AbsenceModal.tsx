import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { X, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { AbsenceType } from '../../types/absence';
import { t } from '../../lib/i18n';
import { toISO, dateFromISO } from '../../lib/colombianHolidays';
import { AppDatePicker } from './AppDatePicker';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { ModalOverlay } from './ModalOverlay';
import { ModalPanel } from './ModalPanel';
import { Z_MODAL } from '../../lib/zIndex';

interface Props {
  initialDate?: string; // YYYY-MM-DD, default hoy
  onClose: () => void;
  /** Z_MODAL (default) si se abre suelto; Z_MODAL_NESTED si se abre
   *  desde otro modal (p. ej. AbsenceListModal) — la confirmación de
   *  borrado interna se acomoda 10 por encima de este valor. */
  zIndex?: number;
}

const ABSENCE_TYPES: AbsenceType[] = ['incapacidad', 'vacaciones', 'otro'];

export function AbsenceModal({ initialDate, onClose, zIndex = Z_MODAL }: Props) {
  const { language, absenceDays, saveAbsenceDay, saveAbsenceDayRange, deleteAbsenceDay, confirmDestructiveActions, showToast } = useAppStore();

  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [date, setDate] = useState(initialDate ?? toISO(new Date()));
  const existing = absenceDays.find((a) => a.date === date) ?? null;
  const [type, setType] = useState<AbsenceType>(existing?.type ?? 'incapacidad');
  const [note, setNote] = useState(existing?.note ?? '');
  const [rangeStart, setRangeStart] = useState(date);
  const [rangeEnd, setRangeEnd] = useState(date);
  const confirmDeleteDialog = useConfirmDelete<true>(confirmDestructiveActions);

  // Al cambiar la fecha (modo "un día"), si ya existe una ausencia
  // registrada ese día, se cargan sus valores para editarla en vez de
  // crear una duplicada. No aplica en modo rango — ahí "type"/"note"
  // son el valor a aplicar a todo el rango, no algo cargado de un día
  // puntual.
  useEffect(() => {
    if (mode !== 'single') return;
    setType(existing?.type ?? 'incapacidad');
    setNote(existing?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, mode]);

  const rangeValid = mode === 'single' || dateFromISO(rangeEnd).getTime() >= dateFromISO(rangeStart).getTime();

  const handleSave = async () => {
    if (mode === 'single') {
      await saveAbsenceDay({ id: existing?.id ?? uuidv4(), date, type, note: note.trim() || undefined });
      showToast({ kind: 'success', title: t(language, 'absence', 'savedToast') });
    } else {
      await saveAbsenceDayRange(rangeStart, rangeEnd, type, note.trim() || undefined);
      showToast({ kind: 'success', title: t(language, 'absence', 'savedRangeToast') });
    }
    onClose();
  };

  const handleDeleteClick = () => {
    if (!existing) return;
    confirmDeleteDialog.request(true, () => void doDelete());
  };

  const doDelete = async () => {
    if (!existing) return;
    await deleteAbsenceDay(existing.id);
    showToast({ kind: 'success', title: t(language, 'absence', 'deletedToast') });
    onClose();
  };

  return (
    <ModalOverlay onClose={onClose} zIndex={zIndex} className="px-4">
      <ModalPanel className="w-full max-w-sm rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {mode === 'single' && existing ? t(language, 'absence', 'modalTitleEdit') : t(language, 'absence', 'modalTitleNew')}
          </h3>
          <button onClick={onClose} className="text-[var(--text-hint)] hover:text-[var(--text-muted)]">
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          {(['single', 'range'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                mode === m
                  ? 'bg-indigo-500/15 text-indigo-400'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {t(language, 'absence', m === 'single' ? 'modeSingle' : 'modeRange')}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === 'single' ? (
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
                {t(language, 'absence', 'dateLabel')}
              </label>
              <AppDatePicker value={date} onChange={setDate} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
                  {t(language, 'absence', 'dateFromLabel')}
                </label>
                <AppDatePicker value={rangeStart} onChange={setRangeStart} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
                  {t(language, 'absence', 'dateToLabel')}
                </label>
                <AppDatePicker value={rangeEnd} onChange={setRangeEnd} />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'absence', 'typeLabel')}
            </label>
            <div className="flex gap-2">
              {ABSENCE_TYPES.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setType(opt)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                    type === opt
                      ? 'bg-indigo-500/15 text-indigo-400'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {t(language, 'absence', `type${opt.charAt(0).toUpperCase()}${opt.slice(1)}` as 'typeIncapacidad' | 'typeVacaciones' | 'typeOtro')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'absence', 'noteLabel')}
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t(language, 'absence', 'notePlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {mode === 'single' && existing ? (
            <button
              onClick={handleDeleteClick}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-400/10"
            >
              <Trash2 size={13} /> {t(language, 'absence', 'delete')}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              {t(language, 'absence', 'cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!rangeValid}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t(language, 'absence', 'save')}
            </button>
          </div>
        </div>
      </ModalPanel>

      {confirmDeleteDialog.isOpen && existing && (
        <ConfirmDeleteModal
          title={t(language, 'absence', 'delete')}
          cancelLabel={t(language, 'absence', 'cancel')}
          confirmLabel={t(language, 'absence', 'delete')}
          zIndex={zIndex + 10}
          onCancel={confirmDeleteDialog.cancel}
          onConfirm={() => { confirmDeleteDialog.cancel(); void doDelete(); }}
        />
      )}
    </ModalOverlay>
  );
}
