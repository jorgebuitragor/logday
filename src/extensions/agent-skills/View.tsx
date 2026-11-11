// Vista de Skills de agentes (specs/skills-de-agentes, design "Vista"): la
// columna con el buscador, el filtro por herramienta y los grupos, y el
// detalle de la elegida. En una ventana angosta se ve la lista o el
// detalle, con "Volver".
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, ChevronRight, FileArchive, FileText, FolderInput, Import, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { FOCUS_RING, ICON_BTN, INPUT_CLS, SECONDARY_CLS } from '../../components/shared/controlClasses';
import { ConfirmDeleteModal } from '../../components/shared/ConfirmDeleteModal';
import { Spinner } from '../../components/shared/FormControls';
import { discardStaged, errorCode, importDropped, importPick, revealSkill, trashSkill, type ImportKind, type SkillRef, type StagedBundle } from './api';
import { AGENT_SKILLS_ID, filterItems, groupItems, localeOf, readSettings, takenNames, type SkillGroup, type SkillItem, type ToolFilter } from './model';
import { useAgentSkills } from './store';
import { makeTr, trCode } from './text';
import { SkillDetail } from './SkillDetail';
import { SkillEditor } from './SkillEditor';
import { NewSkillModal } from './NewSkillModal';
import { DeleteSkillModal, trashChoices, type TrashChoice } from './DeleteSkillModal';
import { ImportPreview } from './ImportPreview';
import { RepoDetail, ReposColumn, SELECTED_ROW } from './ReposPanel';
import { ToolBadges } from './ToolBadges';
import { SkillsHome } from './SkillsHome';
import { SkillContextMenu, type SkillMenuAnchor } from './SkillContextMenu';
import { SkillActions, skillActions } from './actions';
import { DropOverlay, useSkillDrop } from './drop';

const keyOf = (ref: SkillRef) => `${ref.source}:${ref.id}`;

const TOOL_FILTERS: ToolFilter[] = ['all', 'claude', 'codex'];

