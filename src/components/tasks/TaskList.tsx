import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, CheckSquare, ChevronRight } from 'lucide-react';
import { Task } from '../../types/task';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { NewTaskContextMenu } from './TaskContextMenu';
import { TaskRow } from './TaskRow';
import { NewTaskModal } from './NewTaskModal';
import { QuickAddInput } from './QuickAddInput';
import { TaskFilterBar } from './TaskFilterBar';
import type { QuickCaptureResult } from '../../lib/quickCapture';
import { t } from '../../lib/i18n';
import { localISODate } from '../../lib/localDate';
import { doneTasks, filterTasks, groupOpenTasks, isTaskFilterActive, type TaskGroupKey } from '../../lib/taskListing';

const DONE_COLLAPSED_KEY = 'logday_tasks_done_collapsed';

const GROUP_LABEL_KEY: Record<TaskGroupKey, 'groupOverdue' | 'groupToday' | 'groupTomorrow' | 'groupWeek' | 'groupLater' | 'groupNone' | 'groupPending'> = {
  overdue: 'groupOverdue',
  today: 'groupToday',
  tomorrow: 'groupTomorrow',
  week: 'groupWeek',
  later: 'groupLater',
  none: 'groupNone',
  pending: 'groupPending',
};

export function TaskList() {
  const { tasks, activeProject, currentView, deleteTask, updateTask, isLoading, language, setActiveTask, taskSortBy, taskFilter } = useAppStore(
    useShallow((s) => ({
      tasks: s.tasks,
      taskSortBy: s.taskSortBy,
      taskFilter: s.taskFilter,
      activeProject: s.activeProject,
      currentView: s.currentView,
      deleteTask: s.deleteTask,
      updateTask: s.updateTask,
      isLoading: s.isLoading,
      language: s.language,
      setActiveTask: s.setActiveTask,
    }))
  );
  // Borrador de la ventana "Nueva tarea" (null = cerrada). La captura
  // rápida le pasa lo que ya se escribió.
  const [newTaskDraft, setNewTaskDraft] = useState<Partial<QuickCaptureResult> | null>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const filter = taskFilter.status;
  const [emptyCtxMenu, setEmptyCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [listKey, setListKey] = useState(0);
  const loadedRef = useRef(false);
  const prevIdsRef = useRef<Set<string>>(new Set());

  // Detectar tareas nuevas para animación de entrada
  useEffect(() => {
    const currentIds = new Set(tasks.map((t) => t.id));
    if (!loadedRef.current) {
      loadedRef.current = true;
      prevIdsRef.current = currentIds;
      return;
    }
    const added = [...currentIds].filter((id) => !prevIdsRef.current.has(id));
    prevIdsRef.current = currentIds;
    if (added.length === 0) return;
    setNewTaskIds((prev) => new Set([...prev, ...added]));
    const timer = setTimeout(() => {
      setNewTaskIds((prev) => {
        const next = new Set(prev);
        added.forEach((id) => next.delete(id));
        return next;
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [tasks]);

  const handleBeforeDelete = (task: Task) => {
    setRemovingIds((prev) => new Set([...prev, task.id]));
    setTimeout(async () => {
      await deleteTask(task);
      setRemovingIds((prev) => { const n = new Set(prev); n.delete(task.id); return n; });
    }, 220);
  };

  useEffect(() => {
    setActiveTask(null);
    setListKey((k) => k + 1);
  }, [activeProject, currentView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => setNewTaskDraft({});
    window.addEventListener('logday:new-task', handler);
    return () => window.removeEventListener('logday:new-task', handler);
  }, []);

  const [doneCollapsed, setDoneCollapsed] = useState(() => {
    try { return localStorage.getItem(DONE_COLLAPSED_KEY) !== '0'; } catch { return true; }
  });
  const toggleDoneCollapsed = () => {
    setDoneCollapsed((v) => {
      try { localStorage.setItem(DONE_COLLAPSED_KEY, v ? '0' : '1'); } catch { /* sin almacenamiento */ }
      return !v;
    });
  };

  // "Hoy" en hora local; se recalcula con cada cambio de tareas, y al
  // volver a la ventana para que la lista no quede en el día anterior.
  const [today, setToday] = useState(() => localISODate());
  useEffect(() => {
    const refresh = () => setToday(localISODate());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  useEffect(() => { setToday(localISODate()); }, [tasks]);

  const filtered = useMemo(() => filterTasks(tasks, taskFilter), [tasks, taskFilter]);
  const openGroups = useMemo(() => groupOpenTasks(filtered, taskSortBy, today), [filtered, taskSortBy, today]);
  const done = useMemo(() => doneTasks(filtered), [filtered]);
  // Con búsqueda o tags, las hechas que coinciden se muestran desplegadas.
  const narrowed = isTaskFilterActive({ ...taskFilter, status: 'all' });
  const showDone = filter === 'done' || narrowed || !doneCollapsed;
  const visibleCount = openGroups.reduce((n, g) => n + g.tasks.length, 0) + done.length;

  const newTaskModal = newTaskDraft ? (
    <NewTaskModal initial={newTaskDraft} onClose={() => setNewTaskDraft(null)} />
  ) : null;

  // Orden en pantalla, para moverse con el teclado.
  const visibleTasks = useMemo(
    () => [...openGroups.flatMap((g) => g.tasks), ...(showDone ? done : [])],
    [openGroups, done, showDone],
  );

  // Atajos de la lista (fuera de campos de texto y sin ventanas abiertas):
  // ↑/↓ o j/k para moverse, Enter para abrir, Espacio o x para completar o
  // reabrir, n para la captura rápida y Esc para soltar la selección.
  useEffect(() => {
    if (currentView !== 'list' || newTaskDraft) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      const index = visibleTasks.findIndex((t) => t.id === focusedId);
      const focused = index >= 0 ? visibleTasks[index] : null;
      const move = (delta: number) => {
        if (!visibleTasks.length) return;
        const next = index < 0 ? (delta > 0 ? 0 : visibleTasks.length - 1) : Math.min(Math.max(index + delta, 0), visibleTasks.length - 1);
        setFocusedId(visibleTasks[next].id);
      };
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && focused) { e.preventDefault(); setActiveTask(focused); }
      else if ((e.key === ' ' || e.key === 'x') && focused) {
        e.preventDefault();
        // La tarea cambia de grupo: la selección pasa a la siguiente.
        const neighbor = visibleTasks[index + 1] ?? visibleTasks[index - 1];
        setFocusedId(neighbor?.id ?? null);
        void updateTask({ ...focused, status: focused.status === 'done' ? 'todo' : 'done' });
      }
      else if (e.key === 'n') { e.preventDefault(); quickAddRef.current?.focus(); }
      else if (e.key === 'Escape' && focusedId) setFocusedId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentView, newTaskDraft, visibleTasks, focusedId, setActiveTask, updateTask]);

  if (currentView !== 'list') return newTaskModal;

  const title = activeProject ? activeProject : t(language, 'tasks', 'title');

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      onContextMenu={(e) => { e.preventDefault(); setEmptyCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* Header */}
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] capitalize">{title}</h1>
          <button
            onClick={() => setNewTaskDraft({})}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white transition hover:bg-indigo-500"
          >
            <Plus size={14} />
            {t(language, 'tasks', 'newTask')}
          </button>
        </div>

        <TaskFilterBar />
        {/* Captura rápida */}
        <div className="mt-3">
          <QuickAddInput ref={quickAddRef} onMoreOptions={(draft) => setNewTaskDraft(draft)} />
        </div>
        </div>
      </div>

      {/* Modal nueva tarea */}
      {newTaskModal}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-[var(--text-hint)]">{t(language, 'tasks', 'loading')}</span>
          </div>
        ) : visibleCount === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CheckSquare size={36} className="text-[var(--text-faint)]" strokeWidth={1.5} />
            <p className="text-sm text-[var(--text-hint)]">
              {t(language, 'tasks', narrowed ? 'emptyFiltered' : filter === 'all' ? 'emptyAll' : filter === 'todo' ? 'emptyTodo' : filter === 'in-progress' ? 'emptyInProgress' : 'emptyDone')}
            </p>
            {filter === 'all' && !narrowed && (
              <button
                onClick={() => setNewTaskDraft({})}
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-500"
              >
                <Plus size={14} />
                {t(language, 'tasks', 'newTask')}
              </button>
            )}
          </div>
        ) : (
          <div key={listKey} className="mx-auto w-full max-w-3xl space-y-4">
            {filter === 'all' && !narrowed && openGroups.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-[var(--text-hint)]">{t(language, 'tasks', 'emptyAllDone')}</p>
            )}
            {openGroups.map((group, groupIdx) => {
              const offset = openGroups.slice(0, groupIdx).reduce((n, g) => n + g.tasks.length, 0);
              return (
                <section key={group.key}>
                  {/* Con un solo grupo de pendientes (orden por creación o
                      título) el encabezado no aporta: se omite. */}
                  {group.key !== 'pending' && (
                    <h2 className={`mb-1 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider ${
                      group.key === 'overdue' ? 'text-red-400' : group.key === 'today' ? 'text-amber-400' : 'text-[var(--text-hint)]'
                    }`}>
                      {t(language, 'tasks', GROUP_LABEL_KEY[group.key])}
                      <span className="font-normal text-[var(--text-faint)]">{group.tasks.length}</span>
                    </h2>
                  )}
                  <div className="space-y-0.5">
                    {group.tasks.map((task, idx) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        today={today}
                        isFocused={focusedId === task.id}
                        onSelect={() => setFocusedId(task.id)}
                        isNew={newTaskIds.has(task.id)}
                        isRemoving={removingIds.has(task.id)}
                        staggerIndex={offset + idx}
                        onBeforeDelete={() => handleBeforeDelete(task)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {done.length > 0 && (
              <section>
                {filter === 'all' && (
                  <button
                    onClick={toggleDoneCollapsed}
                    disabled={narrowed}
                    aria-expanded={showDone}
                    className="mb-1 flex items-center gap-1.5 rounded-md px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-hint)] transition hover:text-[var(--text-secondary)]"
                  >
                    <ChevronRight size={12} className={`transition-transform ${showDone ? 'rotate-90' : ''}`} />
                    {t(language, 'tasks', 'groupDone')}
                    <span className="font-normal text-[var(--text-faint)]">{done.length}</span>
                  </button>
                )}
                {showDone && (
                  <div className="space-y-0.5">
                    {done.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        today={today}
                        isFocused={focusedId === task.id}
                        onSelect={() => setFocusedId(task.id)}
                        isNew={newTaskIds.has(task.id)}
                        isRemoving={removingIds.has(task.id)}
                        onBeforeDelete={() => handleBeforeDelete(task)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
            <p className="pt-2 text-center text-[10px] text-[var(--text-faint)]">{t(language, 'tasks', 'shortcutsHint')}</p>
          </div>
        )}
      </div>

      {emptyCtxMenu && (
        <NewTaskContextMenu
          x={emptyCtxMenu.x}
          y={emptyCtxMenu.y}
          onClose={() => setEmptyCtxMenu(null)}
        />
      )}
    </div>
  );
}
