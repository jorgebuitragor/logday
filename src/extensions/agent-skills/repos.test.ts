import { describe, expect, it } from 'vitest';
import type { InstalledInfo, StagedSkill } from './api';
import { catalogEntries, parseRepoInput, readRepos, repoLabel, sameRepo } from './repos';

const flags = { scripts: false, binaries: false, symlinks: false, executables: false, truncated: false };
const staged = (rel: string, hash: string | null): StagedSkill => ({ rel, dirName: rel.split('/').pop() ?? rel, skillMd: null, files: [], fileFlags: flags, sizeBytes: 1, hash, tooLarge: false });

describe('repos de GitHub', () => {
  it('lee owner/repo, rama, carpeta y URLs', () => {
    expect(parseRepoInput('anthropics/skills')).toEqual({ owner: 'anthropics', repo: 'skills', gitRef: null, path: null });
    expect(parseRepoInput(' openai/skills@main:skills/.curated ')).toEqual({ owner: 'openai', repo: 'skills', gitRef: 'main', path: 'skills/.curated' });
    expect(parseRepoInput('https://github.com/openai/skills/tree/main/skills/.curated')).toEqual({ owner: 'openai', repo: 'skills', gitRef: 'main', path: 'skills/.curated' });
    expect(parseRepoInput('github.com/o/r.git')).toEqual({ owner: 'o', repo: 'r', gitRef: null, path: null });
    expect(parseRepoInput('o/r@feature/x')).toEqual({ owner: 'o', repo: 'r', gitRef: 'feature/x', path: null });
  });

  it('rechaza lo que no es un repo o trae trampas', () => {
    for (const bad of ['', 'skills', 'a/b/c', 'https://gitlab.com/o/r', 'o/r@../x', 'o/r:../x', 'o/..', 'o r/x', 'o/r@a;rm']) {
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
      { id: 'r1', owner: 'o', repo: 'r', gitRef: 'main', path: 'skills' },
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
});
