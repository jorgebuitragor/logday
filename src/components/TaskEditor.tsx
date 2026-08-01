import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  X,
  Tag,
  Calendar,
  FolderOpen,
  Link,
  ExternalLink,
  Trash2,
  Plus,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { RichTextEditor } from './RichTextEditor';
import { AppDatePicker } from './AppDatePicker';
import { Task, TaskStatus } from '../types';
import { useAppStore } from '../store/appStore';
import { fs } from '../lib/invoke';
import { t } from '../lib/i18n';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

const STATUS_OPTIONS: { value: TaskStatus; color: string }[] = [
  { value: 'todo', color: 'text-zinc-400 bg-zinc-400/10' },
  { value: 'in-progress', color: 'text-amber-400 bg-amber-400/10' },
  { value: 'done', color: 'text-green-400 bg-green-400/10' },
];

export function TaskEditor() {
  const { activeTask, updateTask, deleteTask, setActiveTask, projects, addLinkedPath, removeLinkedPath, language, confirmDestructiveActions, tasks } =
    useAppStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [due, setDue] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [project, setProject] = useState('inbox');
  const [taskCode, setTaskCode] = useState('');
  const [newTag, setNewTag] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const confirmDeleteDialog = useConfirmDelete<true>(confirmDestructiveActions);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú de proyecto al hacer clic fuera
  useEffect(() => {
    if (!showProjectMenu) return;
    const handler = (e: MouseEvent) => {
      if (!projectMenuRef.current?.contains(e.target as Node)) setShowProjectMenu(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showProjectMenu]);

  // Sync state when active task changes
  useEffect(() => {
    if (!activeTask) return;
    setTitle(activeTask.title);
    setContent(activeTask.content);
    setStatus(activeTask.status);
    setDue(activeTask.due || '');
    setTags([...activeTask.tags]);
    setProject(activeTask.project);
    setTaskCode(activeTask.taskCode || '');
    setIsDirty(false);
  }, [activeTask?.id]);

  useEffect(() => {
    if (showTagInput) tagInputRef.current?.focus();
  }, [showTagInput]);

  // Auto-save debounced
  const save = useCallback(
    async (patch: Partial<Task>) => {
      if (!activeTask) return;
      const updated: Task = { ...activeTask, ...patch };
      await updateTask(updated);
      setIsDirty(false);
    },
    [activeTask, updateTask]
  );

  const scheduleSave = (patch: Partial<Task>) => {
    clearTimeout(saveTimeout.current ?? undefined);
    saveTimeout.current = setTimeout(() => save(patch), 800);
    setIsDirty(true);
  };

  const handleTitleChange = (v: string) => {
    setTitle(v);
    scheduleSave({ title: v });
  };

  const handleContentChange = (v: string) => {
    setContent(v);
    scheduleSave({ content: v });
  };

  const handleStatusChange = (v: TaskStatus) => {
    setStatus(v);
    save({ status: v });
  };

  const handleDueChange = (v: string) => {
    setDue(v);
    save({ due: v || undefined });
  };

  const handleProjectChange = (v: string) => {
    setProject(v);
    save({ project: v });
  };

  const handleTaskCodeChange = (v: string) => {
    // Allow only URL-safe characters: letters, digits, hyphens, underscores
    const cleaned = v.replace(/[^a-zA-Z0-9\-_]/g, '').toUpperCase();
    setTaskCode(cleaned);
    scheduleSave({ taskCode: cleaned || undefined });
  };

  const isDuplicateCode = useMemo(
    () => taskCode.length > 0 && tasks.some((t) => t.id !== activeTask?.id && t.taskCode === taskCode),
    [taskCode, tasks, activeTask?.id]
  );

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      const updated = [...new Set([...tags, newTag.trim()])];
      setTags(updated);
      save({ tags: updated });
      setNewTag('');
      setShowTagInput(false);
    }
    if (e.key === 'Escape') {
      setNewTag('');
      setShowTagInput(false);
    }
  };

  const handleRemoveTag = (tag: string) => {
    const updated = tags.filter((t) => t !== tag);
    setTags(updated);
    save({ tags: updated });
  };

  const handleDelete = async () => {
    if (!activeTask) return;
    await deleteTask(activeTask);
  };

  const handleDeleteClick = () => {
    if (!activeTask) return;
    confirmDeleteDialog.request(true, () => void handleDelete());
  };

  const handleOpenLinkedPath = (path: string) => {
    fs.openInSystem(path);
  };

  if (!activeTask) return null;

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status)!;
  const localizedStatusLabel = t(language, 'tasks', status === 'todo' ? 'statusTodo' : status === 'in-progress' ? 'statusInProgress' : 'statusDone');

  return (
    <div key={activeTask.id} className="task-panel-enter flex h-full w-[420px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-input)]">
      {/* Modal confirmación eliminar */}
      {confirmDeleteDialog.isOpen && (
        <ConfirmDeleteModal
          variant="soft"
          title={t(language, 'tasks', 'deleteTask')}
          message={
            <>
              {t(language, 'tasks', 'confirmDeleteMsg')}{' '}
              <span className="font-medium text-[var(--text-primary)]">"{activeTask.title}"</span>
            </>
          }
          cancelLabel={t(language, 'tasks', 'cancel')}
          confirmLabel={t(language, 'tasks', 'delete')}
          onCancel={confirmDeleteDialog.cancel}
          onConfirm={() => { confirmDeleteDialog.cancel(); void handleDelete(); }}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <button
            onClick={() => {
              const idx = STATUS_OPTIONS.findIndex((s) => s.value === status);
              const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
              handleStatusChange(next.value);
            }}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${currentStatus.color}`}
          >
            {localizedStatusLabel}
          </button>
          {isDirty && <span className="text-[10px] text-[var(--text-hint)]">{t(language, 'tasks', 'saving')}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDeleteClick}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:text-red-400 hover:bg-red-400/10"
            title={t(language, 'tasks', 'deleteTitleTooltip')}
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setActiveTask(null)}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            title={t(language, 'tasks', 'closeEditor')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Title */}
        <div className="px-5 pt-5 pb-3">
          <textarea
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder={t(language, 'tasks', 'titlePlaceholder')}
            rows={1}
            className="w-full resize-none bg-transparent text-xl font-semibold text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] leading-tight"
            style={{ overflow: 'hidden' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }}
          />
        </div>

        {/* Metadata */}
        <div className="px-5 pb-4 space-y-2 text-sm">
          {/* Project */}
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-[var(--text-hint)]">
              <FolderOpen size={12} className="inline mr-1" />
              {t(language, 'tasks', 'projectField')}
            </span>
            <div ref={projectMenuRef} className="relative flex-1">
              <button
                type="button"
                onClick={() => setShowProjectMenu((s) => !s)}
                className={`flex w-full items-center justify-between gap-1.5 rounded-md px-2 py-0.5 text-xs transition ${
                  showProjectMenu
                    ? 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <span className="truncate">{project}</span>
                <ChevronDown size={11} className={`shrink-0 text-[var(--text-hint)] transition-transform ${showProjectMenu ? 'rotate-180' : ''}`} />
              </button>
              {showProjectMenu && (
                <div className="absolute left-0 z-50 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-panel)] py-1 shadow-xl">
                  {projects.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { handleProjectChange(p); setShowProjectMenu(false); }}
                      className={`w-full px-3 py-1.5 text-left text-xs transition ${
                        p === project
                          ? 'bg-indigo-500/10 text-indigo-400'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Due date */}
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-[var(--text-hint)]">
              <Calendar size={12} className="inline mr-1" />
              {t(language, 'tasks', 'dueDate')}
            </span>
            <div className="flex-1">
              <AppDatePicker value={due} onChange={handleDueChange} />
            </div>
          </div>

          {/* Tags */}
          <div className="flex items-start gap-3">
            <span className="w-24 shrink-0 text-xs text-[var(--text-hint)] mt-1">
              <Tag size={12} className="inline mr-1" />
              {t(language, 'tasks', 'tagsLabel')}
            </span>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="opacity-60 hover:opacity-100"
                    title={t(language, 'tasks', 'removeTag')}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              {showTagInput ? (
                <input
                  ref={tagInputRef}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={handleAddTag}
                  onBlur={() => { setShowTagInput(false); setNewTag(''); }}
                  placeholder={t(language, 'tasks', 'tagPlaceholder')}
                  className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-300 outline-none w-24"
                />
              ) : (
                <button
                  onClick={() => setShowTagInput(true)}
                  className="rounded-full border border-[var(--border-card)] px-2 py-0.5 text-[10px] text-[var(--text-hint)] transition hover:text-[var(--text-tertiary)] hover:border-[var(--border-high)]"
                >
                  <Plus size={10} className="inline" /> {t(language, 'tasks', 'addTag')}
                </button>
              )}
            </div>
          </div>

          {/* Created */}
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-[var(--text-hint)]">{t(language, 'tasks', 'created')}</span>
            <span className="text-xs text-[var(--text-hint)]">{activeTask.created}</span>
          </div>

          {/* Task Code */}
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-[var(--text-hint)]">
              # {t(language, 'tasks', 'taskCodeLabel')}
            </span>
            <input
              value={taskCode}
              onChange={(e) => handleTaskCodeChange(e.target.value)}
              className={`flex-1 bg-transparent text-xs outline-none font-mono transition-colors ${
                isDuplicateCode ? 'text-red-400' : 'text-[var(--text-tertiary)]'
              }`}
              maxLength={32}
              spellCheck={false}
            />
            {isDuplicateCode && (
              <AlertTriangle size={12} className="shrink-0 text-red-400" aria-label={t(language, 'tasks', 'taskCodeDuplicate')} />
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 mb-3 h-px bg-[var(--border)]" />

        {/* Editor con barra de herramientas */}
        <div className="px-5 pb-4">
          <RichTextEditor
            value={content}
            onChange={handleContentChange}
            placeholder={t(language, 'tasks', 'descriptionPlaceholder')}
            minHeight="220px"
          />
        </div>

        {/* Linked paths */}
        <div className="px-5 pb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[var(--text-hint)] font-medium">
              <Link size={12} className="inline mr-1" />
              {t(language, 'tasks', 'linkedPaths')}
            </span>
            <button
              onClick={addLinkedPath}
              className="rounded-lg px-2 py-1 text-[10px] text-[var(--text-hint)] transition hover:text-indigo-400 hover:bg-indigo-500/10"
            >
              <Plus size={10} className="inline" /> {t(language, 'tasks', 'linkFile')}
            </button>
          </div>
          {activeTask.linked_paths.length === 0 ? (
            <p className="text-[10px] text-[var(--text-faint)] italic">
              {t(language, 'tasks', 'noLinkedFiles')}
            </p>
          ) : (
            <ul className="space-y-1">
              {activeTask.linked_paths.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1.5 group"
                >
                  <button
                    onClick={() => handleOpenLinkedPath(p)}
                    className="flex-1 truncate text-left text-[10px] text-[var(--text-muted)] transition hover:text-indigo-300 flex items-center gap-1"
                    title={p}
                  >
                    <ExternalLink size={10} className="shrink-0" />
                    <span className="truncate">{p}</span>
                  </button>
                  <button
                    onClick={() => removeLinkedPath(activeTask, p)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-hint)] hover:text-red-400 transition"
                    title={t(language, 'tasks', 'removeLinkedPath')}
                  >
                    <X size={10} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
