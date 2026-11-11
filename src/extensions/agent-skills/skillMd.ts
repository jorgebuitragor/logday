// Leer el SKILL.md de una skill (specs/skills-de-agentes, design "Avisos de
// frontmatter"): el frontmatter YAML, el cuerpo y los avisos que dependen
// de ellos (SK7). Es puro: no toca disco.
import yaml from 'js-yaml';

/** Regla de la especificación abierta (agentskills.io): 1-64 caracteres,
 *  `a-z`, `0-9` y `-`, sin guion al principio ni al final ni dos seguidos. */
export const NAME_MAX = 64;
export const DESCRIPTION_MAX = 1024;
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isPortableName(name: string): boolean {
  return name.length >= 1 && name.length <= NAME_MAX && NAME_RE.test(name);
}

export type SkillWarning =
  | 'invalid-frontmatter'
  | 'missing-name'
  | 'missing-description'
  | 'name-mismatch'
  | 'name-not-portable'
  | 'allowed-tools'
  | 'hooks'
  | 'shell-injection';

export interface ParsedSkillMd {
  /** El frontmatter tal cual, para la tabla del detalle. */
  frontmatter: Record<string, unknown>;
  name: string | null;
  description: string | null;
  body: string;
  /** Hay bloque `---` al principio. */
  hasFrontmatter: boolean;
  /** El mensaje de js-yaml, si el YAML no es válido. */
  yamlError: string | null;
}

const FRONTMATTER_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseSkillMd(text: string): ParsedSkillMd {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    return { frontmatter: {}, name: null, description: null, body: text, hasFrontmatter: false, yamlError: null };
  }
  const body = text.slice(m[0].length);
  try {
    // safeLoad con JSON_SCHEMA: sin tipos de JavaScript (!!js/function) ni
    // fechas; lo que hay en un SKILL.md son textos, listas y mapas. El
    // frontmatter viene de terceros (una skill bajada de un repo).
    const data = yaml.safeLoad(m[1], { schema: yaml.JSON_SCHEMA });
    const fm = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return { frontmatter: fm, name: str(fm.name), description: str(fm.description), body, hasFrontmatter: true, yamlError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0] : String(err);
    return { frontmatter: {}, name: null, description: null, body, hasFrontmatter: true, yamlError: message };
  }
}

/** Quita los bloques de código (``` y ~~~) y el código en línea con más de
 *  un acento, para no avisar de `` !`cmd` `` cuando solo se documenta. */
function withoutCodeBlocks(body: string): string {
  return body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '');
}

/** Los avisos del SKILL.md (SK7). `dirName` es la carpeta de la skill. */
export function skillMdWarnings(parsed: ParsedSkillMd, dirName: string): SkillWarning[] {
  const out: SkillWarning[] = [];
  if (!parsed.hasFrontmatter || parsed.yamlError) out.push('invalid-frontmatter');
  if (parsed.hasFrontmatter && !parsed.yamlError) {
    if (!parsed.name) out.push('missing-name');
    if (!parsed.description) out.push('missing-description');
  }
  if (parsed.name) {
    if (parsed.name !== dirName) out.push('name-mismatch');
    if (!isPortableName(parsed.name)) out.push('name-not-portable');
  }
  const fm = parsed.frontmatter;
  if (fm['allowed-tools'] !== undefined && fm['allowed-tools'] !== null && fm['allowed-tools'] !== '') out.push('allowed-tools');
  if (fm.hooks !== undefined && fm.hooks !== null) out.push('hooks');
  // `` !`comando` ``: Claude Code ejecuta el comando al invocar la skill y
  // pone su salida en el texto.
  if (/!`[^`\n]+`/.test(withoutCodeBlocks(parsed.body))) out.push('shell-injection');
  return out;
}

/** Valor del frontmatter para la tabla: textos tal cual, lo demás en YAML
 *  de una línea si cabe. */
export function frontmatterValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return yaml.dump(v, { flowLevel: 0, lineWidth: 200 }).trim();
  } catch {
    return String(v);
  }
}
