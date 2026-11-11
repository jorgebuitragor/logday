import { describe, expect, it } from 'vitest';
import { filterItems, formatSize, groupItems, readSettings, toItem, missingFiles, computeWarnings } from './model';
import { entry } from './testData';

const all = { query: '', tool: 'all' as const, showPlugins: true, showSystem: true };

describe('lista de skills', () => {
  it('nombre y descripción del frontmatter, o la carpeta si no hay', () => {
    expect(toItem(entry({ dirName: 'pdf' })).name).toBe('pdf');
    const sin = toItem(entry({ dirName: 'x', skillMd: '# sin frontmatter' }));
    expect(sin.name).toBe('x');
    expect(sin.warnings).toEqual(['invalid-frontmatter']);
    expect(sin.risky).toBe(false);
  });

  it('avisos de archivos y de riesgo, en orden', () => {
    const it = toItem(entry({
      dirName: 'x',
      skillMd: '---\nname: x\ndescription: d\nallowed-tools: Bash\n---\n',
      fileFlags: { scripts: true, binaries: false, symlinks: true, executables: false, truncated: false },
    }));
    expect(it.warnings).toEqual(['allowed-tools', 'scripts', 'symlinks']);
    expect(it.risky).toBe(true);
  });

  it('enlace externo o roto, sin leer nada', () => {
    const ext = toItem(entry({ dirName: 'e', origin: 'external', skillMd: null }));
    expect(ext.warnings).toEqual(['external']);
    expect(ext.group).toBe('own');
    const primary = { source: 'codex' as const, id: 'r', path: '~/.codex/skills/r', isLink: true, linkTarget: '/nada', broken: true, tool: 'codex' as const };
    expect(toItem(entry({ dirName: 'r', origin: 'external', skillMd: null, primary })).warnings).toEqual(['broken']);
  });

  it('busca sin tildes y filtra por herramienta y grupos', () => {
    const items = [
      toItem(entry({ dirName: 'logday', skillMd: '---\nname: logday\ndescription: Orquesta el ecosistema\n---\n' })),
      toItem(entry({ dirName: 'pdf', tools: ['codex'], origin: 'plugin' })),
      toItem(entry({ dirName: 'docx', origin: 'synced' })),
    ];
    expect(filterItems(items, { ...all, query: 'ECOSISTÉMA' }).map((i) => i.name)).toEqual(['logday']);
    expect(filterItems(items, { ...all, query: 'nada' }).map((i) => i.name)).toEqual([]);
    expect(filterItems(items, { ...all, query: 'orquésta' }).map((i) => i.name)).toEqual(['logday']);
    expect(filterItems(items, { ...all, tool: 'codex' }).map((i) => i.name)).toEqual(['pdf']);
    expect(filterItems(items, { ...all, showPlugins: false, showSystem: false }).map((i) => i.name)).toEqual(['logday']);
  });

  it('agrupa en orden y ordena por nombre', () => {
    const items = ['zeta', 'alfa'].map((d) => toItem(entry({ dirName: d })));
    items.push(toItem(entry({ dirName: 'des', origin: 'disabled' })));
    const groups = groupItems(items, 'es-CO');
    expect(groups.map((g) => g.group)).toEqual(['own', 'disabled']);
    expect(groups[0].items.map((i) => i.name)).toEqual(['alfa', 'zeta']);
  });

  it('preferencias con valores por defecto', () => {
    expect(readSettings(undefined)).toEqual({ toolFilter: 'all', showPlugins: true, showSystem: true, collapsed: [] });
    expect(readSettings({ toolFilter: 'codex', showPlugins: false, collapsed: ['plugin', 'raro'] })).toEqual({
      toolFilter: 'codex', showPlugins: false, showSystem: true, collapsed: ['plugin'],
    });
  });

  it('tamaños', () => {
    expect(formatSize(512, 'es-CO')).toBe('512 B');
    expect(formatSize(1536, 'es-CO')).toBe('1,5 KB');
    expect(formatSize(3 * 1024 * 1024, 'en-US')).toBe('3 MB');
  });
});

describe('archivos que menciona el SKILL.md y no vienen', () => {
  const body = 'Corre `scripts/run.py` y lee references/guia.md. Usa assets/.';
  it('avisa de los que faltan', () => {
    expect(missingFiles(body, ['SKILL.md'])).toEqual(['scripts/run.py', 'references/guia.md']);
    expect(missingFiles(body, ['SKILL.md', 'scripts/run.py', 'references/guia.md'])).toEqual([]);
    // Una carpeta mencionada cuenta si viene algo dentro.
    expect(missingFiles('Mira references/api', ['references/api/a.md'])).toEqual([]);
  });

  it('solo al importar: sin la lista de archivos no se mira', () => {
    const parsed = { frontmatter: {}, name: 's', description: 'd', body, hasFrontmatter: true, yamlError: null };
    const flags = { scripts: false, binaries: false, symlinks: false, executables: false, truncated: false };
    expect(computeWarnings({ parsed, dirName: 's', fileFlags: flags }).warnings).not.toContain('missing-files');
    expect(computeWarnings({ parsed, dirName: 's', fileFlags: flags, files: ['SKILL.md'] }).warnings).toContain('missing-files');
  });
});

