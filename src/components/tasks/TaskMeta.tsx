import { AlertTriangle, Calendar, Folder } from 'lucide-react';
import type { Task } from '../../types/task';
import type { Language } from '../../types/common';
import { t } from '../../lib/i18n';
import { formatDueLabel, type DueTone } from '../../lib/taskListing';

// Metadatos de una tarea (vencimiento, estado, progreso, código, proyecto y tags),
// los mismos en la fila de la lista y en la tarjeta del Kanban. Antes la
// tarjeta mostraba menos (sin código, 2 tags sin "+N") y en letra de 8 a
// 9 px.

const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: 'bg-red-500/10 text-red-400',
  today: 'bg-amber-500/10 text-amber-400',
  soon: 'bg-indigo-500/10 text-indigo-400',
  normal: 'text-[var(--text-muted)]',
};

/** Fecha de vencimiento como chip ("Hoy", "vie 30"), con su color. */
export function DueChip({ due, today, language }: { due: string; today: string; language: Language }) {
  const { label, tone } = formatDueLabel(due, today, language);
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${DUE_TONE_CLASS[tone]}`}
      title={due}
    >
      {tone === 'overdue' ? <AlertTriangle size={10} /> : <Calendar size={10} />}
      {label}
    </span>
  );
}

/** Progreso como una barra fina con el porcentaje al lado. Solo se muestra
 *  si la tarea tiene progreso (0 % cuenta: es distinto de no tener). La
 *  barra usa el acento del tema, para seguir al tema claro, oscuro o
 *  personalizado sin colores propios. */
export function ProgressMeter({ value, language }: { value: number; language: Language }) {
  const label = t(language, 'tasks', 'progressValue').replace('{n}', String(value));
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={t(language, 'tasks', 'progressField')}
      title={label}
      className="flex shrink-0 items-center gap-1"
    >
      <span className="h-1 w-10 overflow-hidden rounded-full bg-[var(--border-card)]">
        <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${value}%` }} />
      </span>
      <span className="tabular-nums text-[10px] text-[var(--text-muted)]">{value}%</span>
    </span>
  );
}

interface MetaProps {
  task: Task;
  language: Language;
  /** "En progreso" como texto (no en el Kanban, donde lo dice la columna). */
  showInProgress?: boolean;
  /** Fecha dentro de la línea de metadatos (Kanban); la lista la pone a la derecha del título. */
  due?: { today: string } | null;
  maxTags?: number;
}

export function TaskMeta({ task, language, showInProgress = false, due = null, maxTags = 3 }: MetaProps) {
  const extraTags = task.tags.slice(maxTags);
  const dueShown = due && task.due && task.status !== 'done';
  const inProgress = showInProgress && task.status === 'in-progress';
  const hasProgress = task.progress !== undefined;
  if (!inProgress && !hasProgress && !task.taskCode && task.project === 'inbox' && !task.tags.length && !dueShown) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-hint)]">
      {dueShown && <DueChip due={task.due!} today={due.today} language={language} />}
      {inProgress && (
        <span className="font-medium text-amber-400">{t(language, 'tasks', 'statusInProgress')}</span>
      )}
      {hasProgress && <ProgressMeter value={task.progress!} language={language} />}
      {task.taskCode && (
        <span className="rounded bg-[var(--bg-surface)] px-1 font-mono text-[10px] text-[var(--text-muted)]">{task.taskCode}</span>
      )}
      {task.project !== 'inbox' && (
        <span className="flex items-center gap-1">
          <Folder size={10} />
          {task.project}
        </span>
      )}
      {task.tags.slice(0, maxTags).map((tag) => (
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
  );
}
