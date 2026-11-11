import { describe, expect, it } from 'vitest';
import type { InstalledInfo, ServerInfo, StagedSkill } from './api';
import { BUILTIN_SERVERS, catalogEntries, normalizeHost, parseRepo, parseRepoInput, readRepos, repoKey, repoLabel, repoWebUrl, sameRepo } from './repos';
import { agentSkillsSecretKeys } from './secretKeys';

const flags = { scripts: false, binaries: false, symlinks: false, executables: false, truncated: false };
const staged = (rel: string, hash: string | null): StagedSkill => ({ rel, dirName: rel.split('/').pop() ?? rel, skillMd: null, files: [], fileFlags: flags, sizeBytes: 1, hash, tooLarge: false });

describe('repos vinculados', () => {
  it('lee owner/repo, rama, carpeta y URLs', () => {
    expect(parseRepoInput('anthropics/skills')).toEqual({ host: null, owner: 'anthropics', repo: 'skills', gitRef: null, path: null });
    expect(parseRepoInput(' openai/skills@main:skills/.curated ')).toEqual({ host: null, owner: 'openai', repo: 'skills', gitRef: 'main', path: 'skills/.curated' });
    expect(parseRepoInput('https://github.com/openai/skills/tree/main/skills/.curated')).toEqual({ host: null, owner: 'openai', repo: 'skills', gitRef: 'main', path: 'skills/.curated' });
    expect(parseRepoInput('github.com/o/r.git')).toEqual({ host: null, owner: 'o', repo: 'r', gitRef: null, path: null });
    expect(parseRepoInput('o/r@feature/x')).toEqual({ host: null, owner: 'o', repo: 'r', gitRef: 'feature/x', path: null });
  });

  it('rechaza lo que no es un repo o trae trampas', () => {
    for (const bad of ['', 'skills', 'a/b/c', 'http://gitlab.com/o/r', 'https://github.com/a/b/c/d', 'o/r@../x', 'o/r:../x', 'o/..', 'o r/x', 'o/r@a;rm', 'git@gitlab.com:g/r.git']) {
      expect(parseRepoInput(bad), bad).toBeNull();
    }
  });

  it('etiqueta y comparación', () => {
    const a = parseRepoInput('O/R@main:skills')!;
    expect(repoLabel(a)).toBe('O/R@main · skills');
    expect(sameRepo(a, parseRepoInput('o/r@main:skills')!)).toBe(true);
    expect(sameRepo(a, parseRepoInput('o/r')!)).toBe(false);
  });

  it('lee los repos guardados y descarta lo inválido', () => {
    expect(readRepos([{ id: 'r1', owner: 'o', repo: 'r', gitRef: 'main', path: 'skills' }, { id: 'r2', owner: '..', repo: 'x' }, 'basura', null])).toEqual([
      { id: 'r1', host: null, owner: 'o', repo: 'r', gitRef: 'main', path: 'skills' },
    ]);
    expect(readRepos([{ id: 'g', host: 'GitLab.com', owner: 'grupo/sub', repo: 'r' }, { id: 'x', host: 'no es host', owner: 'o', repo: 'r' }, { id: 'h', host: 'github.com', owner: 'a/b', repo: 'r' }])).toEqual([
      { id: 'g', host: 'gitlab.com', owner: 'grupo/sub', repo: 'r', gitRef: null, path: null },
    ]);
    expect(readRepos(undefined)).toEqual([]);
  });

  it('estado del catálogo: nueva, instalada, actualización y modificada', () => {
    const repo = parseRepoInput('o/r')!;
    const rec = (rel: string, hash: string, currentHash: string | null): InstalledInfo => ({ key: `claude:${rel.split('/').pop()}`, repo: 'O/R', rel, sha: 'a'.repeat(40), hash, installedAt: 1, currentHash });
    const entries = catalogEntries(repo, [staged('skills/a', 'h1'), staged('skills/b', 'h2'), staged('skills/c', 'h3'), staged('skills/d', 'h4')], [
      rec('skills/a', 'h1', 'h1'),
      rec('skills/b', 'viejo', 'viejo'),
      rec('skills/c', 'h3', 'tocada'),
      { ...rec('skills/d', 'h4', 'h4'), repo: 'otro/repo' },
    ]);
    expect(entries.map((e) => [e.status, e.modified])).toEqual([
      ['installed', false],
      ['update', false],
      ['installed', true],
      ['new', false],
    ]);
    expect(entries[1].installed).toEqual({ source: 'claude', id: 'b', name: 'b' });
  });

  const servers: ServerInfo[] = [
    ...BUILTIN_SERVERS,
    { host: 'git.empresa.co:8443', kind: 'gitlab', builtin: false, tokenKey: 'token-000000000000' },
    { host: 'codeberg.org', kind: 'gitea', builtin: false, tokenKey: 'token-111111111111' },
  ];

  it('lee URLs de GitLab, con grupos, rama y carpeta', () => {
    expect(parseRepoInput('https://gitlab.com/grupo/sub/skills', servers)).toEqual({ host: 'gitlab.com', owner: 'grupo/sub', repo: 'skills', gitRef: null, path: null });
    expect(parseRepoInput('gitlab.com/g/r/-/tree/main/skills/.curated', servers)).toEqual({ host: 'gitlab.com', owner: 'g', repo: 'r', gitRef: 'main', path: 'skills/.curated' });
    expect(parseRepoInput('https://git.empresa.co:8443/dsi/r.git', servers)).toEqual({ host: 'git.empresa.co:8443', owner: 'dsi', repo: 'r', gitRef: null, path: null });
    expect(parseRepoInput('https://git.empresa.co:8443/dsi/r@feature/x:skills', servers)).toEqual({ host: 'git.empresa.co:8443', owner: 'dsi', repo: 'r', gitRef: 'feature/x', path: 'skills' });
    expect(parseRepoInput('https://gitlab.com/solo', servers)).toBeNull();
  });

  it('lee URLs de Gitea o Forgejo', () => {
    expect(parseRepoInput('https://codeberg.org/o/r/src/branch/main/skills', servers)).toEqual({ host: 'codeberg.org', owner: 'o', repo: 'r', gitRef: 'main', path: 'skills' });
    expect(parseRepoInput('codeberg.org/o/r', servers)).toEqual({ host: 'codeberg.org', owner: 'o', repo: 'r', gitRef: null, path: null });
    // Gitea no tiene grupos.
    expect(parseRepoInput('codeberg.org/o/sub/r', servers)).toBeNull();
  });

  it('avisa de un host que no está en la lista', () => {
    expect(parseRepo('https://git.casa.lan:3000/o/r', servers)).toEqual({ ok: false, reason: 'unknownHost', host: 'git.casa.lan:3000' });
    expect(parseRepo('https://GIT.casa.lan/o/r')).toEqual({ ok: false, reason: 'unknownHost', host: 'git.casa.lan' });
    expect(parseRepo('o/r').ok).toBe(true);
  });

  it('normaliza hosts como Rust', () => {
    expect(normalizeHost(' https://GitLab.Empresa.co/ ')).toBe('gitlab.empresa.co');
    expect(normalizeHost('100.64.0.7:8443')).toBe('100.64.0.7:8443');
    for (const bad of ['', 'gitlab', 'localhost', 'http://x.co', 'x.co/ruta', 'u@x.co', 'x.co:0', 'x.co:70000', 'x.co:08', '-a.co', 'a..co']) {
      expect(normalizeHost(bad), bad).toBeNull();
    }
  });

  it('clave, etiqueta y página por servidor', () => {
    const gl = parseRepoInput('https://git.empresa.co:8443/g/sub/r@v2', servers)!;
    expect(repoKey(gl)).toBe('git.empresa.co:8443/g/sub/r');
    expect(repoLabel(gl)).toBe('git.empresa.co:8443/g/sub/r@v2');
    expect(repoWebUrl(gl)).toBe('https://git.empresa.co:8443/g/sub/r');
    expect(repoWebUrl(parseRepoInput('o/r')!)).toBe('https://github.com/o/r');
    expect(sameRepo(gl, parseRepoInput('git.empresa.co:8443/g/sub/r@v2', servers)!)).toBe(true);
    expect(sameRepo(parseRepoInput('gitlab.com/o/r', servers)!, parseRepoInput('o/r')!)).toBe(false);
  });

  it('claves de tokens para "Quitar configuración"', () => {
    expect(agentSkillsSecretKeys({ tokenKeys: ['token-0123456789ab', 'token-0123456789ab', 'github_token', 'token-XYZ', 3] })).toEqual(['token-0123456789ab']);
    expect(agentSkillsSecretKeys(undefined)).toEqual([]);
  });
});
