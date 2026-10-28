import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Circle, Clock, CheckCircle2, Copy, Check, Trash2, Pencil, Plus, CalendarDays, X, CopyPlus, Folder, ChevronRight } from 'lucide-react';
import { Task, TaskStatus } from '../../types/task';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import { addDaysISO, localISODate } from '../../lib/localDate';
import { formatDueLabel } from '../../lib/taskListing';

const ESTIMATED_TASK_MENU = { width: 230, height: 440 };
const ESTIMATED_NEW_TASK_MENU = { width: 190, height: 56 };

interface Props {
  task: Task;
  x: number;
  y: number;
  onClose: () => void;
  onBeforeDelete?: () => void;
}

export function TaskContextMenu({ task, x, y, onClose, onBeforeDelete }: Props) {
  const { updateTaskWithUndo, createTask, deleteTask, setActiveTask, language, confirmDestructiveActions, projects } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const confirmDeleteDialog = useConfirmDelete<true>(confirmDestructiveActions);
  const anchor = useMemo(() => ({ x, y }), [x, y]);
  const { ref, style } = usePositionedMenu(anchor, { estimatedSize: ESTIMATED_TASK_MENU, onClose });

  // Todas con aviso para deshacer: la tarea suele cambiar de grupo o salir
  // de la vista, y sin el aviso no queda rastro de qué pasó.
  const handleStatusChange = async (status: TaskStatus) => {
    onClose();
    if (status === task.status) return;
    const title = status === 'done' ? 'toastCompleted' : task.status === 'done' ? 'toastReopened' : 'toastStatus';
    await updateTaskWithUndo({ ...task, status }, { title: t(language, 'tasks', title), description: task.title });
  };

  // Acciones rápidas: sin abrir el panel para cambiar la fecha o el proyecto.
  const handleDue = async (due: string | undefined) => {
    onClose();
    if (due === task.due) return;
    await updateTaskWithUndo({ ...task, due }, {
      title: t(language, 'tasks', due ? 'toastDue' : 'toastDueCleared'),
      description: due ? `${task.title} · ${formatDueLabel(due, localISODate(), language).label}` : task.title,
    });
  };

  const handleMove = async (project: string) => {
    onClose();
    if (project === task.project) return;
    await updateTaskWithUndo({ ...task, project }, { title: t(language, 'tasks', 'movedTo'), description: project });
  };

  // La copia va sin código (es único por tarea) y se abre para editarla.
  const handleDuplicate = async () => {
    onClose();
    await createTask(`${task.title} ${t(language, 'tasks', 'copySuffix')}`, task.project, task.content, undefined, {
      due: task.due,
      tags: task.tags,
      linkedPaths: task.linked_paths,
    });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(task.title);
    setCopied(true);
    setTimeout(() => { setCopied(false); onClose(); }, 1200);
  };

  const handleDelete = async () => {
    if (onBeforeDelete) {
      onBeforeDelete();
      onClose();
    } else {
      await deleteTask(task);
      onClose();
    }
  };

  const statuses: { status: TaskStatus; label: string; Icon: React.ElementType; color: string }[] = [
    { status: 'todo',        label: t(language, 'tasks', 'statusTodo'),        Icon: Circle,       color: 'text-zinc-400'  },
    { status: 'in-progress', label: t(language, 'tasks', 'statusInProgress'),  Icon: Clock,        color: 'text-amber-400' },
    { status: 'done',        label: t(language, 'tasks', 'statusDone'),        Icon: CheckCircle2, color: 'text-green-400' },
  ];

  const today = localISODate();
  const dueOptions = [
    { key: 'today', label: t(language, 'tasks', 'groupToday'), due: today },
    { key: 'tomorrow', label: t(language, 'tasks', 'groupTomorrow'), due: addDaysISO(today, 1) },
    { key: 'week', label: t(language, 'tasks', 'dueNextWeek'), due: addDaysISO(today, 7) },
  ];

  if (confirmDeleteDialog.isOpen) {
    return (
      <ConfirmDeleteModal
        title={t(language, 'tasks', 'deleteTask')}
        message={
          <>
            {t(language, 'tasks', 'confirmDeleteMsg')}{' '}
            <span className="font-medium text-[var(--text-primary)]">&#34;{task.title}&#34;</span>.{' '}
            {t(language, 'tasks', 'confirmDeleteDesc')}
          </>
        }
        cancelLabel={t(language, 'tasks', 'cancel')}
        confirmLabel={t(language, 'tasks', 'delete')}
        onCancel={confirmDeleteDialog.cancel}
        onConfirm={() => void handleDelete()}
      />
    );
  }

  return createPortal(
    <div
      ref={ref}
      style={{ ...style, zIndex: 9999 }}
      className="min-w-[200px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
    >
      {/* Preview del título */}
      <div className="border-b border-[var(--border)] px-3 py-2">
        <p className="max-w-[180px] truncate text-xs font-medium text-[var(--text-primary)]">
          {task.title}
        </p>
        {task.project && task.project !== 'inbox' && (
          <p className="text-[10px] text-[var(--text-hint)]">{task.project}</p>
        )}
      </div>

      {/* Abrir */}
      <button
        onClick={() => { setActiveTask(task); onClose(); }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Pencil size={12} />
        {t(language, 'tasks', 'openEdit')}
      </button>

      {/* Estado */}
      <div className="mx-2 my-1 border-t border-[var(--border)]" />
      <p className="px-3 py-1 text-[10px] uppercase tracking-widest text-[var(--text-hint)]">{t(language, 'tasks', 'statusLabel')}</p>
      {statuses.map(({ status, label, Icon, color }) => (
        <button
          key={status}
          onClick={() => handleStatusChange(status)}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs transition hover:bg-[var(--bg-hover)] ${
            task.status === status ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          <Icon size={12} className={color} />
          {label}
          {task.status === status && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />
          )}
        </button>
      ))}

      {/* Vencimiento */}
      <div className="mx-2 my-1 border-t border-[var(--border)]" />
      <p className="px-3 py-1 text-[10px] uppercase tracking-widest text-[var(--text-hint)]">{t(language, 'tasks', 'dueDate')}</p>
      <div className="flex gap-1 px-2 pb-1">
        {dueOptions.map(({ key, label, due }) => (
          <button
            key={key}
            onClick={() => void handleDue(due)}
            className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] transition hover:bg-[var(--bg-hover)] ${
              task.due === due ? 'bg-indigo-500/10 text-indigo-400' : 'text-[var(--text-secondary)]'
            }`}
          >
            {label}
          </button>
        ))}
        {task.due && (
          <button
            onClick={() => void handleDue(undefined)}
            title={t(language, 'tasks', 'dueClear')}
            aria-label={t(language, 'tasks', 'dueClear')}
            className="rounded-md px-1.5 py-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-red-400"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Proyecto y duplicar */}
      <div className="mx-2 my-1 border-t border-[var(--border)]" />
      <button
        onClick={() => setShowProjects((v) => !v)}
        aria-expanded={showProjects}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Folder size={12} />
        {t(language, 'tasks', 'moveToProject')}
        <ChevronRight size={12} className={`ml-auto transition-transform ${showProjects ? 'rotate-90' : ''}`} />
      </button>
      {showProjects && (
        <div className="max-h-40 overflow-y-auto pb-1">
          {projects.map((p) => (
            <button
              key={p}
              onClick={() => void handleMove(p)}
              className={`flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-xs transition hover:bg-[var(--bg-hover)] ${
                p === task.project ? 'text-indigo-400' : 'text-[var(--text-secondary)]'
              }`}
            >
              <span className="truncate">{p}</span>
              {p === task.project && <Check size={11} className="ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => void handleDuplicate()}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <CopyPlus size={12} />
        {t(language, 'tasks', 'duplicate')}
      </button>

      {/* Copiar */}
      <button
        onClick={handleCopy}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        {copied ? t(language, 'tasks', 'copied') : t(language, 'tasks', 'copyTitle')}
      </button>

      {/* Eliminar */}
      <div className="mx-2 my-1 border-t border-[var(--border)]" />
      <button
        onClick={() => confirmDeleteDialog.request(true, () => void handleDelete())}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10"
      >
        <Trash2 size={12} />
        {t(language, 'tasks', 'deleteTask')}
      </button>
    </div>,
    document.body
  );
}

// ── Menú contextual para espacio vacío (crear nueva tarea) ─────────────────
/** `due`: fecha con la que nace la tarea (el día elegido en el calendario). */
export function NewTaskContextMenu({ x, y, onClose, onNewEvent, due }: { x: number; y: number; onClose: () => void; onNewEvent?: () => void; due?: string }) {
  const language = useAppStore((s) => s.language);
  const anchor = useMemo(() => ({ x, y }), [x, y]);
  const { ref, style } = usePositionedMenu(anchor, { estimatedSize: ESTIMATED_NEW_TASK_MENU, onClose });

  return createPortal(
    <div
      ref={ref}
      style={{ ...style, zIndex: 9999 }}
      className="min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
    >
      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent('logday:new-task', { detail: { due } }));
          onClose();
        }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Plus size={12} className="text-indigo-400" />
        {t(language, 'tasks', 'newTask')}
      </button>
      {onNewEvent && (
        <button
          onClick={() => { onNewEvent(); onClose(); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <CalendarDays size={12} className="text-emerald-400" />
          {t(language, 'calendar', 'addEvent')}
        </button>
      )}
    </div>,
    document.body
  );
}
