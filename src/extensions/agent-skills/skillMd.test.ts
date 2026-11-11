import { describe, expect, it } from 'vitest';
import { frontmatterValue, isPortableName, parseSkillMd, skillMdWarnings } from './skillMd';

describe('SKILL.md', () => {
  it('lee name, description, el resto del frontmatter y el cuerpo', () => {
    const p = parseSkillMd('---\nname: logday\ndescription: "Orquesta: el trabajo"\nallowed-tools: Read Grep\n---\n# Título\n');
    expect(p.name).toBe('logday');
    expect(p.description).toBe('Orquesta: el trabajo');
    expect(p.frontmatter['allowed-tools']).toBe('Read Grep');
    expect(p.body).toBe('# Título\n');
    expect(skillMdWarnings(p, 'logday')).toEqual(['allowed-tools']);
  });

  it('sin frontmatter o con YAML roto avisa', () => {
    expect(skillMdWarnings(parseSkillMd('# Solo texto'), 'x')).toEqual(['invalid-frontmatter']);
    const roto = parseSkillMd('---\nname: [a\n---\ncuerpo');
    expect(roto.yamlError).toBeTruthy();
    expect(skillMdWarnings(roto, 'x')).toEqual(['invalid-frontmatter']);
  });

  it('no interpreta tipos de JavaScript del YAML', () => {
    const p = parseSkillMd('---\nname: x\ndescription: !!js/function "function () { return 1 }"\n---\n');
    expect(p.yamlError).toBeTruthy();
  });

  it('avisa del nombre: falta, no coincide, no es portable', () => {
    expect(skillMdWarnings(parseSkillMd('---\ndescription: d\n---\n'), 'x')).toEqual(['missing-name']);
    expect(skillMdWarnings(parseSkillMd('---\nname: otro\ndescription: d\n---\n'), 'x')).toEqual(['name-mismatch']);
    expect(skillMdWarnings(parseSkillMd('---\nname: Mi_Skill\ndescription: d\n---\n'), 'Mi_Skill')).toEqual(['name-not-portable']);
    expect(skillMdWarnings(parseSkillMd('---\nname: x\n---\n'), 'x')).toEqual(['missing-description']);
  });

  it('hooks e inyección de comandos, salvo dentro de bloques de código', () => {
    const hooks = parseSkillMd('---\nname: x\ndescription: d\nhooks:\n  PreToolUse: []\n---\n');
    expect(skillMdWarnings(hooks, 'x')).toEqual(['hooks']);
    const cmd = parseSkillMd('---\nname: x\ndescription: d\n---\nEstado: !`git status`\n');
    expect(skillMdWarnings(cmd, 'x')).toEqual(['shell-injection']);
    const doc = parseSkillMd('---\nname: x\ndescription: d\n---\n```md\nEstado: !`git status`\n```\n');
    expect(skillMdWarnings(doc, 'x')).toEqual([]);
  });

  it('nombres portables (agentskills.io)', () => {
    for (const ok of ['a', 'pdf', 'skill-creator', 'a1-b2', 'x'.repeat(64)]) expect(isPortableName(ok), ok).toBe(true);
    for (const bad of ['', '-a', 'a-', 'a--b', 'A', 'a_b', 'a b', 'x'.repeat(65), 'ñandú']) expect(isPortableName(bad), bad).toBe(false);
  });

  it('valores de la tabla', () => {
    expect(frontmatterValue('texto')).toBe('texto');
    expect(frontmatterValue(true)).toBe('true');
    expect(frontmatterValue(['Read', 'Grep'])).toBe('[Read, Grep]');
  });
});
