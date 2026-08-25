import { useEffect, useState } from 'react';
import { X, RotateCcw, Trash2, CheckSquare, Notebook, Timer, CalendarDays } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { Z_MODAL_NESTED, Z_MODAL_NESTED_2 } from '../../lib/zIndex';
import type { TrashEntity, TrashListItem } from '../../lib/trash';

const ENTITY_ICON: Record<TrashEntity, typeof CheckSquare> = {
  task: CheckSquare,
  note: Notebook,
  overtime_entry: Timer,
  daily_entry: CalendarDays,
};

const ENTITY_LABEL_KEY: Record<TrashEntity, 'entityTask' | 'entityNote' | 'entityOvertimeEntry' | 'entityDailyEntry'> = {
  task: 'entityTask',
  note: 'entityNote',
  overtime_entry: 'entityOvertimeEntry',
  daily_entry: 'entityDailyEntry',
};

export function TrashModal({ onClose }: { onClose: () => void }) {
  const { language, listTrash, restoreFromTrash, deleteTrashItemForever, emptyTrash } = useAppStore();

  const [items, setItems] = useState<TrashListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteForever, setConfirmDeleteForever] = useState<TrashListItem | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setItems(await listTrash());
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh(); }, []);

  const handleRestore = async (item: TrashListItem) => {
    await restoreFromTrash(item.entity, item.key);
    void refresh();
  };

  const handleDeleteForever = async (item: TrashListItem) => {
    setConfirmDeleteForever(null);
    await deleteTrashItemForever(item.entity, item.key);
    void refresh();
  };

  const handleEmptyTrash = async () => {
    setConfirmEmpty(false);
    await emptyTrash();
    void refresh();
  };

  return (
    <ModalOverlay onClose={onClose} zIndex={Z_MODAL_NESTED} className="px-4">
      <ModalPanel className="flex h-[80vh] max-h-[600px] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t(language, 'trash', 'title')}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {loading ? null : items.length === 0 ? (
            <p className="mt-8 text-center text-xs text-[var(--text-hint)]">{t(language, 'trash', 'empty')}</p>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => {
                const Icon = ENTITY_ICON[item.entity];
                return (
                  <div
                    key={`${item.entity}:${item.key}`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2.5"
                  >
                    <Icon size={14} className="shrink-0 text-[var(--text-hint)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-[var(--text-secondary)]">{item.label}</p>
                      <p className="text-[10px] text-[var(--text-hint)]">
                        {t(language, 'trash', ENTITY_LABEL_KEY[item.entity])} · {new Date(item.trashedAt).toLocaleDateString(language)}
                      </p>
                    </div>
                    <button
                      onClick={() => void handleRestore(item)}
                      title={t(language, 'trash', 'restore')}
                      className="shrink-0 rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteForever(item)}
                      title={t(language, 'trash', 'deleteForever')}
                      className="shrink-0 rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="shrink-0 border-t border-[var(--border)] px-4 py-3">
            <button
              onClick={() => setConfirmEmpty(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
            >
              <Trash2 size={13} />
              {t(language, 'trash', 'emptyTrashButton')}
            </button>
          </div>
        )}
      </ModalPanel>

      {confirmDeleteForever && (
        <ConfirmDeleteModal
          title={t(language, 'trash', 'confirmDeleteForeverTitle')}
          message={t(language, 'trash', 'confirmDeleteForeverMsg')}
          cancelLabel={t(language, 'trash', 'cancel')}
          confirmLabel={t(language, 'trash', 'deleteForever')}
          onCancel={() => setConfirmDeleteForever(null)}
          onConfirm={() => void handleDeleteForever(confirmDeleteForever)}
          zIndex={Z_MODAL_NESTED_2}
        />
      )}

      {confirmEmpty && (
        <ConfirmDeleteModal
          title={t(language, 'trash', 'confirmEmptyTitle')}
          message={t(language, 'trash', 'confirmEmptyMsg')}
          cancelLabel={t(language, 'trash', 'cancel')}
          confirmLabel={t(language, 'trash', 'emptyTrashButton')}
          onCancel={() => setConfirmEmpty(false)}
          onConfirm={() => void handleEmptyTrash()}
          zIndex={Z_MODAL_NESTED_2}
        />
      )}
    </ModalOverlay>
  );
}
