// Pestaña Repos (specs/skills-de-agentes, fase 3): la columna con los repos
// vinculados (GitHub, GitLab o un servidor propio) y el catálogo del
// elegido, con el estado de cada skill, Instalar, Actualizar y Ver cambios.
// A un servidor solo se va cuando el usuario abre un repo o pulsa "Buscar
// actualizaciones" (SK22).
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Diff, Download, ExternalLink, GitBranch, Plus, RefreshCw, Server, Trash2, TriangleAlert } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { CHIP, FOCUS_RING, ICON_BTN, INPUT_CLS, SECONDARY_CLS } from '../../components/shared/controlClasses';
import { Spinner } from '../../components/shared/FormControls';
import { fs } from '../../lib/invoke';
import type { Language } from '../../lib/i18n';
import { lineDiff } from '../devtools/tools/diff';
import { addServer, compareStaged, errorCode, type FileChange, type ServerInfo, type SkillRef, type Tool } from './api';
import { AGENT_SKILLS_ID } from './model';
import { catalogEntries, GITHUB_HOST, parseRepo, readRepos, repoLabel, repoWebUrl, sameRepo, type CatalogEntry, type LinkedRepo } from './repos';
import { useAgentSkills } from './store';
import { ImportPreview, type ImportPreset } from './ImportPreview';
import { SkillModal } from './SkillModal';
import { trCode, dateTime, type Tr } from './text';

/** Un texto por su clave completa (`repos.invalid`, `err.<código>`), o el
 *  genérico si no existe. */
function trKey(tr: Tr, key: string): string {
  const text = tr(key as Parameters<Tr>[0]);
  return text === key ? tr('err.unknown') : text;
}

function newId(): string {
  return `r_${Math.random().toString(36).slice(2, 10)}`;
}

export function useLinkedRepos() {
  const { raw, update } = useAppStore(useShallow((s) => ({ raw: s.extensions[AGENT_SKILLS_ID]?.settings?.repos, update: s.updateExtensionSettings })));
  const repos = useMemo(() => readRepos(raw), [raw]);
  const save = (next: LinkedRepo[]) => void update(AGENT_SKILLS_ID, { repos: next });
  return { repos, save };
}

