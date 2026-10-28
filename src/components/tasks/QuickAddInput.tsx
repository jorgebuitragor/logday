import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Plus, Folder, Calendar, Maximize2, Tag } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import type { TaskStatus } from '../../types/task';
import { t } from '../../lib/i18n';
import { localISODate } from '../../lib/localDate';
import { applySuggestion, matchProject, parseQuickCapture, tokenAtCaret, type QuickCaptureResult } from '../../lib/quickCapture';
import { allTaskTags, formatDueLabel } from '../../lib/taskListing';

// Captura rápida de tareas, la misma en la lista y en el Kanban: se
// escribe, Enter, y se sigue con la siguiente sin abrir el panel. Entiende
// `#proyecto`, `@tag` y una fecha al final (ver lib/quickCapture.ts), y
// muestra debajo lo que va a asignar antes de crear. Al escribir # o @
// sugiere los proyectos y tags que ya existen (Tab o Enter los acepta).

const MAX_SUGGESTIONS = 6;

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
  const { createTask, projects, activeProject, language, showToast, tasks } = useAppStore(
    useShallow((s) => ({
      tasks: s.tasks,
      createTask: s.createTask,
      projects: s.projects,
      activeProject: s.activeProject,
      language: s.language,
      showToast: s.showToast,
    })),
  );
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  // Esc cierra las sugerencias de esta palabra (se guarda dónde empieza).
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const token = tokenAtCaret(value, caret);
  const tags = useMemo(() => allTaskTags(tasks), [tasks]);
  const suggestions = useMemo(() => {
    if (!token || dismissedAt === token.start) return [];
    const q = token.query.toLowerCase();
    const pool = token.kind === '#' ? projects : tags;
    const matches = pool.filter((item) => item.toLowerCase().includes(q));
    // Primero las que empiezan con lo escrito.
    matches.sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)));
    // Ya completa y única (o `#mobile` que ya resuelve a `logday/mobile`):
    // no hace falta sugerir.
    if (matches.length === 1 && (matches[0].toLowerCase() === q || (token.kind === '#' && matchProject(q, projects) === matches[0]))) return [];
    return matches.slice(0, MAX_SUGGESTIONS);
  }, [token, dismissedAt, projects, tags]);
  const showSuggestions = focused && suggestions.length > 0;

  const syncCaret = (el: HTMLInputElement) => setCaret(el.selectionStart ?? el.value.length);
  const accept = (text: string) => {
    if (!token) return;
    const next = applySuggestion(value, token, text);
    setValue(next.value);
    setCaret(next.caret);
    setHighlight(0);
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.caret, next.caret));
  };
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
    if (showSuggestions) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setHighlight((h) => (h + delta + suggestions.length) % suggestions.length);
        return;
      }
      if ((e.key === 'Tab' || e.key === 'Enter') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        accept(suggestions[Math.min(highlight, suggestions.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setDismissedAt(token?.start ?? null);
        return;
      }
    }
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
      className={`relative rounded-xl border transition ${
        focused ? 'border-indigo-500/50 bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-transparent hover:border-[var(--border-high)]'
      }`}
    >
      <div className={`flex items-center gap-2 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
        <Plus size={14} className={focused ? 'text-indigo-400' : 'text-[var(--text-hint)]'} />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => { setValue(e.target.value); syncCaret(e.target); setHighlight(0); setDismissedAt(null); }}
          onSelect={(e) => syncCaret(e.currentTarget)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
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
      {showSuggestions && token && (
        <div role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl">
          {suggestions.map((item, i) => {
            const Icon = token.kind === '#' ? Folder : Tag;
            const active = i === Math.min(highlight, suggestions.length - 1);
            return (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={active}
                // mousedown: que el clic no le quite el foco al campo.
                onMouseDown={(e) => { e.preventDefault(); accept(item); }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                  active ? 'bg-indigo-500/10 text-indigo-400' : 'text-[var(--text-secondary)]'
                }`}
              >
                <Icon size={11} className="shrink-0 opacity-70" />
                <span className="truncate">{item}</span>
              </button>
            );
          })}
          <p className="border-t border-[var(--border)] px-3 pt-1 text-[10px] text-[var(--text-faint)]">{t(language, 'tasks', 'suggestionsHint')}</p>
        </div>
      )}
    </div>
  );
});
