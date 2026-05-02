import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Plus, Circle, Clock, CheckCircle2, Calendar, AlertTriangle } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { TaskContextMenu, NewTaskContextMenu } from './TaskContextMenu';
import { RichTextEditor } from './RichTextEditor';
import { t } from '../lib/i18n';

const STATUS_ICONS: Record<TaskStatus, React.ReactNode> = {
  todo: <Circle size={14} className="text-zinc-500" />,
  'in-progress': <Clock size={14} className="text-amber-400" />,
  done: <CheckCircle2 size={14} className="text-green-400" />,
};

const TaskRow = memo(function TaskRow({
  task,
  isNew,
  isRemoving,
  staggerIndex = 0,
  onBeforeDelete,
}: {
  task: Task;
  isNew?: boolean;
  isRemoving?: boolean;
  staggerIndex?: number;
  onBeforeDelete?: () => void;
}) {
  const { setActiveTask, activeTask, updateTask } = useAppStore(
    useShallow((s) => ({ setActiveTask: s.setActiveTask, activeTask: s.activeTask, updateTask: s.updateTask }))
  );
  const isActive = activeTask?.id === task.id;
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [statusPopped, setStatusPopped] = useState(false);
  // Animación de entrada
  const [visible, setVisible] = useState(!isNew);
  useEffect(() => {
    if (isNew) requestAnimationFrame(() => setVisible(true));
  }, [isNew]);

  const staggerClass = `task-d${Math.min(staggerIndex, 10)}`;

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = task.due && task.due < today && task.status !== 'done';

  const cycleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatusPopped(true);
    const order: TaskStatus[] = ['todo', 'in-progress', 'done'];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    await updateTask({ ...task, status: next });
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
      className={`flex items-start gap-3 rounded-xl px-4 py-3 cursor-pointer transition group ${
        isActive
          ? 'bg-indigo-500/10 border border-indigo-500/20'
          : 'border border-transparent hover:bg-[var(--bg-hover)]'
      }`}
    >
      {/* Status icon */}
      <button
        onClick={cycleStatus}
        className={`mt-0.5 shrink-0 transition hover:scale-110 ${statusPopped ? 'status-pop' : ''}`}
        onAnimationEnd={() => setStatusPopped(false)}
      >
        {STATUS_ICONS[task.status]}
      </button>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-snug ${
            task.status === 'done'
              ? 'line-through text-[var(--text-hint)]'
              : isActive
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)]'
          }`}
        >
          {task.title}
        </p>
        {/* Meta */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {task.project !== 'inbox' && (
            <span className="text-[10px] text-[var(--text-hint)]">{task.project}</span>
          )}
          {task.due && (
            <span
              className={`flex items-center gap-0.5 text-[10px] ${
                isOverdue ? 'text-red-400' : 'text-[var(--text-hint)]'
              }`}
            >
              <Calendar size={9} />
              {task.due}
            </span>
          )}
          {task.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-400">
              {tag}
            </span>
          ))}
        </div>
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

export function TaskList() {
  const { tasks, activeProject, currentView, createTask, deleteTask, isLoading, language, setActiveTask } = useAppStore(
    useShallow((s) => ({
      tasks: s.tasks,
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

  const filtered = useMemo(
    () => filter === 'all' ? tasks : tasks.filter((t) => t.status === filter),
    [tasks, filter]
  );

  const handleCreateTask = async () => {
    if (newTaskTitle.trim()) {
      await createTask(newTaskTitle.trim(), undefined, newTaskContent, newTaskCode.trim() || undefined);
    }
    setNewTaskTitle('');
    setNewTaskContent('');
    setNewTaskCode('');
    setShowNewTaskModal(false);
  };

  const handleCreateTaskKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreateTask();
    if (e.key === 'Escape') { setNewTaskTitle(''); setNewTaskContent(''); setNewTaskCode(''); setShowNewTaskModal(false); }
  };

  const newTaskModal = showNewTaskModal ? (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 animate-fade-in">
      <div className="modal-spring-in w-[680px] max-w-[92vw] rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
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
            onClick={() => { setNewTaskTitle(''); setNewTaskContent(''); setNewTaskCode(''); setShowNewTaskModal(false); }}
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
      </div>
    </div>
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
      <div className="border-b border-[var(--border)] px-6 py-4">
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

        {/* Filters */}
        <div className="flex gap-1">
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
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-4xl">📭</div>
            <p className="text-sm text-[var(--text-hint)]">
              {filter === 'all' ? t(language, 'tasks', 'emptyAll') : `${t(language, 'tasks', 'emptyFilter')} "${filter}".`}
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
          <div key={listKey} className="space-y-1">
            {filtered.map((task, idx) => (
              <TaskRow
                key={task.id}
                task={task}
                isNew={newTaskIds.has(task.id)}
                isRemoving={removingIds.has(task.id)}
                staggerIndex={idx}
                onBeforeDelete={() => handleBeforeDelete(task)}
              />
            ))}
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
