// Lista de herramientas con buscador (design §2, §7 y Adenda G §G.2). La
// usan la columna de 200 px y el selector de la ventana angosta, así que
// los dos comparten el orden, las ocultas y los grupos plegados (D21), que
// salen de lo guardado. La lista es un solo tab stop (roving tabindex):
// ↑/↓ mueven el foco por encabezados e ítems, Home y End van a los
// extremos, y ← y → pliegan y despliegan como en un árbol.
import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import {
  isGroupCollapsed, resolveToolList, toggleGroupCollapsed, type DevtoolsSettings, type ResolvedToolList, type ToolGroup, type ToolId,
} from '../model';
import type { DevtoolsKey } from '../../../lib/i18n';
import { useDevtools } from './context';
import { TOOL_ICON } from './meta';
import { fold, localeOf, toolKey } from './text';
import { FOCUS_RING, ICON_BTN } from './classes';

/** Un bloque de la lista: un grupo, las ocultas o la lista A-Z. */
export interface NavBlock {
  /** `null` en A-Z (sin encabezado). */
  group: ToolGroup | 'hidden' | null;
  /** Las que se dibujan (en un grupo plegado, solo la activa). */
  tools: ToolId[];
  /** El encabezado es un botón que pliega (Por grupos, sin buscar). */
  collapsible: boolean;
  collapsed: boolean;
  /** Las visibles del grupo, para el contador. */
  count: number;
}

/** Lo que dibuja la lista (§G.2): con `matches`, solo lo que coincide con
 *  la búsqueda, todo desplegado; sin él, los grupos plegados muestran solo
 *  la activa. Las ocultas van al final: sin buscar, solo la activa. */
export function navBlocks(
  resolved: ResolvedToolList,
  settings: Pick<DevtoolsSettings, 'collapsed'>,
  active: ToolId,
  matches?: (tool: ToolId) => boolean,
): NavBlock[] {
  const out: NavBlock[] = resolved.sections.map((s) => {
    // Buscar no tiene en cuenta los plegados (D21) ni cambia lo guardado.
    const collapsible = s.group !== null && !matches;
    const collapsed = collapsible && isGroupCollapsed(settings, s.group as ToolGroup);
    const tools = matches ? s.tools.filter(matches) : collapsed ? s.tools.filter((tool) => tool === active) : s.tools;
    return { group: s.group, tools, collapsible, collapsed, count: s.tools.length };
  });
  const hidden = resolved.hidden.filter((tool) => (matches ? matches(tool) : tool === active));
  if (hidden.length) out.push({ group: 'hidden', tools: hidden, collapsible: false, collapsed: false, count: hidden.length });
  // Un grupo plegado se dibuja aunque no muestre ninguna herramienta.
  return out.filter((b) => b.tools.length || b.collapsible);
}

