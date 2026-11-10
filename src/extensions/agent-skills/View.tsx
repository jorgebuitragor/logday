// Vista de Skills de agentes (specs/skills-de-agentes, design "Vista"): la
// columna con el buscador, el filtro por herramienta y los grupos, y el
// detalle de la elegida. En una ventana angosta se ve la lista o el
// detalle, con "Volver".
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronRight, RefreshCw, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { FOCUS_RING, ICON_BTN, INPUT_CLS } from '../../components/shared/controlClasses';
import { Spinner } from '../../components/shared/FormControls';
import { AGENT_SKILLS_ID, filterItems, groupItems, localeOf, readSettings, type SkillGroup, type ToolFilter } from './model';
import { useAgentSkills } from './store';
import { makeTr, trCode } from './text';
import { SkillDetail } from './SkillDetail';
import { ToolBadges } from './ToolBadges';

const TOOL_FILTERS: ToolFilter[] = ['all', 'claude', 'codex'];

export default function AgentSkillsView() {
  const { language, raw, update } = useAppStore(
    useShallow((s) => ({ language: s.language, raw: s.extensions[AGENT_SKILLS_ID]?.settings, update: s.updateExtensionSettings })),
  );
  const settings = useMemo(() => readSettings(raw), [raw]);
  const tr = useMemo(() => makeTr(language), [language]);
  const { items, loading, loaded, error, selectedKey, select, reload } = useAgentSkills(
    useShallow((s) => ({ items: s.items, loading: s.loading, loaded: s.loaded, error: s.error, selectedKey: s.selectedKey, select: s.select, reload: s.reload })),
  );
  const [query, setQuery] = useState('');
  const [live, setLive] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Se lee al abrir la vista: los agentes cambian estas carpetas por su
  // cuenta, así que no se da por buena una lista vieja.
  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(
    () => filterItems(items, { query, tool: settings.toolFilter, showPlugins: settings.showPlugins, showSystem: settings.showSystem }),
    [items, query, settings.toolFilter, settings.showPlugins, settings.showSystem],
  );
  const groups = useMemo(() => groupItems(filtered, localeOf(language)), [filtered, language]);
  const visible = useMemo(
    () => groups.flatMap((g) => (settings.collapsed.includes(g.group) ? [] : g.items)),
    [groups, settings.collapsed],
  );
  const selected = items.find((it) => it.key === selectedKey) ?? null;

  const setFilter = (toolFilter: ToolFilter) => void update(AGENT_SKILLS_ID, { toolFilter });
  const toggleGroup = (group: SkillGroup) => {
    const collapsed = settings.collapsed.includes(group) ? settings.collapsed.filter((g) => g !== group) : [...settings.collapsed, group];
    void update(AGENT_SKILLS_ID, { collapsed });
  };

  const refresh = useCallback(async () => {
    await reload();
    setLive('');
    window.setTimeout(() => setLive(tr('reloaded')), 50);
  }, [reload, tr]);

  // Flechas y Enter en la lista (design "Accesibilidad").
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    if (!visible.length) return;
    e.preventDefault();
    const i = visible.findIndex((it) => it.key === selectedKey);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? visible.length - 1 : e.key === 'ArrowDown' ? Math.min(visible.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    const key = visible[next].key;
    select(key);
    listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
  };

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-[var(--border)] p-3">
        <div className="flex items-center gap-1.5">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{tr('search')}</span>
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-hint)]" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('searchPlaceholder')}
              className={`${INPUT_CLS} w-full pl-7`}
            />
          </label>
          <button type="button" onClick={() => void refresh()} className={ICON_BTN} aria-label={tr('reload')} title={tr('reload')} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden />
          </button>
        </div>
        <div className="flex rounded-lg border border-[var(--border-card)] p-0.5 text-[11px]" role="group" aria-label={tr('toolFilterLabel')}>
          {TOOL_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={settings.toolFilter === f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-md px-2 py-1 ${FOCUS_RING} ${settings.toolFilter === f ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)]'}`}
            >
              {tr(`filter.${f}`)}
            </button>
          ))}
        </div>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1" onKeyDown={onListKey}>
        {!loaded ? (
          <div className="flex justify-center p-6"><Spinner /></div>
        ) : error ? (
          <p className="p-3 text-xs text-red-400" role="alert">{trCode(tr, 'err', error, 'err.unknown')}</p>
        ) : groups.length === 0 ? (
          <p className="p-3 text-xs text-[var(--text-hint)]">{tr(items.length ? 'noMatches' : 'empty')}</p>
        ) : (
          groups.map((g) => {
            const collapsed = settings.collapsed.includes(g.group);
            const Chevron = collapsed ? ChevronRight : ChevronDown;
            return (
              <section key={g.group} aria-labelledby={`agent-skills-group-${g.group}`}>
                <button
                  type="button"
                  id={`agent-skills-group-${g.group}`}
                  aria-expanded={!collapsed}
                  onClick={() => toggleGroup(g.group)}
                  className={`flex w-full items-center gap-1 px-3 pb-1 pt-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)] hover:text-[var(--text-secondary)] ${FOCUS_RING}`}
                >
                  <Chevron size={12} aria-hidden />
                  {tr(`group.${g.group}`)}
                  <span className="ml-auto font-normal tabular-nums">{g.items.length}</span>
                </button>
                {!collapsed && (
                  <div role="listbox" aria-labelledby={`agent-skills-group-${g.group}`}>
                    {g.items.map((it) => (
                      <div
                        key={it.key}
                        role="option"
                        tabIndex={it.key === selectedKey || (!selectedKey && it === visible[0]) ? 0 : -1}
                        aria-selected={it.key === selectedKey}
                        data-key={it.key}
                        onClick={() => select(it.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            select(it.key);
                          }
                        }}
                        className={`mx-1.5 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs ${FOCUS_RING} ${
                          it.key === selectedKey ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{it.name}</span>
                        {it.risky && (
                          <ShieldAlert size={12} className="shrink-0 text-amber-400" aria-label={tr('riskyAria')} role="img" />
                        )}
                        <ToolBadges tools={it.entry.tools} tr={tr} compact />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
      <p className="flex items-start gap-1.5 border-t border-[var(--border)] px-3 py-2.5 text-[10px] leading-snug text-[var(--text-hint)]">
        <ShieldCheck size={11} className="mt-px shrink-0" aria-hidden />
        {tr('safetyNote')}
      </p>
    </div>
  );

  return (
    <div className="@container/skills flex min-h-0 flex-1">
      {/* Ancha: columna y detalle. Angosta: la lista o el detalle. */}
      <nav
        aria-label={tr('navLabel')}
        className={`w-full shrink-0 flex-col border-[var(--border)] bg-[var(--bg-panel)] @2xl/skills:flex @2xl/skills:w-[280px] @2xl/skills:border-r ${selected ? 'hidden' : 'flex'}`}
      >
        {list}
      </nav>
      <section className={`min-w-0 flex-1 overflow-y-auto ${selected ? 'block' : 'hidden @2xl/skills:block'}`} aria-live="off">
        {selected ? (
          <SkillDetail item={selected} tr={tr} language={language} onBack={() => select(null)} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-xs text-[var(--text-hint)]">
            {loaded && !error ? tr('pickOne') : null}
          </div>
        )}
      </section>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {live}
      </div>
    </div>
  );
}
