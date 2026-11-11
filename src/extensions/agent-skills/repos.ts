// Repos vinculados (specs/skills-de-agentes, fase 3): leer lo que escribe
// el usuario, guardarlos en la configuración local y el estado de cada
// skill del catálogo. GitHub, GitLab y Gitea/Forgejo, en github.com,
// gitlab.com o un servidor propio (SK19, SK36). Puro y probado.
import type { InstalledInfo, RepoRef, ServerInfo, ServerKind, SourceId, StagedSkill } from './api';

export interface LinkedRepo extends RepoRef {
  id: string;
}

export const GITHUB_HOST = 'github.com';

/** Los de serie, para cuando todavía no se leyó la lista de Rust. */
export const BUILTIN_SERVERS: ServerInfo[] = [
  { host: 'github.com', kind: 'github', builtin: true, tokenKey: 'github_token' },
  { host: 'gitlab.com', kind: 'gitlab', builtin: true, tokenKey: 'gitlab_token' },
];

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const REF = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]{1,200}(?<!\/)$/;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
/** Grupos y subgrupos de GitLab delante del repo. */
const MAX_NAMESPACE = 20;

/** El host en minúsculas, sin `https://` ni `/`, con puerto opcional;
 *  `null` si no es un host completo (igual que `servers::normalize_host`). */
export function normalizeHost(raw: string): string | null {
  let h = raw.trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/+$/, '');
  if (!h || h.length > 253) return null;
  let port: string | null = null;
  const m = /^(.*):(\d{1,5})$/.exec(h);
  if (m) {
    [, h, port] = m;
    const n = Number(port);
    if (port.startsWith('0') || n < 1 || n > 65535) return null;
  }
  h = h.replace(/\.+$/, '');
  const labels = h.split('.');
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  return port ? `${h}:${port}` : h;
}

const isGithub = (r: RepoRef) => !r.host || r.host === GITHUB_HOST;

/** Valida nombres, rama y carpeta. Solo GitLab admite grupos en `owner`;
 *  sin saber el tipo (al leer lo guardado), se admiten fuera de GitHub. */
function validRef(r: RepoRef, kind: ServerKind | null): boolean {
  const owner = r.owner.split('/');
  const max = isGithub(r) || kind === 'gitea' ? 1 : MAX_NAMESPACE;
  if (owner.length > max || ![...owner, r.repo].every((n) => NAME.test(n) && n !== '.' && n !== '..')) return false;
  if (r.gitRef && !REF.test(r.gitRef)) return false;
  if (r.path && r.path.split('/').some((p) => !p || p === '.' || p === '..')) return false;
  return true;
}

function clean(owner: string, repo: string, gitRef: string | null, path: string | null, host: string | null): RepoRef {
  if (repo.endsWith('.git')) repo = repo.slice(0, -4);
  path = path ? path.replace(/^\/+|\/+$/g, '') || null : null;
  return { host: host === GITHUB_HOST ? null : host, owner, repo, gitRef: gitRef || null, path };
}

export type ParsedRepo = { ok: true; repo: RepoRef } | { ok: false; reason: 'invalid' } | { ok: false; reason: 'unknownHost'; host: string };

/** Lo que escribe el usuario:
 *  - `owner/repo`, `owner/repo@rama` u `owner/repo@rama:sub/carpeta` (GitHub);
 *  - la URL del repo en un servidor de `servers` (con o sin `https://`), con
 *    rama y carpeta como las pone cada uno: `/tree/<rama>/<carpeta>` en
 *    GitHub, `/-/tree/…` en GitLab y `/src/branch/…` en Gitea. Todo lo que
 *    sigue a la rama se toma como carpeta: una rama con `/` se escribe con
 *    `@` al final de la URL (`…/repo@rama/x:carpeta`).
 *  Si es una URL de un host que no está en `servers`, lo dice. */