/** La columna de la pestaña Repos. */
export function ReposColumn({ tr, language }: { tr: Tr; language: Language }) {
  const { repos, save } = useLinkedRepos();
  const { catalogs, installed, selectedRepoId, selectRepo, fetchCatalog, dropCatalog, servers, loadServers } = useAgentSkills(
    useShallow((s) => ({
      catalogs: s.catalogs,
      installed: s.installed,
      selectedRepoId: s.selectedRepoId,
      selectRepo: s.selectRepo,
      fetchCatalog: s.fetchCatalog,
      dropCatalog: s.dropCatalog,
      servers: s.servers,
      loadServers: s.loadServers,
    })),
  );
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** La URL es de un host que no está en la lista: se ofrece añadirlo. */
  const [unknownHost, setUnknownHost] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const add = (list: ServerInfo[] = servers) => {
    const parsed = parseRepo(input, list);
    if (!parsed.ok) {
      if (parsed.reason === 'unknownHost') {
        setUnknownHost(parsed.host);
        setError(null);
      } else {
        setError('repos.invalid');
      }
      return;
    }
    const ref = parsed.repo;
    const existing = repos.find((r) => sameRepo(r, ref));
    if (existing) {
      selectRepo(existing.id);
      setInput('');
      return;
    }
    const linked: LinkedRepo = { id: newId(), ...ref };
    save([...repos, linked]);
    setInput('');
    setError(null);
    setUnknownHost(null);
    selectRepo(linked.id);
    void fetchCatalog(linked);
  };

  const remove = (r: LinkedRepo) => {
    save(repos.filter((x) => x.id !== r.id));
    dropCatalog(r.id);
    if (selectedRepoId === r.id) selectRepo(null);
  };

  /** Añadir el host como servidor propio pide confirmación nativa (SK36). */
  const allowHost = async (kind: 'gitlab' | 'gitea') => {
    if (!unknownHost) return;
    setError(null);
    try {
      const server = await addServer(language, unknownHost, kind);
      await loadServers();
      setUnknownHost(null);
      add([...servers.filter((s) => s.host !== server.host), server]);
    } catch (err) {
      const code = errorCode(err);
      if (code !== 'cancelled') setError(`err.${code}`);
    }
  };

  const checkAll = async () => {
    setCheckingAll(true);
    // Uno tras otro: los servidores limitan las peticiones sin token.
    for (const r of repos) await fetchCatalog(r);
    setCheckingAll(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="space-y-1.5 border-b border-[var(--border)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="block space-y-1">
          <span className="block text-[11px] text-[var(--text-hint)]">{tr('repos.addLabel')}</span>
          <div className="flex gap-1.5">
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError(null);
                setUnknownHost(null);
              }}
              placeholder="anthropics/skills"
              spellCheck={false}
              autoCapitalize="off"
              className={`${INPUT_CLS} min-w-0 flex-1 font-mono`}
            />
            <button type="submit" className={ICON_BTN} aria-label={tr('repos.add')} title={tr('repos.add')}>
              <Plus size={14} aria-hidden />
            </button>
          </div>
        </label>
        {error && <p className="text-[11px] text-red-400" role="alert">{trKey(tr, error)}</p>}
        {unknownHost && (
          <div className="space-y-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] p-2 text-[11px]" role="group" aria-label={tr('repos.unknownHostAria')}>
            <p className="flex items-start gap-1.5 text-[var(--text-secondary)]">
              <Server size={12} className="mt-px shrink-0 text-[var(--text-hint)]" aria-hidden />
              <span>{tr('repos.unknownHost', { host: unknownHost })}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={SECONDARY_CLS} onClick={() => void allowHost('gitlab')}>{tr('server.kind.gitlab')}</button>
              <button type="button" className={SECONDARY_CLS} onClick={() => void allowHost('gitea')}>{tr('server.kind.gitea')}</button>
              <button type="button" className={SECONDARY_CLS} onClick={() => setUnknownHost(null)}>{tr('cancel')}</button>
            </div>
          </div>
        )}
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {repos.length === 0 ? (
          <p className="p-3 text-xs text-[var(--text-hint)]">{tr('repos.empty')}</p>
        ) : (
          <ul role="listbox" aria-label={tr('repos.listLabel')}>
            {repos.map((r) => {
              const c = catalogs[r.id];
              const updates = c?.catalog ? catalogEntries(r, c.catalog.bundle.skills, installed).filter((e) => e.status === 'update').length : 0;
              return (
                <li key={r.id} className="group mx-1.5 flex items-center">
                  <div
                    role="option"
                    tabIndex={0}
                    aria-selected={selectedRepoId === r.id}
                    onClick={() => {
                      selectRepo(r.id);
                      if (!c) void fetchCatalog(r);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectRepo(r.id);
                        if (!c) void fetchCatalog(r);
                      }
                    }}
                    className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs ${FOCUS_RING} ${
                      selectedRepoId === r.id ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <GitBranch size={12} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono" title={repoLabel(r)}>{repoLabel(r)}</span>
                    {c?.loading && <RefreshCw size={11} className="shrink-0 animate-spin text-[var(--text-hint)]" aria-hidden />}
                    {updates > 0 && <span className={CHIP}>{tr('repos.updatesN', { n: updates })}</span>}
                  </div>
                  <button type="button" onClick={() => remove(r)} className={`${ICON_BTN} opacity-0 focus:opacity-100 group-hover:opacity-100`} aria-label={tr('repos.removeAria', { repo: repoLabel(r) })}>
                    <Trash2 size={12} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {repos.length > 0 && (
        <div className="border-t border-[var(--border)] p-3">
          <button type="button" className={`${SECONDARY_CLS} w-full justify-center`} disabled={checkingAll} onClick={() => void checkAll()}>
            <RefreshCw size={13} className={checkingAll ? 'animate-spin' : ''} aria-hidden />
            {tr('repos.checkAll')}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusChip({ entry, tr }: { entry: CatalogEntry; tr: Tr }) {
  const cls =
    entry.status === 'update' ? 'bg-indigo-500/15 text-indigo-300' : entry.status === 'installed' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]';
  return (
    <span className="flex flex-wrap gap-1">
      <span className={`rounded-full px-2 py-0.5 text-[10px] ${cls}`}>{tr(`repos.status.${entry.status}`)}</span>
      {entry.modified && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">{tr('repos.modified')}</span>}
    </span>
  );
}

/** "Ver cambios" (SK22): archivo por archivo, con el diff del texto. */
function ChangesModal({ changes, title, tr, onClose }: { changes: FileChange[]; title: string; tr: Tr; onClose: () => void }) {
  const changed = changes.filter((c) => c.kind !== 'same');
  return (
    <SkillModal wide title={title} onClose={onClose} footer={<button type="button" className={SECONDARY_CLS} onClick={onClose}>{tr('close')}</button>}>
      {changed.length === 0 ? (
        <p className="text-xs text-[var(--text-hint)]">{tr('changes.none')}</p>
      ) : (
        <div className="space-y-3">
          {changed.map((c) => (
            <section key={c.rel} className="rounded-lg border border-[var(--border-card)]">
              <header className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 text-xs">
                <span className="font-mono text-[var(--text-primary)]">{c.rel}</span>
                <span className={CHIP}>{tr(`changes.${c.kind}`)}</span>
              </header>
              {c.before === null && c.after === null ? (
                <p className="px-3 py-2 text-[11px] text-[var(--text-hint)]">{tr('changes.noText')}</p>
              ) : (
                <pre className="max-h-[40vh] overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
                  {lineDiff(c.before ?? '', c.after ?? '').map((l, i) => (
                    <div
                      key={i}
                      className={l.kind === 'added' ? 'bg-emerald-500/10 text-emerald-300' : l.kind === 'removed' ? 'bg-red-500/10 text-red-300' : 'text-[var(--text-secondary)]'}
                    >
                      {l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '- ' : '  '}
                      {l.text}
                    </div>
                  ))}
                </pre>
              )}
            </section>
          ))}
        </div>
      )}
    </SkillModal>
  );
}

/** El catálogo del repo elegido. */
export function RepoDetail({ tr, language, taken, onInstalled }: { tr: Tr; language: Language; taken: Record<Tool, Set<string>>; onInstalled: (refs: SkillRef[]) => void }) {
  const { repos } = useLinkedRepos();
  const { items, catalogs, installed, selectedRepoId, fetchCatalog, loadInstalled } = useAgentSkills(
    useShallow((s) => ({ items: s.items, catalogs: s.catalogs, installed: s.installed, selectedRepoId: s.selectedRepoId, fetchCatalog: s.fetchCatalog, loadInstalled: s.loadInstalled })),
  );
  const repo = repos.find((r) => r.id === selectedRepoId) ?? null;
  const state = repo ? catalogs[repo.id] : undefined;
  const [preset, setPreset] = useState<ImportPreset[] | null>(null);
  const [changes, setChanges] = useState<{ title: string; list: FileChange[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!repo) {
    return <div className="flex h-full items-center justify-center p-8 text-center text-xs text-[var(--text-hint)]">{tr('repos.pickOne')}</div>;
  }
  const catalog = state?.catalog ?? null;
  const entries = catalog ? catalogEntries(repo, catalog.bundle.skills, installed) : [];

  const showChanges = async (e: CatalogEntry) => {
    if (!catalog || !e.installed) return;
    setError(null);
    try {
      const list = await compareStaged(catalog.bundle.id, e.skill.rel, e.installed);
      setChanges({ title: tr('changes.title', { name: e.installed.name }), list });
    } catch (err) {
      setError(errorCode(err));
    }
  };

  return (
    <section aria-labelledby="agent-skills-repo-title" className="space-y-4 px-5 py-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="agent-skills-repo-title" className="font-mono text-base font-semibold text-[var(--text-primary)]">{repoLabel(repo)}</h2>
          <button
            type="button"
            className={ICON_BTN}
            aria-label={tr('repos.openInBrowser')}
            title={tr('repos.openInBrowser')}
            onClick={() => void fs.openUrl(repoWebUrl(repo)).catch(() => undefined)}
          >
            <ExternalLink size={13} aria-hidden />
          </button>
          <button type="button" className={`${SECONDARY_CLS} ml-auto`} disabled={state?.loading} onClick={() => void fetchCatalog(repo)}>
            <RefreshCw size={13} className={state?.loading ? 'animate-spin' : ''} aria-hidden />
            {tr('repos.check')}
          </button>
        </div>
        {catalog && (
          <p className="text-xs text-[var(--text-hint)]">
            {tr('repos.commit', { ref: catalog.gitRef, sha: catalog.sha.slice(0, 7) })}
            {state?.checkedAt ? ` · ${tr('repos.checkedAt', { date: dateTime(state.checkedAt, language) })}` : ''}
          </p>
        )}
      </header>

      {state?.error && <p className="text-xs text-red-400" role="alert">{trCode(tr, 'err', state.error, 'err.unknown')}</p>}
      {error && <p className="text-xs text-red-400" role="alert">{trCode(tr, 'err', error, 'err.unknown')}</p>}
      {catalog?.isPluginRepo && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-[var(--text-primary)]">
          <TriangleAlert size={14} className="mt-px shrink-0 text-amber-400" aria-hidden />
          <span>{tr('repos.pluginWarning', { repo: !repo.host || repo.host === GITHUB_HOST ? `${repo.owner}/${repo.repo}` : `${repoWebUrl(repo)}.git` })}</span>
        </p>
      )}

      {!catalog ? (
        state?.loading ? <Spinner /> : !state?.error && <p className="text-xs text-[var(--text-hint)]">{tr('repos.notLoaded')}</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-[var(--text-hint)]">{tr('repos.noSkills')}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border-card)]" aria-label={tr('repos.catalogLabel')}>
          {entries.map((e) => (
            <li key={e.skill.rel} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[var(--text-primary)]">{e.installed?.name ?? e.skill.dirName}</p>
                <p className="truncate font-mono text-[11px] text-[var(--text-hint)]">{e.skill.rel}</p>
              </div>
              <StatusChip entry={e} tr={tr} />
              {e.status === 'update' && e.installed && (
                <button type="button" className={SECONDARY_CLS} onClick={() => void showChanges(e)}>
                  <Diff size={13} aria-hidden />
                  {tr('repos.viewChanges')}
                </button>
              )}
              {e.status !== 'installed' && (
                <button
                  type="button"
                  className={SECONDARY_CLS}
                  disabled={!e.skill.hash || e.skill.tooLarge}
                  onClick={() => {
                    // Actualizar: mismo nombre y mismas herramientas que la instalada.
                    const current = e.installed ? items.find((it) => it.key === `${e.installed?.source}:${e.installed?.id}`) : undefined;
                    setPreset([
                      e.installed
                        ? { rel: e.skill.rel, name: e.installed.name, replace: true, tools: current?.entry.tools }
                        : { rel: e.skill.rel, replace: false },
                    ]);
                  }}
                >
                  <Download size={13} aria-hidden />
                  {tr(e.status === 'update' ? 'repos.update' : 'repos.install')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {preset && catalog && (
        <ImportPreview
          bundle={catalog.bundle}
          preset={preset}
          keepStaged
          taken={taken}
          tr={tr}
          language={language}
          onClose={(refs) => {
            setPreset(null);
            if (refs) {
              void loadInstalled();
              onInstalled(refs);
            }
          }}
        />
      )}
      {changes && <ChangesModal changes={changes.list} title={changes.title} tr={tr} onClose={() => setChanges(null)} />}
    </section>
  );
}
