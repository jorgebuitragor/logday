// Datos de prueba: una entrada como las que devuelve `agent_skills_list`.
import type { SkillEntry } from './api';

export function entry(over: Partial<SkillEntry> & { dirName: string }): SkillEntry {
  const source = over.primary?.source ?? 'claude';
  const primary = over.primary ?? {
    source,
    id: over.dirName,
    path: `~/.claude/skills/${over.dirName}`,
    isLink: false,
    linkTarget: null,
    broken: false,
    tool: 'claude' as const,
  };
  return {
    key: `${primary.source}:${primary.id}`,
    primary,
    locations: [primary],
    tools: ['claude'],
    origin: 'own',
    plugin: null,
    editable: true,
    skillMd: `---\nname: ${over.dirName}\ndescription: Hace ${over.dirName}\n---\n# ${over.dirName}\n`,
    skillMdTruncated: false,
    fileCount: 1,
    sizeBytes: 120,
    modifiedMs: new Date(2026, 10, 10, 9, 0).getTime(),
    fileFlags: { scripts: false, binaries: false, symlinks: false, executables: false, truncated: false },
    ...over,
  };
}
