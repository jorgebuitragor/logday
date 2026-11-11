// Fase 2: lo puro de crear, importar y borrar.
import { describe, expect, it, vi } from 'vitest';
import type { StagedBundle } from './api';
import { suggestName, takenNames, toItem } from './model';
import { parseSkillMd } from './skillMd';
import { skillTemplate } from './template';
import { checkNewSkill } from './NewSkillModal';
import { initialRows, rowProblem } from './ImportPreview';
import { trashChoices } from './DeleteSkillModal';
import { shareTarget } from './View';
import { entry } from './testData';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../store/appStore', () => ({ useAppStore: () => undefined }));

const flags = { scripts: false, binaries: false, symlinks: false, executables: false, truncated: false };
const linkTo = (source: 'agents' | 'codex', id: string) => ({ source, id, path: `~/.${source}/skills/${id}`, isLink: true, linkTarget: `~/.claude/skills/${id}`, broken: false, tool: 'codex' as const });

describe('crear', () => {
  const taken = takenNames([
    toItem(entry({ dirName: 'logday' })),
    toItem(entry({ dirName: 'des', origin: 'disabled', primary: { source: 'disabled', id: 'agents/des', path: '', isLink: false, linkTarget: null, broken: false, tool: 'codex' } })),
  ]);

  it('nombres ocupados por herramienta, desactivadas incluidas', () => {
    expect([...taken.claude]).toEqual(['logday']);
    expect([...taken.codex]).toEqual(['des']);
  });

  it('valida nombre, descripción y herramientas', () => {
    expect(checkNewSkill('', '', [], taken)).toEqual({ name: 'new.nameRequired', description: 'new.descriptionRequired', tools: 'new.toolsRequired' });
    expect(checkNewSkill('Mal_Nombre', 'd', ['claude'], taken).name).toBe('new.nameInvalid');
    expect(checkNewSkill('logday', 'd', ['claude'], taken).name).toBe('new.nameTaken');
    expect(checkNewSkill('logday', 'd', ['codex'], taken).name).toBeNull();
    expect(checkNewSkill('des', 'd', ['codex'], taken).name).toBe('new.nameTaken');
    expect(checkNewSkill('ok', 'x'.repeat(1025), ['claude'], taken).description).toBe('new.descriptionTooLong');
  });

  it('la plantilla es YAML válido aunque la descripción tenga dos puntos y comillas', () => {
    const md = skillTemplate('revisar-pr', 'Revisa PRs: "rápido" y #bien', 'es');
    const p = parseSkillMd(md);
    expect(p.yamlError).toBeNull();
    expect(p.name).toBe('revisar-pr');
    expect(p.description).toBe('Revisa PRs: "rápido" y #bien');
    expect(p.body).toContain('## Cuándo usarla');
  });
});

describe('importar', () => {
  const bundle: StagedBundle = {
    id: 'a'.repeat(32),
    origin: { kind: 'zip', label: '~/Descargas/pack.zip' },
    skipped: [],
    skills: [
      { rel: 'pack/Mi Skill', dirName: 'Mi Skill', skillMd: '# sin frontmatter', files: [], fileFlags: flags, sizeBytes: 10, hash: 'h1', tooLarge: false },
      { rel: 'pack/pdf', dirName: 'pdf', skillMd: '---\nname: pdf\ndescription: d\n---\n', files: [], fileFlags: flags, sizeBytes: 10, hash: 'h2', tooLarge: false },
      { rel: 'pack/enorme', dirName: 'enorme', skillMd: null, files: [], fileFlags: flags, sizeBytes: 10, hash: null, tooLarge: true },
    ],
  };
  const taken = { claude: new Set(['pdf']), codex: new Set<string>() };

  it('nombre sugerido, y las demasiado grandes no se eligen', () => {
    expect(suggestName('Mi Skill (versión 2)')).toBe('mi-skill-version-2');
    const rows = initialRows(bundle);
    expect(rows.map((r) => [r.name, r.selected])).toEqual([['mi-skill', true], ['pdf', true], ['enorme', false]]);
  });

  it('problemas: ocupado, duplicado, sin herramientas, demasiado grande', () => {
    const rows = initialRows(bundle);
    expect(rowProblem(rows[0], rows, taken)).toBeNull();
    expect(rowProblem(rows[1], rows, taken)).toBe('needsReplace');
    expect(rowProblem({ ...rows[1], replace: true }, rows, taken)).toBeNull();
    expect(rowProblem({ ...rows[1], tools: ['codex'] }, rows, taken)).toBeNull();
    const dup = [rows[0], { ...rows[1], name: 'mi-skill' }];
    expect(rowProblem(dup[1], dup, taken)).toBe('nameDuplicated');
    expect(rowProblem({ ...rows[0], tools: [] }, rows, taken)).toBe('toolsRequired');
    expect(rowProblem({ ...rows[0], name: 'Mal' }, rows, taken)).toBe('nameInvalid');
    expect(rowProblem(rows[2], rows, taken)).toBe('tooLarge');
  });
});

describe('borrar y compartir', () => {
  it('una skill con enlaces ofrece quitar cada enlace o borrar todo', () => {
    const primary = entry({ dirName: 's' }).primary;
    const it = toItem(entry({ dirName: 's', locations: [primary, linkTo('agents', 's')], tools: ['claude', 'codex'] }));
    const c = trashChoices(it);
    expect(c.links.map((l) => l.source)).toEqual(['agents']);
    expect(c.all).toEqual({ loc: primary, scope: 'all' });
    expect(trashChoices(toItem(entry({ dirName: 'solo' }))).links).toEqual([]);
  });

  it('solo se comparte una propia que está en una herramienta', () => {
    expect(shareTarget(toItem(entry({ dirName: 'a' })))).toBe('codex');
    expect(shareTarget(toItem(entry({ dirName: 'b', tools: ['codex'] })))).toBe('claude');
    expect(shareTarget(toItem(entry({ dirName: 'c', tools: ['claude', 'codex'] })))).toBeNull();
    expect(shareTarget(toItem(entry({ dirName: 'd', origin: 'disabled' })))).toBeNull();
  });
});
