import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { X, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { AbsenceType } from '../types';
import { t } from '../lib/i18n';
import { toISO } from '../lib/colombianHolidays';
import { AppDatePicker } from './AppDatePicker';

interface Props {
  initialDate?: string; // YYYY-MM-DD, default hoy
  onClose: () => void;
}

const ABSENCE_TYPES: AbsenceType[] = ['incapacidad', 'vacaciones', 'otro'];

export function AbsenceModal({ initialDate, onClose }: Props) {
  const { language, absenceDays, saveAbsenceDay, deleteAbsenceDay, confirmDestructiveActions, showToast } = useAppStore();

  const [date, setDate] = useState(initialDate ?? toISO(new Date()));
  const existing = absenceDays.find((a) => a.date === date) ?? null;
  const [type, setType] = useState<AbsenceType>(existing?.type ?? 'incapacidad');
  const [note, setNote] = useState(existing?.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Al cambiar la fecha, si ya existe una ausencia registrada ese día,
  // se cargan sus valores para editarla en vez de crear una duplicada.
  useEffect(() => {
    setType(existing?.type ?? 'incapacidad');
    setNote(existing?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const handleSave = async () => {
    await saveAbsenceDay({ id: existing?.id ?? uuidv4(), date, type, note: note.trim() || undefined });
    showToast({ kind: 'success', title: t(language, 'absence', 'savedToast') });
    onClose();
  };

  const handleDeleteClick = () => {
    if (!existing) return;
    if (confirmDestructiveActions) setConfirmDelete(true);
    else void doDelete();
  };

  const doDelete = async () => {
    if (!existing) return;
    await deleteAbsenceDay(existing.id);
    showToast({ kind: 'success', title: t(language, 'absence', 'deletedToast') });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {existing ? t(language, 'absence', 'modalTitleEdit') : t(language, 'absence', 'modalTitleNew')}
          </h3>
          <button onClick={onClose} className="text-[var(--text-hint)] hover:text-[var(--text-muted)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'absence', 'dateLabel')}
            </label>
            <AppDatePicker value={date} onChange={setDate} />
          </div>

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
          {existing ? (
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
            <button onClick={handleSave} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
              {t(language, 'absence', 'save')}
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && existing && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Trash2 size={15} className="text-red-400" />
              {t(language, 'absence', 'delete')}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                {t(language, 'absence', 'cancel')}
              </button>
              <button
                onClick={() => { setConfirmDelete(false); void doDelete(); }}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
              >
                {t(language, 'absence', 'delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
