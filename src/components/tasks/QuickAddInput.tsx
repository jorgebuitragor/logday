import { forwardRef, useMemo, useState } from 'react';
import { Plus, Folder, Calendar, Maximize2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import type { TaskStatus } from '../../types/task';
import { t } from '../../lib/i18n';
import { localISODate } from '../../lib/localDate';
import { parseQuickCapture, type QuickCaptureResult } from '../../lib/quickCapture';
import { formatDueLabel } from '../../lib/taskListing';

// Captura rápida de tareas, la misma en la lista y en el Kanban: se
// escribe, Enter, y se sigue con la siguiente sin abrir el panel. Entiende
// `#proyecto`, `@tag` y una fecha al final (ver lib/quickCapture.ts), y
// muestra debajo lo que va a asignar antes de crear.

interface Props {
  /** Estado con el que se crea (las columnas del Kanban). */
  status?: TaskStatus;
  compact?: boolean;
  autoFocus?: boolean;
  /** Esc con el campo vacío, o al perder el foco vacío (Kanban). */
  onDismiss?: () => void;
  /** ⌘/Ctrl+Enter: pasar a la ventana con todos los campos. */
  onMoreOptions?: (draft: QuickCaptureResult) => void;
}

export const QuickAddInput = forwardRef<HTMLInputElement, Props>(function QuickAddInput(
  { status, compact, autoFocus, onDismiss, onMoreOptions },
  ref,
) {
  const { createTask, projects, activeProject, language, showToast } = useAppStore(
    useShallow((s) => ({
      createTask: s.createTask,
      projects: s.projects,
      activeProject: s.activeProject,
      language: s.language,
      showToast: s.showToast,
    })),
  );
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const today = localISODate();
  const parsed = useMemo(() => parseQuickCapture(value, projects, today), [value, projects, today]);
  const due = parsed.due ? formatDueLabel(parsed.due, today, language) : null;
  const hasTokens = !!(parsed.project || parsed.tags.length || parsed.due);

  const submit = async () => {
    if (!parsed.title) return;
    const project = parsed.project ?? activeProject ?? 'inbox';
    setValue('');
    await createTask(parsed.title, project, '', undefined, {
      due: parsed.due,
      tags: parsed.tags,
      status,
      open: false,
    });
    // Creada en un proyecto que no es el que se está viendo: no aparece
    // en la lista, así que se avisa dónde quedó.
    if (activeProject && project !== activeProject && !project.startsWith(activeProject + '/')) {
      showToast({ kind: 'success', title: t(language, 'tasks', 'createdIn'), description: project });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onMoreOptions) {
      e.preventDefault();
      onMoreOptions(parsed);
      setValue('');
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (value) setValue('');
      else {
        e.currentTarget.blur();
        onDismiss?.();
      }
    }
  };

  return (
    <div
      className={`rounded-xl border transition ${
        focused ? 'border-indigo-500/50 bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-transparent hover:border-[var(--border-high)]'
      }`}
    >
      <div className={`flex items-center gap-2 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
        <Plus size={14} className={focused ? 'text-indigo-400' : 'text-[var(--text-hint)]'} />
        <input
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (!value) onDismiss?.();
          }}
          placeholder={t(language, 'tasks', 'quickAddPlaceholder')}
          aria-label={t(language, 'tasks', 'quickAddPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-hint)]"
        />
        {onMoreOptions && focused && (
          <button
            type="button"
            // mousedown: que el clic no le quite el foco al campo antes.
            onMouseDown={(e) => { e.preventDefault(); onMoreOptions(parsed); setValue(''); }}
            title={t(language, 'tasks', 'quickAddMore')}
            aria-label={t(language, 'tasks', 'quickAddMore')}
            className="shrink-0 rounded-md p-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          >
            <Maximize2 size={12} />
          </button>
        )}
      </div>
      {focused && (hasTokens || !compact) && (
        <div className={`flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] text-[11px] ${compact ? 'px-2.5 py-1.5' : 'px-3 py-1.5'}`}>
          {hasTokens ? (
            <>
              {parsed.project && (
                <span className="flex items-center gap-1 rounded-md bg-[var(--bg-hover)] px-1.5 py-0.5 text-[var(--text-secondary)]">
                  <Folder size={10} /> {parsed.project}
                </span>
              )}
              {due && (
                <span className="flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-indigo-400">
                  <Calendar size={10} /> {due.label}
                </span>
              )}
              {parsed.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-indigo-500/10 px-1.5 py-px text-[10px] text-indigo-400">{tag}</span>
              ))}
            </>
          ) : (
            <span className="text-[var(--text-faint)]">{t(language, 'tasks', 'quickAddHint')}</span>
          )}
        </div>
      )}
    </div>
  );
});