export function parseRepo(raw: string, servers: ServerInfo[] = BUILTIN_SERVERS): ParsedRepo {
  const invalid = { ok: false, reason: 'invalid' } as const;
  let text = raw.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  if (!text || /\s/.test(text) || /^http:\/\//i.test(text)) return invalid;
  // `@rama` y `:carpeta` al final, en cualquier forma.
  let gitRef: string | null = null;
  let path: string | null = null;
  const tail = /@([^@\s:]+)(?::([^\s:]+))?$|:([^\s:@/][^\s:@]*)$/.exec(text.replace(/^https:\/\//i, ''));
  if (tail && !/^\d{1,5}(\/|$)/.test(tail[3] ?? 'x')) {
    gitRef = tail[1] ?? null;
    path = tail[2] ?? tail[3] ?? null;
    text = text.slice(0, text.length - tail[0].length);
  }
  const bare = text.replace(/^https:\/\//i, '');
  const segs = bare.split('/');
  const looksLikeUrl = /^https:\/\//i.test(text) || segs[0].includes('.') || segs[0].includes(':');
  let ref: RepoRef;
  let kind: ServerKind;
  if (!looksLikeUrl) {
    if (segs.length !== 2) return invalid;
    kind = 'github';
    ref = clean(segs[0], segs[1], gitRef, path, null);
  } else {
    const host = normalizeHost(segs[0].replace(/^www\.github\.com$/i, 'github.com'));
    if (!host) return invalid;
    const server = servers.find((s) => s.host === host);
    if (!server) return { ok: false, reason: 'unknownHost', host };
    kind = server.kind;
    const rest = segs.slice(1);
    let project: string[] = rest;
    let refFromUrl: string | null = null;
    let pathFromUrl: string[] = [];
    const at = (marker: string[]) => {
      for (let i = 0; i + marker.length <= rest.length; i++) {
        if (marker.every((m, j) => rest[i + j] === m)) return i;
      }
      return -1;
    };
    if (kind === 'github') {
      const i = at(['tree']);
      if (i === 2 || i === -1) {
        project = rest.slice(0, i === -1 ? rest.length : 2);
        if (i === 2) {
          refFromUrl = rest[3] ?? null;
          pathFromUrl = rest.slice(4);
        }
      }
    } else if (kind === 'gitlab') {
      const i = at(['-']);
      if (i !== -1) {
        project = rest.slice(0, i);
        if (rest[i + 1] === 'tree' || rest[i + 1] === 'blob') {
          refFromUrl = rest[i + 2] ?? null;
          pathFromUrl = rest.slice(i + 3);
        }
      }
    } else {
      const i = at(['src']);
      if (i === 2) {
        project = rest.slice(0, 2);
        if (['branch', 'tag', 'commit'].includes(rest[3])) {
          refFromUrl = rest[4] ?? null;
          pathFromUrl = rest.slice(5);
        }
      }
    }
    if (project.length < 2) return invalid;
    ref = clean(project.slice(0, -1).join('/'), project[project.length - 1], gitRef ?? refFromUrl, path ?? (pathFromUrl.join('/') || null), host);
  }
  return validRef(ref, kind) ? { ok: true, repo: ref } : invalid;
}

/** `parseRepo` cuando solo importa si vale. */
export function parseRepoInput(raw: string, servers: ServerInfo[] = BUILTIN_SERVERS): RepoRef | null {
  const p = parseRepo(raw, servers);
  return p.ok ? p.repo : null;
}

/** La misma clave que `RepoRef::key` en Rust: `owner/repo` en GitHub y
 *  `host/owner/repo` en los demás. */
export const repoKey = (r: RepoRef) => (isGithub(r) ? `${r.owner}/${r.repo}` : `${r.host}/${r.owner}/${r.repo}`);

/** La página del repo en el navegador. */
export const repoWebUrl = (r: RepoRef) => `https://${r.host || GITHUB_HOST}/${r.owner}/${r.repo}`;

/** Cómo se muestra: la clave, con `@rama` y la carpeta si los tiene. */
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
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
    const host = str(o.host) ? normalizeHost(str(o.host)!) : null;
    if (str(o.host) && !host) continue;
    const ref = clean(o.owner, o.repo, str(o.gitRef), str(o.path), host);
    if (validRef(ref, null)) out.push({ id: o.id, ...ref });
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
