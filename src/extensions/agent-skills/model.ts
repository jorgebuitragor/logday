// Lo que la vista hace con la lista que devuelve Rust (specs/skills-de-
// agentes SK5, SK7): el nombre y la descripción del frontmatter, los
// avisos, los grupos, la búsqueda y los filtros. Puro y probado.
import type { FileFlags, Origin, SkillEntry, Tool } from './api';
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
export type FileWarning = 'scripts' | 'binaries' | 'symlinks' | 'external' | 'broken' | 'truncated' | 'unreadable' | 'missing-files';
export type Warning = SkillWarning | FileWarning;

/** Los que ponen el punto de riesgo en la fila: lo que puede hacer que el
 *  agente ejecute algo o que no se pudo revisar. */
export const RISK_WARNINGS: ReadonlySet<Warning> = new Set<Warning>([
  'scripts', 'binaries', 'symlinks', 'external', 'allowed-tools', 'hooks', 'shell-injection',
]);

/** Orden en que se muestran: primero los de riesgo. */
const WARNING_ORDER: readonly Warning[] = [
  'external', 'broken', 'hooks', 'shell-injection', 'allowed-tools', 'scripts', 'binaries', 'symlinks',
  'invalid-frontmatter', 'missing-name', 'missing-description', 'name-mismatch', 'name-not-portable', 'missing-files', 'truncated', 'unreadable',
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

/** Archivos de la skill (`scripts/…`, `references/…`, `assets/…`) que el
 *  SKILL.md menciona y que no vienen con ella: pasa al importar un `.md`
 *  suelto de una skill que tenía más archivos (SK14). */
export function missingFiles(body: string, files: readonly string[]): string[] {
  const have = new Set(files);
  const refs = body.match(/\b(?:scripts|references|assets)\/\w[\w.-]*(?:\/\w[\w.-]*)*/g) ?? [];
  return [...new Set(refs.map((r) => r.replace(/[.]+$/, '')))].filter((r) => !have.has(r) && ![...have].some((f) => f.startsWith(`${r}/`)));
}

/** Los avisos de una skill (SK7), instalada o preparada para instalar. */
export function computeWarnings(input: {
  parsed: ParsedSkillMd | null;
  dirName: string;
  fileFlags: FileFlags;
  skillMdTruncated?: boolean;
  location?: 'external' | 'broken' | null;
  /** Rutas de los archivos que trae, para avisar si el SKILL.md menciona
   *  alguno que no viene (un `.md` suelto, sobre todo). Solo al importar. */
  files?: readonly string[];
}): { warnings: Warning[]; risky: boolean } {
  const warnings = new Set<Warning>();
  if (input.location) warnings.add(input.location);
  else if (!input.parsed) warnings.add('unreadable');
  if (input.parsed) for (const w of skillMdWarnings(input.parsed, input.dirName)) warnings.add(w);
  const f = input.fileFlags;
  if (f.scripts || f.executables) warnings.add('scripts');
  if (f.binaries) warnings.add('binaries');
  if (f.symlinks) warnings.add('symlinks');
  if (f.truncated || input.skillMdTruncated) warnings.add('truncated');
  if (input.files && input.parsed && missingFiles(input.parsed.body, input.files).length) warnings.add('missing-files');
  const sorted = WARNING_ORDER.filter((w) => warnings.has(w));
  return { warnings: sorted, risky: sorted.some((w) => RISK_WARNINGS.has(w)) };
}

export function toItem(entry: SkillEntry): SkillItem {
  const parsed = entry.skillMd !== null ? parseSkillMd(entry.skillMd) : null;
  const { warnings, risky } = computeWarnings({
    parsed,
    dirName: entry.dirName,
    fileFlags: entry.fileFlags,
    skillMdTruncated: entry.skillMdTruncated,
    location: entry.origin === 'external' ? (entry.primary.broken ? 'broken' : 'external') : null,
  });
  return {
    entry,
    key: entry.key,
    name: parsed?.name ?? entry.dirName,
    description: parsed?.description ?? '',
    parsed,
    warnings,
    risky,
    group: groupOf(entry.origin),
  };
}

/** Las carpetas ocupadas por herramienta, para avisar antes de crear o
 *  instalar (Rust lo vuelve a comprobar). Cuentan las propias y las
 *  desactivadas, que volverían al mismo nombre. */
export function takenNames(items: readonly SkillItem[]): Record<Tool, Set<string>> {
  const out: Record<Tool, Set<string>> = { claude: new Set(), codex: new Set() };
  for (const it of items) {
    for (const loc of it.entry.locations) {
      if (loc.source === 'claude' || loc.source === 'agents' || loc.source === 'codex') {
        out[loc.tool].add(loc.id);
      } else if (loc.source === 'disabled') {
        const name = loc.id.split('/')[1];
        if (name) out[loc.tool].add(name);
      }
    }
  }
  return out;
}

/** Un nombre de carpeta portable a partir de otro (para la vista previa
 *  de importar): minúsculas, sin tildes, con guiones. */
export function suggestName(raw: string): string {
  return fold(raw)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64)
    .replace(/-+$/, '');
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
