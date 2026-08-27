import { useMemo, useState } from 'react';
import { X, CalendarOff, Pencil, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { AbsenceDay } from '../../types/absence';
import { t } from '../../lib/i18n';
import { absenceTypeLabel } from '../../lib/absenceLabel';
import { ModalOverlay } from './ModalOverlay';
import { ModalPanel } from './ModalPanel';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { AbsenceModal } from './AbsenceModal';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { Z_MODAL_NESTED } from '../../lib/zIndex';

function formatAbsenceDate(iso: string, language: 'es' | 'en'): string {
  const locale = language === 'es' ? 'es-CO' : 'en-US';
  const d = new Date(iso + 'T12:00:00');
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function AbsenceListModal({ onClose }: { onClose: () => void }) {
  const { language, absenceDays, deleteAbsenceDay, confirmDestructiveActions, showToast } = useAppStore();

  const sorted = useMemo(
    () => [...absenceDays].sort((a, b) => b.date.localeCompare(a.date)),
    [absenceDays],
  );

  const [editDate, setEditDate] = useState<string | null>(null);
  const confirmDeleteDialog = useConfirmDelete<AbsenceDay>(confirmDestructiveActions);

  const doDelete = async (absence: AbsenceDay) => {
    await deleteAbsenceDay(absence.id);
    showToast({ kind: 'success', title: t(language, 'absence', 'deletedToast') });
  };

  return (
    <ModalOverlay onClose={onClose} className="px-4">
      <ModalPanel className="flex h-[80vh] max-h-[600px] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t(language, 'absence', 'listTitle')}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <CalendarOff size={20} className="mb-2 text-[var(--text-hint)]" />
              <p className="text-xs text-[var(--text-hint)]">{t(language, 'absence', 'listEmpty')}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {sorted.map((absence) => (
                <div
                  key={absence.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--text-secondary)]">
                      {formatAbsenceDate(absence.date, language)}
                    </p>
                    <p className="truncate text-[10px] text-[var(--text-hint)]">
                      {absenceTypeLabel(language, absence.type)}
                      {absence.note ? ` · ${absence.note}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditDate(absence.date)}
                    title={t(language, 'absence', 'modalTitleEdit')}
                    className="shrink-0 rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-indigo-400"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => confirmDeleteDialog.request(absence, (a) => void doDelete(a))}
                    title={t(language, 'absence', 'delete')}
                    className="shrink-0 rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalPanel>

      {editDate && (
        <AbsenceModal initialDate={editDate} zIndex={Z_MODAL_NESTED} onClose={() => setEditDate(null)} />
      )}

      {confirmDeleteDialog.isOpen && confirmDeleteDialog.pending && (
        <ConfirmDeleteModal
          title={t(language, 'absence', 'delete')}
          cancelLabel={t(language, 'absence', 'cancel')}
          confirmLabel={t(language, 'absence', 'delete')}
          zIndex={Z_MODAL_NESTED}
          onCancel={confirmDeleteDialog.cancel}
          onConfirm={() => {
            const absence = confirmDeleteDialog.pending!;
            confirmDeleteDialog.cancel();
            void doDelete(absence);
          }}
        />
      )}
    </ModalOverlay>
  );
}
