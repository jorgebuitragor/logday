import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Circle, Clock, CheckCircle2, Copy, Check, Trash2, Pencil, Plus, CalendarDays } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { useAppStore } from '../store/appStore';
import { placeMenuAtPointer } from '../lib/menuPosition';
import { t } from '../lib/i18n';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

const ESTIMATED_TASK_MENU = { width: 220, height: 330 };
const ESTIMATED_NEW_TASK_MENU = { width: 190, height: 56 };

interface Props {
  task: Task;
  x: number;
  y: number;
  onClose: () => void;
  onBeforeDelete?: () => void;
}

export function TaskContextMenu({ task, x, y, onClose, onBeforeDelete }: Props) {
  const { updateTask, deleteTask, setActiveTask, language, confirmDestructiveActions } = useAppStore();
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const confirmDeleteDialog = useConfirmDelete<true>(confirmDestructiveActions);
  // Adjust position after mount to avoid overflow
  const [pos, setPos] = useState(() => placeMenuAtPointer({ x, y }, ESTIMATED_TASK_MENU, { padding: 8 }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    setPos(placeMenuAtPointer({ x, y }, ESTIMATED_TASK_MENU, { padding: 8 }));
  }, [x, y]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;

    const recalc = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPos(placeMenuAtPointer({ x, y }, { width: rect.width, height: rect.height }, { padding: 8 }));
      setReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [x, y]);

  const handleStatusChange = async (status: TaskStatus) => {
    await updateTask({ ...task, status });
    onClose();
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

  if (confirmDeleteDialog.isOpen) {
    return (
      <ConfirmDeleteModal
        variant="soft"
        position={{ x, y }}
        zIndex={9999}
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
      style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 9999, visibility: ready ? 'visible' : 'hidden' }}
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

      {/* Copiar */}
      <div className="mx-2 my-1 border-t border-[var(--border)]" />
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
export function NewTaskContextMenu({ x, y, onClose, onNewEvent }: { x: number; y: number; onClose: () => void; onNewEvent?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => placeMenuAtPointer({ x, y }, ESTIMATED_NEW_TASK_MENU, { padding: 8 }));
  const [ready, setReady] = useState(false);
  const language = useAppStore((s) => s.language);

  useEffect(() => {
    setReady(false);
    setPos(placeMenuAtPointer({ x, y }, ESTIMATED_NEW_TASK_MENU, { padding: 8 }));
  }, [x, y]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;

    const recalc = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPos(placeMenuAtPointer({ x, y }, { width: rect.width, height: rect.height }, { padding: 8 }));
      setReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 9999, visibility: ready ? 'visible' : 'hidden' }}
      className="min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
    >
      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent('logday:new-task'));
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
