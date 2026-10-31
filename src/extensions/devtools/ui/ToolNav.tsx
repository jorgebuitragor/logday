// Lista de herramientas con buscador (design §2 y §7). La usan la columna
// de 200 px y el selector de la ventana angosta. La lista es un solo tab
// stop (roving tabindex): ↑/↓ mueven el foco, Home y End van a los extremos.
import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Search } from 'lucide-react';
import { TOOL_GROUPS, type ToolId } from '../model';
import type { DevtoolsKey } from '../../../lib/i18n';
import { useDevtools } from './context';
import { TOOL_ICON } from './meta';
import { fold, toolKey } from './text';
import { FOCUS_RING } from './classes';

export function ToolNav({
  active, onSelect, searchRef, onEscapeEmpty, showKbd = false, idPrefix,
}: {
  active: ToolId;
  /** `focusInput`: se eligió con Enter desde el buscador. */
  onSelect: (tool: ToolId, focusInput: boolean) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  /** Esc con el buscador ya vacío. */
  onEscapeEmpty?: () => void;
  showKbd?: boolean;
  idPrefix: string;
}) {
  const { tr, shortcut } = useDevtools();
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = fold(query.trim());
    return TOOL_GROUPS.map((g) => ({
      group: g.group,
      tools: g.tools.filter((tool) => {
        if (!q) return true;
        const hay = fold([toolKey(tool, 'name'), toolKey(tool, 'keywords'), toolKey(tool, 'desc')].map((k) => tr(k)).join(' '));
        return q.split(/\s+/).every((w) => hay.includes(w));
      }),
    })).filter((g) => g.tools.length);
  }, [query, tr]);
  const flat = groups.flatMap((g) => g.tools);
  const [focusTool, setFocusTool] = useState<ToolId>(active);
  const tabStop = flat.includes(focusTool) ? focusTool : flat.includes(active) ? active : flat[0];
  const itemRefs = useRef(new Map<ToolId, HTMLButtonElement>());

  const focusItem = (tool: ToolId | undefined) => {
    if (!tool) return;
    setFocusTool(tool);
    itemRefs.current.get(tool)?.focus();
  };

  const onListKey = (e: KeyboardEvent, tool: ToolId) => {
    const i = flat.indexOf(tool);
    const target =
      e.key === 'ArrowDown' ? flat[(i + 1) % flat.length]
      : e.key === 'ArrowUp' ? flat[(i - 1 + flat.length) % flat.length]
      : e.key === 'Home' ? flat[0]
      : e.key === 'End' ? flat[flat.length - 1]
      : null;
    if (!target) return;
    e.preventDefault();
    focusItem(target);
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && flat[0]) {
      e.preventDefault();
      onSelect(flat[0], true);
    } else if (e.key === 'ArrowDown' && flat[0]) {
      e.preventDefault();
      focusItem(flat.includes(active) ? active : flat[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery('');
      else if (onEscapeEmpty) onEscapeEmpty();
      else e.currentTarget.blur();
    }
  };

  return (
    <>
      <div className="px-2 pb-2 pt-3">
        <div className="relative flex items-center">
          <Search size={13} className="pointer-events-none absolute left-2.5 text-[var(--text-hint)]" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder={tr('searchPlaceholder')}
            aria-label={tr('searchPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            className={`w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] py-1.5 pl-7 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none ${showKbd ? 'pr-12' : 'pr-2.5'}`}
          />
          {showKbd && (
            <kbd className="pointer-events-none absolute right-1.5 rounded-md border border-[var(--border-card)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--text-hint)]">
              {shortcut('mod+shift+F')}
            </kbd>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 pb-3">
        {!groups.length && <p className="px-2.5 text-xs text-[var(--text-hint)]">{tr('searchEmpty')}</p>}
        {groups.map((g) => {
          const headId = `${idPrefix}-group-${g.group}`;
          return (
            <div key={g.group} role="group" aria-labelledby={headId}>
              <div id={headId} className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]">
                {tr(`group.${g.group}` as DevtoolsKey)}
              </div>
              {g.tools.map((tool) => {
                const Icon = TOOL_ICON[tool];
                const isActive = tool === active;
                return (
                  <button
                    key={tool}
                    ref={(el) => {
                      if (el) itemRefs.current.set(tool, el);
                      else itemRefs.current.delete(tool);
                    }}
                    type="button"
                    tabIndex={tool === tabStop ? 0 : -1}
                    aria-current={isActive ? 'page' : undefined}
                    onFocus={() => setFocusTool(tool)}
                    onKeyDown={(e) => onListKey(e, tool)}
                    onClick={() => onSelect(tool, false)}
                    className={`flex w-full items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-2.5 text-left text-xs font-medium leading-snug transition ${FOCUS_RING} ${
                      isActive
                        ? 'bg-indigo-500/15 text-indigo-400'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon size={14} className="shrink-0" aria-hidden />
                    <span>{tr(toolKey(tool, 'name'))}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
