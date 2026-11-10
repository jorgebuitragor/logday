// Lo que la vista hace con la lista que devuelve Rust (specs/skills-de-
// agentes SK5, SK7): el nombre y la descripción del frontmatter, los
// avisos, los grupos, la búsqueda y los filtros. Puro y probado.
import type { Origin, SkillEntry, Tool } from './api';
import { parseSkillMd, skillMdWarnings, type ParsedSkillMd, type SkillWarning } from './skillMd';

export const AGENT_SKILLS_ID = 'agent-skills';

export type ToolFilter = 'all' | Tool;
export type SkillGroup = 'own' | 'disabled' | 'plugin' | 'system';

/** Preferencias locales (`extensions['agent-skills'].settings`, SK32). */
export interface AgentSkillsSettings {
  toolFilter: ToolFilter;
  /** Opciones → Mostrar (design "Opciones"). */
  showPlugins: boolean;
  showSystem: boolean;
  /** Grupos plegados de la columna. */
  collapsed: SkillGroup[];
}

export const DEFAULT_SETTINGS: AgentSkillsSettings = { toolFilter: 'all', showPlugins: true, showSystem: true, collapsed: [] };

const GROUPS: readonly SkillGroup[] = ['own', 'disabled', 'plugin', 'system'];

export function readSettings(raw: Record<string, unknown> | undefined): AgentSkillsSettings {
  const r = raw ?? {};
  const toolFilter = r.toolFilter === 'claude' || r.toolFilter === 'codex' ? r.toolFilter : 'all';
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const collapsed = Array.isArray(r.collapsed) ? GROUPS.filter((g) => (r.collapsed as unknown[]).includes(g)) : [];
  return {
    toolFilter,
    showPlugins: bool(r.showPlugins, DEFAULT_SETTINGS.showPlugins),
    showSystem: bool(r.showSystem, DEFAULT_SETTINGS.showSystem),
    collapsed,
  };
}

/** Avisos que salen de los archivos o de la ubicación, además de los del
 *  SKILL.md. */
export type FileWarning = 'scripts' | 'binaries' | 'symlinks' | 'external' | 'broken' | 'truncated' | 'unreadable';
export type Warning = SkillWarning | FileWarning;

/** Los que ponen el punto de riesgo en la fila: lo que puede hacer que el
 *  agente ejecute algo o que no se pudo revisar. */
export const RISK_WARNINGS: ReadonlySet<Warning> = new Set<Warning>([
  'scripts', 'binaries', 'symlinks', 'external', 'allowed-tools', 'hooks', 'shell-injection',
]);

/** Orden en que se muestran: primero los de riesgo. */
const WARNING_ORDER: readonly Warning[] = [
  'external', 'broken', 'hooks', 'shell-injection', 'allowed-tools', 'scripts', 'binaries', 'symlinks',
  'invalid-frontmatter', 'missing-name', 'missing-description', 'name-mismatch', 'name-not-portable', 'truncated', 'unreadable',
];

export interface SkillItem {
  entry: SkillEntry;
  key: string;
  name: string;
  description: string;
  parsed: ParsedSkillMd | null;
  warnings: Warning[];
  risky: boolean;
  group: SkillGroup;
}

export function groupOf(origin: Origin): SkillGroup {
  switch (origin) {
    case 'disabled':
      return 'disabled';
    case 'plugin':
      return 'plugin';
    case 'synced':
    case 'system':
    case 'admin':
      return 'system';
    default:
      // Los enlaces externos están en las carpetas propias.
      return 'own';
  }
}

export function toItem(entry: SkillEntry): SkillItem {
  const parsed = entry.skillMd !== null ? parseSkillMd(entry.skillMd) : null;
  const warnings = new Set<Warning>();
  if (entry.origin === 'external') warnings.add(entry.primary.broken ? 'broken' : 'external');
  else if (!parsed) warnings.add('unreadable');
  if (parsed) for (const w of skillMdWarnings(parsed, entry.dirName)) warnings.add(w);
  const f = entry.fileFlags;
  if (f.scripts || f.executables) warnings.add('scripts');
  if (f.binaries) warnings.add('binaries');
  if (f.symlinks) warnings.add('symlinks');
  if (f.truncated || entry.skillMdTruncated) warnings.add('truncated');
  const sorted = WARNING_ORDER.filter((w) => warnings.has(w));
  return {
    entry,
    key: entry.key,
    name: parsed?.name ?? entry.dirName,
    description: parsed?.description ?? '',
    parsed,
    warnings: sorted,
    risky: sorted.some((w) => RISK_WARNINGS.has(w)),
    group: groupOf(entry.origin),
  };
}

/** Para buscar sin tildes ni mayúsculas. */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export interface FilterInput {
  query: string;
  tool: ToolFilter;
  showPlugins: boolean;
  showSystem: boolean;
}

export function filterItems(items: readonly SkillItem[], f: FilterInput): SkillItem[] {
  const q = fold(f.query.trim());
  return items.filter((it) => {
    if (f.tool !== 'all' && !it.entry.tools.includes(f.tool)) return false;
    if (!f.showPlugins && it.group === 'plugin') return false;
    if (!f.showSystem && it.group === 'system') return false;
    if (!q) return true;
    return fold(`${it.name} ${it.entry.dirName} ${it.description} ${it.entry.plugin?.name ?? ''}`).includes(q);
  });
}

/** Los grupos con sus skills, en orden y ordenadas por nombre. Los vacíos
 *  no salen. */
export function groupItems(items: readonly SkillItem[], locale: string): { group: SkillGroup; items: SkillItem[] }[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  return GROUPS.map((group) => ({
    group,
    items: items.filter((it) => it.group === group).sort((a, b) => collator.compare(a.name, b.name) || a.key.localeCompare(b.key)),
  })).filter((g) => g.items.length > 0);
}

/** "12 KB", "1,4 MB". */
export function formatSize(bytes: number, locale: string): string {
  const num = (n: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
  if (bytes < 1024) return `${num(bytes, 0)} B`;
  if (bytes < 1024 * 1024) return `${num(bytes / 1024, bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${num(bytes / (1024 * 1024), 1)} MB`;
}

/** El locale de los números y las fechas, con el idioma de la app. */
export const localeOf = (language: string) => (language === 'es' ? 'es-CO' : 'en-US');