export default function AgentSkillsView() {
  const { language, raw, update, showToast, confirmDestructiveActions } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[AGENT_SKILLS_ID]?.settings,
      update: s.updateExtensionSettings,
      showToast: s.showToast,
      confirmDestructiveActions: s.confirmDestructiveActions,
    })),
  );
  const settings = useMemo(() => readSettings(raw), [raw]);
  const tr = useMemo(() => makeTr(language), [language]);
  const { items, loading, loaded, error, selectedKey, editingKey, select, setEditing, reload, tab, setTab } = useAgentSkills(
    useShallow((s) => ({
      tab: s.tab,
      setTab: s.setTab,
      items: s.items,
      loading: s.loading,
      loaded: s.loaded,
      error: s.error,
      selectedKey: s.selectedKey,
      editingKey: s.editingKey,
      select: s.select,
      setEditing: s.setEditing,
      reload: s.reload,
    })),
  );
  const [query, setQuery] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [importMenu, setImportMenu] = useState(false);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  // El menú Importar se cierra con un clic fuera o con Escape, como los
  // demás menús de la app; antes solo se cerraba eligiendo una opción.
  useEffect(() => {
    if (!importMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!importMenuRef.current?.contains(t) && !importButtonRef.current?.contains(t)) setImportMenu(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setImportMenu(false);
      importButtonRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [importMenu]);
  const [bundle, setBundle] = useState<StagedBundle | null>(null);
  const [deleting, setDeleting] = useState<SkillItem | null>(null);
  const [menu, setMenu] = useState<{ item: SkillItem; anchor: SkillMenuAnchor } | null>(null);
  const taken = useMemo(() => takenNames(items), [items]);
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
  const { selectedRepoId, selectRepo } = useAgentSkills(useShallow((s) => ({ selectedRepoId: s.selectedRepoId, selectRepo: s.selectRepo })));
  // En ventana angosta se ve la lista o el detalle.
  const detailOpen = tab === 'repos' ? !!selectedRepoId : !!selected;
  const detailKey = tab === 'repos' ? `repo:${selectedRepoId ?? ''}` : selected ? `${selected.key}:${editingKey === selected.key ? 'edit' : 'view'}` : 'home';

  const setFilter = (toolFilter: ToolFilter) => void update(AGENT_SKILLS_ID, { toolFilter });
  const toggleGroup = (group: SkillGroup) => {
    const collapsed = settings.collapsed.includes(group) ? settings.collapsed.filter((g) => g !== group) : [...settings.collapsed, group];
    void update(AGENT_SKILLS_ID, { collapsed });
  };

  const announce = useCallback((message: string) => {
    setLive('');
    window.setTimeout(() => setLive(message), 50);
  }, []);

  const refresh = useCallback(async () => {
    await reload();
    announce(tr('reloaded'));
  }, [announce, reload, tr]);

  /** Una acción que cambia skills: al terminar se vuelve a leer la lista y,
   *  si se da, se elige otra. `cancelled` (dijo que no en el diálogo
   *  nativo) no es un error. */
  const run = useCallback(
    (action: () => Promise<unknown>, done: string, nextKey?: string | null) => {
      void (async () => {
        try {
          await action();
          await reload();
          if (nextKey !== undefined) select(nextKey);
          showToast({ kind: 'success', title: done });
          announce(done);
        } catch (err) {
          const code = errorCode(err);
          if (code === 'cancelled') return;
          showToast({ kind: 'error', title: trCode(tr, 'err', code, 'err.unknown') });
          await reload();
        }
      })();
    },
    [announce, reload, select, showToast, tr],
  );

  const doTrash = (choice: TrashChoice) => {
    setDeleting(null);
    const all = choice.scope === 'all';
    run(() => trashSkill(choice.loc, choice.scope), tr(all || !choice.loc.isLink ? 'done.trashed' : 'done.unlinked'), all || !choice.loc.isLink ? null : undefined);
  };

  const askDelete = (item: SkillItem) => {
    // Con la opción global apagada y sin nada que elegir, directo.
    if (!confirmDestructiveActions && trashChoices(item).links.length === 0) {
      doTrash(item.entry.primary.isLink ? { loc: item.entry.primary, scope: 'location' } : trashChoices(item).all);
    } else {
      setDeleting(item);
    }
  };

  const actionsFor = (item: SkillItem) =>
    skillActions(item, {
      tr,
      language,
      run,
      onEdit: () => {
        select(item.key);
        setEditing(item.key);
      },
      onDelete: () => askDelete(item),
    });

  /** Clic derecho, o la tecla de menú / Mayús+F10 sobre la fila enfocada. */
  const openMenu = (item: SkillItem, anchor: SkillMenuAnchor) => setMenu({ item, anchor: { ...anchor } });

  /** Abre la vista previa con lo preparado, o avisa si no hay skills. */
  const openBundle = useCallback(
    async (prepare: () => Promise<StagedBundle | null>, emptyKey: 'import.noneFound' | 'import.dropNothing') => {
      try {
        const b = await prepare();
        if (!b) {
          if (emptyKey === 'import.dropNothing') showToast({ kind: 'error', title: tr(emptyKey) });
          return;
        }
        if (!b.skills.length) {
          void discardStaged(b.id).catch(() => undefined);
          // Un .md sin el encabezado de una skill no es lo mismo que "no hay SKILL.md".
          showToast({ kind: 'error', title: tr(b.origin.kind === 'md' ? 'err.not_skill' : 'import.noneFound') });
          return;
        }
        setTab('installed');
        setBundle(b);
      } catch (err) {
        showToast({ kind: 'error', title: trCode(tr, 'err', errorCode(err), 'err.unknown') });
      }
    },
    [setTab, showToast, tr],
  );

  const startImport = (kind: ImportKind) => {
    setImportMenu(false);
    void openBundle(() => importPick(kind), 'import.noneFound');
  };

  // Soltar una carpeta o un .zip en cualquier parte de la vista (SK14).
  const dragging = useSkillDrop(!bundle && !newOpen, (paths) => void openBundle(() => importDropped(paths), 'import.dropNothing'));

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
        <div className="relative flex items-center gap-1.5">
          <button type="button" className={`${SECONDARY_CLS} flex-1 justify-center`} onClick={() => setNewOpen(true)}>
            <Plus size={13} aria-hidden />
            {tr('action.new')}
          </button>
          <button
            type="button"
            className={`${SECONDARY_CLS} flex-1 justify-center`}
            aria-haspopup="menu"
            aria-expanded={importMenu}
            ref={importButtonRef}
            onClick={() => setImportMenu((v) => !v)}
          >
            <Import size={13} aria-hidden />
            {tr('action.import')}
          </button>
          {importMenu && (
            <div
              role="menu"
              ref={importMenuRef}
              className="skl-pop skl-pop-right absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] p-1 shadow-xl"
            >
              <button role="menuitem" type="button" autoFocus className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] ${FOCUS_RING}`} onClick={() => void startImport('folder')}>
                <FolderInput size={13} aria-hidden />
                {tr('import.folder')}
              </button>
              <button role="menuitem" type="button" className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] ${FOCUS_RING}`} onClick={() => void startImport('zip')}>
                <FileArchive size={13} aria-hidden />
                {tr('import.zip')}
              </button>
              <button role="menuitem" type="button" className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] ${FOCUS_RING}`} onClick={() => void startImport('md')}>
                <FileText size={13} aria-hidden />
                {tr('import.md')}
              </button>
              <p className="border-t border-[var(--border)] px-2 pb-1 pt-1.5 text-[10px] leading-snug text-[var(--text-hint)]">{tr('import.dropHint')}</p>
            </div>
          )}
        </div>
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
            return (
              // Cada grupo es un bloque: línea arriba (salvo el primero) y encabezado
              // fijo al desplazar, para saber siempre en qué grupo se está.
              <section
                key={g.group}
                aria-labelledby={`agent-skills-group-${g.group}`}
                className="border-t border-[var(--border)] first:border-t-0 [&:not(:first-child)]:mt-1.5"
              >
                <button
                  type="button"
                  id={`agent-skills-group-${g.group}`}
                  aria-expanded={!collapsed}
                  onClick={() => toggleGroup(g.group)}
                  className={`sticky top-0 z-[1] flex w-full items-center gap-1.5 bg-[var(--bg-panel)] px-3 pb-1.5 pt-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${FOCUS_RING}`}
                >
                  <ChevronRight size={12} className={`skl-chevron text-[var(--text-hint)] ${collapsed ? '' : 'rotate-90'}`} aria-hidden />
                  {tr(`group.${g.group}`)}
                  <span className="ml-auto rounded-full bg-[var(--bg-hover)] px-1.5 py-px font-medium tracking-normal tabular-nums text-[var(--text-hint)]">
                    {g.items.length}
                  </span>
                </button>
                {!collapsed && (
                  <div role="listbox" aria-labelledby={`agent-skills-group-${g.group}`} className="pb-1.5">
                    {g.items.map((it, i) => (
                      <div
                        key={it.key}
                        role="option"
                        style={{ '--skl-delay': `${Math.min(i, 12) * 20}ms` } as CSSProperties}
                        tabIndex={it.key === selectedKey || (!selectedKey && it === visible[0]) ? 0 : -1}
                        aria-selected={it.key === selectedKey}
                        data-key={it.key}
                        onClick={() => select(it.key)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openMenu(it, { x: e.clientX, y: e.clientY });
                        }}
                        aria-haspopup="menu"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            select(it.key);
                          } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                            e.preventDefault();
                            const r = e.currentTarget.getBoundingClientRect();
                            openMenu(it, { x: r.left + 16, y: r.bottom });
                          }
                        }}
                        className={`skl-row-in mx-1.5 flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-[background-color,box-shadow] duration-150 ${FOCUS_RING} ${
                          it.key === selectedKey ? SELECTED_ROW : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-[var(--text-primary)]">{it.name}</span>
                            {it.risky && (
                              <ShieldAlert size={12} className="shrink-0 text-amber-400" aria-label={tr('riskyAria')} role="img" />
                            )}
                          </span>
                          {it.description && <span className="mt-0.5 block truncate text-[11px] text-[var(--text-hint)]">{it.description}</span>}
                        </span>
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
    <div className="@container/skills relative flex min-h-0 flex-1">
      {dragging && <DropOverlay tr={tr} />}
      {/* Ancha: columna y detalle. Angosta: la lista o el detalle. */}
      <nav
        aria-label={tr('navLabel')}
        className={`w-full shrink-0 flex-col border-[var(--border)] bg-[var(--bg-panel)] @2xl/skills:flex @2xl/skills:w-[280px] @2xl/skills:border-r ${detailOpen ? 'hidden' : 'flex'}`}
      >
        <div role="tablist" aria-label={tr('tabs.label')} className="flex gap-1 border-b border-[var(--border)] px-3 pt-2">
          {(['installed', 'repos'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-2 py-1.5 text-xs transition-colors duration-150 ${FOCUS_RING} ${tab === id ? 'border-indigo-500 text-[var(--text-primary)]' : 'border-transparent text-[var(--text-hint)] hover:text-[var(--text-secondary)]'}`}
            >
              {tr(`tabs.${id}`)}
            </button>
          ))}
        </div>
        {tab === 'repos' ? <ReposColumn tr={tr} language={language} /> : list}
      </nav>
      <section className={`min-w-0 flex-1 overflow-y-auto ${detailOpen ? 'block' : 'hidden @2xl/skills:block'}`} aria-live="off">
        {/* La clave cambia con lo que se muestra, para que entre animado. */}
        <div key={detailKey} className="skl-detail-in h-full">
        {tab === 'repos' ? (
          <>
            {/* En ventana angosta, volver a la lista de repos. */}
            <button type="button" onClick={() => selectRepo(null)} className={`${ICON_BTN} ml-3.5 mt-3 @2xl/skills:hidden`}>
              <ArrowLeft size={14} aria-hidden />
              {tr('tabs.repos')}
            </button>
            <RepoDetail
              tr={tr}
              language={language}
              taken={taken}
              onInstalled={(refs) => {
                void reload();
                const title = refs.length === 1 ? tr('done.installed') : tr('done.installedN', { n: refs.length });
                showToast({ kind: 'success', title });
                announce(title);
              }}
            />
          </>
        ) : selected && editingKey === selected.key ? (
          <SkillEditor
            item={selected}
            tr={tr}
            language={language}
            onDone={(saved) => {
              setEditing(null);
              if (saved) {
                showToast({ kind: 'success', title: tr('done.saved') });
                announce(tr('done.saved'));
                void reload();
              }
            }}
          />
        ) : selected ? (
          <SkillDetail
            item={selected}
            tr={tr}
            language={language}
            onBack={() => select(null)}
            actions={<SkillActions actions={actionsFor(selected)} />}
          />
        ) : (
          loaded && !error ? (
            <SkillsHome items={items} tr={tr} onImport={startImport} onNew={() => setNewOpen(true)} onRepos={() => setTab('repos')} onSelect={select} />
          ) : null
        )}
        </div>
      </section>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {live}
      </div>
      {newOpen && (
        <NewSkillModal
          tr={tr}
          language={language}
          taken={taken}
          onClose={() => setNewOpen(false)}
          onCreated={(ref) => {
            setNewOpen(false);
            void reload().then(() => {
              select(keyOf(ref));
              setEditing(keyOf(ref));
            });
            showToast({ kind: 'success', title: tr('done.created') });
          }}
        />
      )}
      {bundle && (
        <ImportPreview
          bundle={bundle}
          taken={taken}
          tr={tr}
          language={language}
          onClose={(installed) => {
            setBundle(null);
            if (!installed) return;
            void reload().then(() => {
              if (installed[0]) select(keyOf(installed[0]));
            });
            const title = installed.length === 1 ? tr('done.installed') : tr('done.installedN', { n: installed.length });
            showToast({ kind: 'success', title });
            announce(title);
          }}
        />
      )}
      {menu && (
        <SkillContextMenu
          anchor={menu.anchor}
          name={menu.item.name}
          actions={actionsFor(menu.item)}
          tr={tr}
          onReveal={() => {
            revealSkill(menu.item.entry.primary).catch((err) => showToast({ kind: 'error', title: trCode(tr, 'err', errorCode(err), 'err.unknown') }));
          }}
          onClose={() => {
            const key = menu.item.key;
            setMenu(null);
            // El foco vuelve a la fila, como al cerrar un menú nativo.
            listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
          }}
        />
      )}
      {deleting &&
        (trashChoices(deleting).links.length > 0 ? (
          <DeleteSkillModal item={deleting} tr={tr} onCancel={() => setDeleting(null)} onConfirm={doTrash} />
        ) : (
          <ConfirmDeleteModal
            title={tr('delete.title', { name: deleting.name })}
            message={tr(deleting.entry.primary.isLink ? 'delete.linkMessage' : 'delete.message')}
            cancelLabel={tr('cancel')}
            confirmLabel={tr(deleting.entry.primary.isLink ? 'delete.removeLink' : 'delete.confirm')}
            onCancel={() => setDeleting(null)}
            onConfirm={() => doTrash(deleting.entry.primary.isLink ? { loc: deleting.entry.primary, scope: 'location' } : trashChoices(deleting).all)}
          />
        ))}
    </div>
  );
}
