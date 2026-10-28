import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, Folder, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import type { Task } from '../../types/task';
import type { AnchorRect } from '../../lib/menuPosition';
import { t } from '../../lib/i18n';
import { addDaysISO } from '../../lib/localDate';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { DatePickerPopover } from './DatePickerPopover';

// Barra de acciones para varias tareas a la vez (⌘-clic o ⇧-clic en la
// lista): fecha, completar, mover y eliminar, cada una con un solo aviso
// para deshacer. Flota abajo, sobre la lista, mientras haya selección.

interface Props {
  tasks: Task[];
  today: string;
  onReschedule: (due: string | undefined) => void;
  onComplete: () => void;
  onMove: (project: string) => void;
  onDelete: () => void;
  onClear: () => void;
}

const BTN = 'rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]';

export function TaskSelectionBar({ tasks, today, onReschedule, onComplete, onMove, onDelete, onClear }: Props) {
  const { projects, language, confirmDestructiveActions } = useAppStore(
    useShallow((s) => ({ projects: s.projects, language: s.language, confirmDestructiveActions: s.confirmDestructiveActions })),
  );
  const [dateAnchor, setDateAnchor] = useState<AnchorRect | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const projectsRef = useRef<HTMLDivElement>(null);
  const confirmDelete = useConfirmDelete<true>(confirmDestructiveActions);

  useEffect(() => {
    if (!showProjects) return;
    const handler = (e: MouseEvent) => {
      if (!projectsRef.current?.contains(e.target as Node)) setShowProjects(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProjects]);

  const n = String(tasks.length);
  const quick = [
    { key: 'today', label: t(language, 'tasks', 'groupToday'), due: today },
    { key: 'tomorrow', label: t(language, 'tasks', 'groupTomorrow'), due: addDaysISO(today, 1) },
    { key: 'week', label: t(language, 'tasks', 'dueNextWeek'), due: addDaysISO(today, 7) },
  ];

  return (
    <>
      <div
        role="toolbar"
        aria-label={t(language, 'tasks', 'selectedCount').replace('{n}', n)}
        className="pointer-events-auto flex items-center gap-1 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] px-2 py-1.5 shadow-2xl"
      >
        <span className="px-2 text-xs font-medium text-indigo-400">{t(language, 'tasks', 'selectedCount').replace('{n}', n)}</span>
        <span className="mx-1 h-4 w-px bg-[var(--border)]" />
        {quick.map(({ key, label, due }) => (
          <button key={key} onClick={() => onReschedule(due)} className={`${BTN} whitespace-nowrap`}>{label}</button>
        ))}
        <button
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setDateAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
          }}
          title={t(language, 'tasks', 'chooseDate')}
          aria-label={t(language, 'tasks', 'chooseDate')}
          className={BTN}
        >
          <CalendarDays size={13} />
        </button>
        <span className="mx-1 h-4 w-px bg-[var(--border)]" />
        <button onClick={onComplete} className={`${BTN} flex items-center gap-1`}>
          <Check size={12} /> {t(language, 'tasks', 'bulkComplete')}
        </button>
        <div className="relative" ref={projectsRef}>
          <button
            onClick={() => setShowProjects((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={showProjects}
            className={`${BTN} flex items-center gap-1 whitespace-nowrap`}
          >
            <Folder size={12} /> {t(language, 'tasks', 'moveToProject')}
          </button>
          {showProjects && (
            <div role="menu" className="absolute bottom-full left-0 mb-2 max-h-56 min-w-[10rem] overflow-y-auto rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl">
              {projects.map((p) => (
                <button
                  key={p}
                  role="menuitem"
                  onClick={() => { setShowProjects(false); onMove(p); }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => confirmDelete.request(true, onDelete)}
          title={t(language, 'tasks', 'delete')}
          aria-label={t(language, 'tasks', 'delete')}
          className="rounded-md px-2 py-1 text-red-400 transition hover:bg-red-500/10"
        >
          <Trash2 size={13} />
        </button>
        <span className="mx-1 h-4 w-px bg-[var(--border)]" />
        <button onClick={onClear} title={t(language, 'tasks', 'clearSelection')} aria-label={t(language, 'tasks', 'clearSelection')} className={BTN}>
          <X size={13} />
        </button>
      </div>
      {dateAnchor && (
        <DatePickerPopover
          anchor={dateAnchor}
          // Si todas comparten fecha, se marca en el calendario.
          value={tasks.every((tk) => tk.due === tasks[0]?.due) ? tasks[0]?.due : undefined}
          onPick={onReschedule}
          onClose={() => setDateAnchor(null)}
        />
      )}
      {confirmDelete.isOpen && (
        <ConfirmDeleteModal
          variant="soft"
          title={t(language, 'tasks', 'deleteTasksTitle')}
          message={`${t(language, 'tasks', 'confirmBulkDelete').replace('{n}', n)} ${t(language, 'tasks', 'confirmDeleteDesc')}`}
          cancelLabel={t(language, 'tasks', 'cancel')}
          confirmLabel={t(language, 'tasks', 'delete')}
          onCancel={confirmDelete.cancel}
          onConfirm={() => { confirmDelete.cancel(); onDelete(); }}
        />
      )}
    </>
  );
}
