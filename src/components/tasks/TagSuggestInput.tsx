import { forwardRef, useMemo, useState } from 'react';
import { Tag } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { allTaskTags } from '../../lib/taskListing';

// Campo para agregar un tag que sugiere los que ya existen, para no terminar
// con "bug" y "bugs" o "hu01" y "HU01" (y el filtro de tags partido). Lo
// usan el panel de la tarea y la ventana "Nueva tarea".
//
// Enter agrega lo escrito tal cual, salvo que se haya elegido una
// sugerencia con ↑/↓: así crear un tag nuevo parecido a uno existente no
// lo reemplaza sin querer. Tab completa con la primera sugerencia.

const MAX_SUGGESTIONS = 6;

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Agregar este tag (Enter, Tab o clic en una sugerencia). */
  onCommit: (tag: string) => void;
  /** Tags que ya tiene la tarea: no se sugieren. */
  exclude: string[];
  onBlur?: () => void;
  /** Teclas propias del campo (Esc, Backspace, coma…) cuando no hay sugerencias abiertas. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  /** Clases del contenedor (p. ej. `flex-1` para que ocupe el ancho). */
  wrapperClassName?: string;
}

export const TagSuggestInput = forwardRef<HTMLInputElement, Props>(function TagSuggestInput(
  { value, onChange, onCommit, exclude, onBlur, onKeyDown, placeholder, className, wrapperClassName },
  ref,
) {
  const tasks = useAppStore((s) => s.tasks);
  const language = useAppStore((s) => s.language);
  const [highlight, setHighlight] = useState(-1);
  const [closed, setClosed] = useState(false);
  const allTags = useMemo(() => allTaskTags(tasks), [tasks]);
  const query = value.trim().replace(/^@/, '').toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return [];
    const matches = allTags.filter((tag) => !exclude.includes(tag) && tag.toLowerCase().includes(query));
    matches.sort((a, b) => Number(!a.toLowerCase().startsWith(query)) - Number(!b.toLowerCase().startsWith(query)));
    return matches.slice(0, MAX_SUGGESTIONS);
  }, [allTags, exclude, query]);
  const open = !closed && suggestions.length > 0;

  const pick = (tag: string) => {
    onCommit(tag);
    setHighlight(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        // -1 es "ninguna" (Enter agrega lo escrito); da la vuelta en los dos extremos.
        const last = suggestions.length - 1;
        setHighlight((h) => (e.key === 'ArrowDown' ? (h >= last ? -1 : h + 1) : (h <= -1 ? last : h - 1)));
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        pick(suggestions[Math.max(highlight, 0)]);
        return;
      }
      if (e.key === 'Enter' && highlight >= 0) {
        e.preventDefault();
        pick(suggestions[highlight]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setClosed(true);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <span className={`relative inline-flex ${wrapperClassName ?? ''}`}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => { onChange(e.target.value); setHighlight(-1); setClosed(false); }}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={className}
      />
      {open && (
        <span role="listbox" className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl">
          {suggestions.map((tag, i) => (
            <button
              key={tag}
              type="button"
              role="option"
              aria-selected={i === highlight}
              // mousedown: antes de que el campo pierda el foco (y agregue lo escrito).
              onMouseDown={(e) => { e.preventDefault(); pick(tag); }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                i === highlight ? 'bg-indigo-500/10 text-indigo-400' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Tag size={11} className="shrink-0 opacity-70" />
              <span className="truncate">{tag}</span>
            </button>
          ))}
          <span className="block border-t border-[var(--border)] px-3 pt-1 text-[10px] text-[var(--text-faint)]">{t(language, 'tasks', 'tagSuggestionsHint')}</span>
        </span>
      )}
    </span>
  );
});
