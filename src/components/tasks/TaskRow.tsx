import { useState, useEffect, memo } from 'react';
import { Check, Calendar, AlertTriangle, Folder } from 'lucide-react';
import { Task } from '../../types/task';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { TaskContextMenu } from './TaskContextMenu';
import { t } from '../../lib/i18n';
import { formatDueLabel, type DueTone } from '../../lib/taskListing';

// Fila de la lista de tareas.

const MAX_TAGS = 3;
// Lo que tarda la casilla en mostrarse marcada antes de que la tarea se
// mueva a "Hechas": sin esta pausa la fila desaparece sin que se vea el clic.
const COMPLETE_DELAY_MS = 350;

const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: 'bg-red-500/10 text-red-400',
  today: 'bg-amber-500/10 text-amber-400',
  soon: 'bg-indigo-500/10 text-indigo-400',
  normal: 'text-[var(--text-muted)]',
};

export const TaskRow = memo(function TaskRow({
  task,
  today,
  isNew,
  isRemoving,
  staggerIndex = 0,
  onBeforeDelete,
}: {
  task: Task;
  today: string;
  isNew?: boolean;
  isRemoving?: boolean;
  staggerIndex?: number;
  onBeforeDelete?: () => void;
}) {
  const { setActiveTask, activeTask, updateTask, language } = useAppStore(
    useShallow((s) => ({ setActiveTask: s.setActiveTask, activeTask: s.activeTask, updateTask: s.updateTask, language: s.language }))
  );
  const isActive = activeTask?.id === task.id;
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [statusPopped, setStatusPopped] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Animación de entrada
  const [visible, setVisible] = useState(!isNew);
  useEffect(() => {
    if (isNew) requestAnimationFrame(() => setVisible(true));
  }, [isNew]);

  const staggerClass = `task-d${Math.min(staggerIndex, 10)}`;
  const isDone = task.status === 'done' || completing;
  const isInProgress = task.status === 'in-progress' && !completing;
  const due = task.due && task.status !== 'done' ? formatDueLabel(task.due, today, language) : null;
  const extraTags = task.tags.slice(MAX_TAGS);

  // La casilla solo completa o reabre. "En progreso" se elige en el menú
  // contextual o en el panel: antes el ícono rotaba entre los tres estados
  // y para deshacer un "hecho" había que dar la vuelta completa.
  const toggleDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatusPopped(true);
    if (task.status === 'done') {
      void updateTask({ ...task, status: 'todo' });
      return;
    }
    setCompleting(true);
    setTimeout(() => {
      void updateTask({ ...task, status: 'done' }).finally(() => setCompleting(false));
    }, COMPLETE_DELAY_MS);
  };

  return (
    <>
    <div
      className={`task-row-enter ${staggerClass} transition-all duration-[220ms] ease-out ${
        isRemoving
          ? 'opacity-0 scale-95 pointer-events-none'
          : isNew && !visible
          ? 'opacity-0 -translate-y-1'
          : 'opacity-100 translate-y-0 scale-100'
      }`}
    >
    <div
      onClick={() => setActiveTask(isActive ? null : task)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
      className={`flex items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition group ${
        isActive
          ? 'bg-indigo-500/10 border border-indigo-500/20'
          : 'border border-transparent hover:bg-[var(--bg-hover)]'
      }`}
    >
      {/* Casilla: completar / reabrir */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={t(language, 'tasks', isDone ? 'markUndone' : 'markDone')}
        title={t(language, 'tasks', isDone ? 'markUndone' : 'markDone')}
        onClick={toggleDone}
        onAnimationEnd={() => setStatusPopped(false)}
        className={`group/check mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition ${
          isDone
            ? 'border-green-500 bg-green-500 text-white'
            : isInProgress
            ? 'border-amber-400 text-amber-400 hover:bg-amber-400/10'
            : 'border-[var(--text-hint)] text-[var(--text-hint)] hover:border-green-500 hover:text-green-500'
        } ${statusPopped ? 'status-pop' : ''}`}
      >
        {isDone ? (
          <Check size={11} strokeWidth={3} />
        ) : isInProgress ? (
          <>
            <span className="h-2 w-2 rounded-full bg-amber-400 group-hover/check:hidden" />
            <Check size={11} strokeWidth={3} className="hidden group-hover/check:block" />
          </>
        ) : (
          <Check size={11} strokeWidth={3} className="opacity-0 transition group-hover/check:opacity-100" />
        )}
      </button>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p
            className={`flex-1 min-w-0 text-sm leading-snug transition-colors ${
              isDone
                ? 'line-through text-[var(--text-hint)]'
                : isActive
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {task.title}
          </p>
          {due && (
            <span
              className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${DUE_TONE_CLASS[due.tone]}`}
              title={task.due}
            >
              {due.tone === 'overdue' ? <AlertTriangle size={10} /> : <Calendar size={10} />}
              {due.label}
            </span>
          )}
        </div>
        {/* Meta */}
        {(task.taskCode || task.project !== 'inbox' || task.tags.length > 0 || isInProgress) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-hint)]">
            {isInProgress && (
              <span className="font-medium text-amber-400">{t(language, 'tasks', 'statusInProgress')}</span>
            )}
            {task.taskCode && (
              <span className="rounded bg-[var(--bg-surface)] px-1 font-mono text-[10px] text-[var(--text-muted)]">{task.taskCode}</span>
            )}
            {task.project !== 'inbox' && (
              <span className="flex items-center gap-1">
                <Folder size={10} />
                {task.project}
              </span>
            )}
            {task.tags.slice(0, MAX_TAGS).map((tag) => (
              <span key={tag} className="rounded-full bg-indigo-500/10 px-1.5 py-px text-[10px] text-indigo-400">
                {tag}
              </span>
            ))}
            {extraTags.length > 0 && (
              <span
                className="rounded-full bg-[var(--bg-surface)] px-1.5 py-px text-[10px] text-[var(--text-muted)]"
                title={`${t(language, 'tasks', 'moreTags')}: ${extraTags.join(', ')}`}
              >
                +{extraTags.length}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
    {ctxMenu && (
      <TaskContextMenu
        task={task}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu(null)}
        onBeforeDelete={onBeforeDelete}
      />
    )}
    </div>
    </>
  );
});
