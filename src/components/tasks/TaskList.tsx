import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, AlertTriangle, CheckSquare, ChevronRight, ArrowUpDown } from 'lucide-react';
import { Task, TaskStatus } from '../../types/task';
import type { TaskSortBy } from '../../types/config';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { NewTaskContextMenu } from './TaskContextMenu';
import { TaskRow } from './TaskRow';
import { RichTextEditor } from './RichTextEditor';
import { t } from '../../lib/i18n';
import { localISODate } from '../../lib/localDate';
import { doneTasks, groupOpenTasks, type TaskGroupKey } from '../../lib/taskListing';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';

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

const SORT_LABEL_KEY: Record<TaskSortBy, 'sortDue' | 'sortCreated' | 'sortTitle'> = {
  due: 'sortDue',
  created: 'sortCreated',
  title: 'sortTitle',
};

export function TaskList() {
  const { tasks, activeProject, currentView, createTask, deleteTask, isLoading, language, setActiveTask, taskSortBy, setTaskSort } = useAppStore(
    useShallow((s) => ({
      tasks: s.tasks,
      taskSortBy: s.taskSortBy,
      setTaskSort: s.setTaskSort,
      activeProject: s.activeProject,
      currentView: s.currentView,
      createTask: s.createTask,
      deleteTask: s.deleteTask,
      isLoading: s.isLoading,
      language: s.language,
      setActiveTask: s.setActiveTask,
    }))
  );
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskContent, setNewTaskContent] = useState('');
  const [newTaskCode, setNewTaskCode] = useState('');

  const isDuplicateNewCode = useMemo(
    () => newTaskCode.length > 0 && tasks.some((t) => t.taskCode === newTaskCode),
    [newTaskCode, tasks]
  );
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
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
    const handler = () => setShowNewTaskModal(true);
    window.addEventListener('logday:new-task', handler);
    return () => window.removeEventListener('logday:new-task', handler);
  }, []);

  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [doneCollapsed, setDoneCollapsed] = useState(() => {
    try { return localStorage.getItem(DONE_COLLAPSED_KEY) !== '0'; } catch { return true; }
  });
  const toggleDoneCollapsed = () => {
    setDoneCollapsed((v) => {
      try { localStorage.setItem(DONE_COLLAPSED_KEY, v ? '0' : '1'); } catch { /* sin almacenamiento */ }
      return !v;
    });
  };

  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setShowSortMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSortMenu]);

  // "Hoy" en hora local; se recalcula con cada cambio de tareas, y al
  // volver a la ventana para que la lista no quede en el día anterior.
  const [today, setToday] = useState(() => localISODate());
  useEffect(() => {
    const refresh = () => setToday(localISODate());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  useEffect(() => { setToday(localISODate()); }, [tasks]);

  const openGroups = useMemo(() => {
    if (filter === 'done') return [];
    const source = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
    return groupOpenTasks(source, taskSortBy, today);
  }, [tasks, filter, taskSortBy, today]);
  const done = useMemo(() => (filter === 'all' || filter === 'done' ? doneTasks(tasks) : []), [tasks, filter]);
  const visibleCount = openGroups.reduce((n, g) => n + g.tasks.length, 0) + done.length;

  const handleCreateTask = async () => {
    if (newTaskTitle.trim()) {
      await createTask(newTaskTitle.trim(), undefined, newTaskContent, newTaskCode.trim() || undefined);
    }
    setNewTaskTitle('');
    setNewTaskContent('');
    setNewTaskCode('');
    setShowNewTaskModal(false);
  };

  const closeNewTaskModal = () => { setNewTaskTitle(''); setNewTaskContent(''); setNewTaskCode(''); setShowNewTaskModal(false); };

  const handleCreateTaskKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreateTask();
    if (e.key === 'Escape') closeNewTaskModal();
  };

  const newTaskModal = showNewTaskModal ? (
    <ModalOverlay onClose={closeNewTaskModal} className="animate-fade-in">
      <ModalPanel className="modal-spring-in w-[680px] max-w-[92vw] rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Plus size={15} className="text-indigo-400" />
          {t(language, 'tasks', 'modalTitle')}
        </div>
        <input
          autoFocus
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={handleCreateTaskKey}
          placeholder={t(language, 'tasks', 'taskNamePlaceholder')}
          className="mb-3 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
        />
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5">
          <span className="shrink-0 text-xs text-[var(--text-hint)]"># {t(language, 'tasks', 'taskCodeLabel')}</span>
          <input
            value={newTaskCode}
            onChange={(e) => setNewTaskCode(e.target.value.replace(/[^a-zA-Z0-9\-_]/g, '').toUpperCase())}
            onKeyDown={handleCreateTaskKey}
            maxLength={32}
            spellCheck={false}
            className={`flex-1 bg-transparent font-mono text-xs outline-none transition-colors ${
              isDuplicateNewCode ? 'text-red-400' : 'text-[var(--text-secondary)]'
            }`}
          />
          {isDuplicateNewCode ? (
            <AlertTriangle size={12} className="shrink-0 text-red-400" aria-label={t(language, 'tasks', 'taskCodeDuplicate')} />
          ) : (
            <span className="shrink-0 text-[10px] text-[var(--text-faint)]">{t(language, 'tasks', 'taskCodeHint')}</span>
          )}
        </div>
        <div className="mb-4">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-hint)]">{t(language, 'tasks', 'descriptionLabel')}</div>
          <RichTextEditor
            value={newTaskContent}
            onChange={setNewTaskContent}
            placeholder={t(language, 'tasks', 'descriptionPlaceholder')}
            minHeight="220px"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={closeNewTaskModal}
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
          >
            {t(language, 'tasks', 'cancel')}
          </button>
          <button
            onClick={handleCreateTask}
            disabled={!newTaskTitle.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t(language, 'tasks', 'createTask')}
          </button>
        </div>
      </ModalPanel>
    </ModalOverlay>
  ) : null;

  if (currentView !== 'list') return newTaskModal;

  const title = activeProject ? activeProject : t(language, 'tasks', 'title');
  const counts = {
    all: tasks.length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    'in-progress': tasks.filter((t) => t.status === 'in-progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  };

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
            onClick={() => setShowNewTaskModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white transition hover:bg-indigo-500"
          >
            <Plus size={14} />
            {t(language, 'tasks', 'newTask')}
          </button>
        </div>

        {/* Filtros y orden */}
        <div className="flex items-center gap-1">
          {(['all', 'todo', 'in-progress', 'done'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1 text-xs transition ${
                filter === f
                  ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                  : 'text-[var(--text-hint)] hover:text-[var(--text-tertiary)]'
              }`}
            >
              {f === 'all' ? t(language, 'tasks', 'filterAll') : f === 'todo' ? t(language, 'tasks', 'filterTodo') : f === 'in-progress' ? t(language, 'tasks', 'filterInProgress') : t(language, 'tasks', 'filterDone')}
              <span className="ml-1.5 text-[10px] text-[var(--text-hint)]">{counts[f]}</span>
            </button>
          ))}
          <div className="relative ml-auto" ref={sortMenuRef}>
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={showSortMenu}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition ${
                showSortMenu ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <ArrowUpDown size={12} />
              {t(language, 'tasks', SORT_LABEL_KEY[taskSortBy])}
            </button>
            {showSortMenu && (
              <div role="menu" className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-xl">
                <p className="px-3 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-faint)]">{t(language, 'tasks', 'sortLabel')}</p>
                {(['due', 'created', 'title'] as const).map((opt) => (
                  <button
                    key={opt}
                    role="menuitemradio"
                    aria-checked={taskSortBy === opt}
                    onClick={() => { setTaskSort(opt); setShowSortMenu(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                      taskSortBy === opt
                        ? 'text-indigo-400 bg-indigo-500/10'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {t(language, 'tasks', SORT_LABEL_KEY[opt])}
                  </button>
                ))}
              </div>
            )}
          </div>
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
              {t(language, 'tasks', filter === 'all' ? 'emptyAll' : filter === 'todo' ? 'emptyTodo' : filter === 'in-progress' ? 'emptyInProgress' : 'emptyDone')}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => setShowNewTaskModal(true)}
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-500"
              >
                <Plus size={14} />
                {t(language, 'tasks', 'newTask')}
              </button>
            )}
          </div>
        ) : (
          <div key={listKey} className="mx-auto w-full max-w-3xl space-y-4">
            {filter === 'all' && openGroups.length === 0 && (
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
                    aria-expanded={!doneCollapsed}
                    className="mb-1 flex items-center gap-1.5 rounded-md px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-hint)] transition hover:text-[var(--text-secondary)]"
                  >
                    <ChevronRight size={12} className={`transition-transform ${doneCollapsed ? '' : 'rotate-90'}`} />
                    {t(language, 'tasks', 'groupDone')}
                    <span className="font-normal text-[var(--text-faint)]">{done.length}</span>
                  </button>
                )}
                {(filter === 'done' || !doneCollapsed) && (
                  <div className="space-y-0.5">
                    {done.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        today={today}
                        isNew={newTaskIds.has(task.id)}
                        isRemoving={removingIds.has(task.id)}
                        onBeforeDelete={() => handleBeforeDelete(task)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
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
