// Repos de GitHub vinculados (specs/skills-de-agentes, fase 3): leer lo
// que escribe el usuario, guardarlos en la configuración local y el estado
// de cada skill del catálogo. Puro y probado.
import type { InstalledInfo, RepoRef, SourceId, StagedSkill } from './api';

export interface LinkedRepo extends RepoRef {
  id: string;
}

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const REF = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]{1,200}(?<!\/)$/;

/** `owner/repo`, `owner/repo@rama`, `owner/repo@rama:sub/carpeta` o una
 *  URL de github.com (también con `/tree/<rama>/<carpeta>`). `null` si no
 *  vale. En una URL con `/tree/`, todo lo que sigue a la rama se toma como
 *  carpeta: una rama con `/` se escribe con `@`. */
export function parseRepoInput(raw: string): RepoRef | null {
  const text = raw.trim().replace(/\.git$/, '');
  if (!text) return null;
  let owner: string;
  let repo: string;
  let gitRef: string | null;
  let path: string | null;
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/tree\/([^/\s]+)(?:\/([^\s#?]+))?)?\/?$/i.exec(text);
  if (url) {
    [, owner, repo] = url;
    gitRef = url[3] ?? null;
    path = url[4] ?? null;
  } else {
    const short = /^([^/\s@:]+)\/([^/\s@:]+)(?:@([^\s:]+))?(?::(\S+))?$/.exec(text);
    if (!short) return null;
    [, owner, repo] = short;
    gitRef = short[3] ?? null;
    path = short[4] ?? null;
  }
  if (repo.endsWith('.git')) repo = repo.slice(0, -4);
  path = path ? path.replace(/^\/+|\/+$/g, '') || null : null;
  if (!NAME.test(owner) || !NAME.test(repo) || owner === '.' || owner === '..' || repo === '.' || repo === '..') return null;
  if (gitRef && !REF.test(gitRef)) return null;
  if (path && path.split('/').some((p) => !p || p === '.' || p === '..')) return null;
  return { owner, repo, gitRef, path };
}

export const repoKey = (r: RepoRef) => `${r.owner}/${r.repo}`;

/** Cómo se muestra: `owner/repo`, con `@rama` y `/carpeta` si los tiene. */
export function repoLabel(r: RepoRef): string {
  return `${repoKey(r)}${r.gitRef ? `@${r.gitRef}` : ''}${r.path ? ` · ${r.path}` : ''}`;
}

export function sameRepo(a: RepoRef, b: RepoRef): boolean {
  return repoKey(a).toLowerCase() === repoKey(b).toLowerCase() && (a.gitRef ?? null) === (b.gitRef ?? null) && (a.path ?? null) === (b.path ?? null);
}

/** Los repos guardados en `settings.repos`, ya validados. */
export function readRepos(raw: unknown): LinkedRepo[] {
  if (!Array.isArray(raw)) return [];
  const out: LinkedRepo[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.owner !== 'string' || typeof o.repo !== 'string') continue;
    const ref = parseRepoInput(`${o.owner}/${o.repo}${typeof o.gitRef === 'string' && o.gitRef ? `@${o.gitRef}` : ''}${typeof o.path === 'string' && o.path ? `:${o.path}` : ''}`);
    if (ref) out.push({ id: o.id, ...ref });
  }
  return out;
}

export type CatalogStatus = 'new' | 'installed' | 'update';

export interface CatalogEntry {
  skill: StagedSkill;
  status: CatalogStatus;
  /** Se cambió a mano desde que se instaló (SK22). */
  modified: boolean;
  /** Dónde está instalada, si lo está. */
  installed: { source: SourceId; id: string; name: string } | null;
}

/** El estado de cada skill del catálogo, comparando con lo registrado al
 *  instalar desde este repo (por repo y ruta, no por nombre). */
export function catalogEntries(repo: RepoRef, skills: StagedSkill[], installed: InstalledInfo[]): CatalogEntry[] {
  const key = repoKey(repo).toLowerCase();
  return skills.map((skill) => {
    const rec = installed.find((i) => i.repo.toLowerCase() === key && i.rel === skill.rel);
    if (!rec) return { skill, status: 'new', modified: false, installed: null };
    const [source, ...rest] = rec.key.split(':');
    const id = rest.join(':');
    return {
      skill,
      status: skill.hash && skill.hash !== rec.hash ? 'update' : 'installed',
      modified: rec.currentHash !== null && rec.currentHash !== rec.hash,
      installed: { source: source as SourceId, id, name: id.split('/').pop() ?? id },
    };
  });
}