type FocusKey = `head:${string}` | `tool:${ToolId}`;
const headKey = (group: string): FocusKey => `head:${group}`;
const toolFocusKey = (tool: ToolId): FocusKey => `tool:${tool}`;

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
  const { tr, shortcut, settings, language, updateSettings, openSettings } = useDevtools();
  const [query, setQuery] = useState('');
  const resolved = useMemo(
    () => resolveToolList(settings, (tool) => tr(toolKey(tool, 'name')), localeOf(language)),
    [settings, tr, language],
  );

  const blocks = useMemo(() => {
    const q = fold(query.trim());
    const matches = (tool: ToolId) => {
      const hay = fold([toolKey(tool, 'name'), toolKey(tool, 'keywords'), toolKey(tool, 'desc')].map((k) => tr(k)).join(' '));
      return q.split(/\s+/).every((w) => hay.includes(w));
    };
    return navBlocks(resolved, settings, active, q ? matches : undefined);
  }, [query, resolved, settings, active, tr]);

  // La secuencia del roving, en el orden que se ve.
  const sequence = useMemo<FocusKey[]>(
    () => blocks.flatMap((b) => [...(b.collapsible ? [headKey(b.group as string)] : []), ...b.tools.map(toolFocusKey)]),
    [blocks],
  );
  const shownTools = blocks.flatMap((b) => b.tools);
  const [focusKey, setFocusKey] = useState<FocusKey>(toolFocusKey(active));
  const tabStop: FocusKey | undefined = sequence.includes(focusKey)
    ? focusKey
    : sequence.includes(toolFocusKey(active))
      ? toolFocusKey(active)
      : sequence[0];
  const refs = useRef(new Map<FocusKey, HTMLButtonElement>());

  const focusOn = (key: FocusKey | undefined) => {
    if (!key) return;
    setFocusKey(key);
    refs.current.get(key)?.focus();
  };
  const setRef = (key: FocusKey) => (el: HTMLButtonElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };

  const toggle = (group: ToolGroup) => updateSettings((current) => toggleGroupCollapsed(current, group));

  /** ↑/↓, Home y End: comunes a encabezados e ítems. */
  const moveKey = (e: KeyboardEvent, key: FocusKey) => {
    const i = sequence.indexOf(key);
    const n = sequence.length;
    const target =
      e.key === 'ArrowDown' ? sequence[(i + 1) % n]
      : e.key === 'ArrowUp' ? sequence[(i - 1 + n) % n]
      : e.key === 'Home' ? sequence[0]
      : e.key === 'End' ? sequence[n - 1]
      : null;
    if (!target) return false;
    e.preventDefault();
    focusOn(target);
    return true;
  };

  const onHeadKey = (e: KeyboardEvent, block: NavBlock) => {
    if (moveKey(e, headKey(block.group as string))) return;
    const group = block.group as ToolGroup;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (block.collapsed) toggle(group);
      else focusOn(block.tools[0] ? toolFocusKey(block.tools[0]) : undefined);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!block.collapsed) toggle(group);
    }
  };

  const onItemKey = (e: KeyboardEvent, tool: ToolId, block: NavBlock) => {
    if (moveKey(e, toolFocusKey(tool))) return;
    // ← lleva a su encabezado, sin plegar (la convención de un árbol).
    if (e.key === 'ArrowLeft' && block.collapsible) {
      e.preventDefault();
      focusOn(headKey(block.group as string));
    }
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && shownTools[0]) {
      // El primer resultado en el orden que se ve: las ocultas van al
      // final, así que nunca le ganan a una visible.
      e.preventDefault();
      onSelect(shownTools[0], true);
    } else if (e.key === 'ArrowDown' && sequence[0]) {
      e.preventDefault();
      focusOn(sequence.includes(toolFocusKey(active)) ? toolFocusKey(active) : sequence[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery('');
      else if (onEscapeEmpty) onEscapeEmpty();
      else e.currentTarget.blur();
    }
  };

  const renderTool = (tool: ToolId, block: NavBlock) => {
    const Icon = TOOL_ICON[tool];
    const isActive = tool === active;
    const key = toolFocusKey(tool);
    return (
      <button
        key={tool}
        ref={setRef(key)}
        type="button"
        tabIndex={key === tabStop ? 0 : -1}
        aria-current={isActive ? 'page' : undefined}
        onFocus={() => setFocusKey(key)}
        onKeyDown={(e) => onItemKey(e, tool, block)}
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
  };

  return (
    <>
      <div className="flex items-center gap-1 px-2 pb-2 pt-3">
        <div className="relative flex min-w-0 flex-1 items-center">
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
        {/* D17: las opciones de la lista, en Opciones → DevTools. */}
        <button
          type="button"
          onClick={openSettings}
          aria-label={tr('set.openTitle')}
          title={tr('set.openTitle')}
          className={`${ICON_BTN} min-h-7 min-w-7 shrink-0 justify-center`}
        >
          <SlidersHorizontal size={13} aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3">
        {!blocks.length && <p className="px-2.5 text-xs text-[var(--text-hint)]">{tr('searchEmpty')}</p>}
        {blocks.map((block) => {
          if (block.group === null) return <div key="az" className="flex flex-col">{block.tools.map((tool) => renderTool(tool, block))}</div>;
          const group = block.group;
          const headId = `${idPrefix}-group-${group}`;
          const itemsId = `${idPrefix}-items-${group}`;
          const label = tr(`group.${group}` as DevtoolsKey);
          return (
            <div key={group} role="group" aria-labelledby={headId} className={block.collapsed ? '' : 'pb-4'}>
              {block.collapsible ? (
                <button
                  ref={setRef(headKey(group))}
                  id={headId}
                  type="button"
                  tabIndex={headKey(group) === tabStop ? 0 : -1}
                  aria-expanded={!block.collapsed}
                  aria-controls={itemsId}
                  onFocus={() => setFocusKey(headKey(group))}
                  onKeyDown={(e) => onHeadKey(e, block)}
                  onClick={() => toggle(group as ToolGroup)}
                  className={`flex w-full items-center justify-between gap-1 rounded-md px-2.5 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)] transition hover:text-[var(--text-secondary)] ${FOCUS_RING}`}
                >
                  <span>
                    {label}
                    <span className="sr-only">
                      {block.count === 1 ? tr('groupCountOne') : tr('groupCount', { n: block.count })}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    {block.collapsed && (
                      <span aria-hidden className="font-normal tabular-nums text-[var(--text-faint)]">
                        {block.count}
                      </span>
                    )}
                    <ChevronRight
                      size={11}
                      aria-hidden
                      className={`transition-transform motion-reduce:transition-none ${block.collapsed ? '' : 'rotate-90'}`}
                    />
                  </span>
                </button>
              ) : (
                <div id={headId} className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]">
                  {label}
                </div>
              )}
              <div id={itemsId}>{block.tools.map((tool) => renderTool(tool, block))}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
