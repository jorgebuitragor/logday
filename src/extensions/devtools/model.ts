// Modelo de DevTools (specs/devtools): qué herramientas hay, cómo se
// agrupan, qué se recuerda y cómo se conecta con las notas.
import type { ExtensionId } from '../types';

export const DEVTOOLS_ID: ExtensionId = 'devtools';

export type ToolGroup = 'formats' | 'encoding' | 'generators' | 'time' | 'text' | 'lists';

export type ToolId =
  | 'json' | 'yaml' | 'xml' | 'convert'
  | 'base64' | 'url' | 'html' | 'jwt'
  | 'uuid' | 'hash' | 'password' | 'lorem' | 'qr' | 'barcode'
  | 'timestamp' | 'cron'
  | 'regex' | 'diff'
  | 'sql-list' | 'list-compare';

export const TOOL_GROUPS: readonly { group: ToolGroup; tools: readonly ToolId[] }[] = [
  { group: 'formats', tools: ['json', 'yaml', 'xml', 'convert'] },
  { group: 'encoding', tools: ['base64', 'url', 'html', 'jwt'] },
  { group: 'generators', tools: ['uuid', 'hash', 'password', 'lorem', 'qr', 'barcode'] },
  { group: 'time', tools: ['timestamp', 'cron'] },
  { group: 'text', tools: ['regex', 'diff'] },
  { group: 'lists', tools: ['sql-list', 'list-compare'] },
];

export const ALL_TOOLS: readonly ToolId[] = TOOL_GROUPS.flatMap((g) => g.tools);
export const DEFAULT_TOOL: ToolId = 'json';

export const isToolId = (value: unknown): value is ToolId =>
  typeof value === 'string' && (ALL_TOOLS as readonly string[]).includes(value);

/** D8: lo pegado puede ser un JWT o datos de trabajo; por encima de esto
 *  la vista avisa y no procesa al escribir, sino con el botón. */
export const MAX_LIVE_CHARS = 200_000;
/** Tope absoluto de una entrada (≈5 MB de texto). */
export const MAX_INPUT_CHARS = 5_000_000;

// ── Preferencias (D9) ────────────────────────────────────────────────
// Solo la última herramienta y las opciones; nunca lo que se pega.

export interface DevtoolsSettings {
  lastTool: ToolId;
  /** Opciones por herramienta (indentación, longitud…), sin contenido. */
  options: Partial<Record<ToolId, Record<string, string | number | boolean>>>;
}

export function readDevtoolsSettings(raw: Record<string, unknown> | undefined): DevtoolsSettings {
  const options = raw?.options && typeof raw.options === 'object' ? (raw.options as DevtoolsSettings['options']) : {};
  return { lastTool: isToolId(raw?.lastTool) ? raw.lastTool : DEFAULT_TOOL, options };
}

// ── Puente con las notas (D10) ───────────────────────────────────────

export interface NoteCodeBlock {
  /** Lenguaje de la cerca, en minúsculas ('' si no tiene). */
  language: string;
  code: string;
  /** Primera línea, para listarlo. */
  preview: string;
}

/** Todos los bloques de código de una nota, de cualquier lenguaje. */
export function noteCodeBlocks(markdown: string): NoteCodeBlock[] {
  const out: NoteCodeBlock[] = [];
  const re = /^(`{3,}|~{3,})[ \t]*([^\s`]*)[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const code = m[3].replace(/\n$/, '');
    out.push({ language: m[2].toLowerCase(), code, preview: code.split('\n').find((l) => l.trim())?.trim() ?? '' });
  }
  return out;
}

const LANGUAGE_TOOL: Record<string, ToolId> = {
  json: 'json', jsonc: 'json', json5: 'json',
  yaml: 'yaml', yml: 'yaml',
  xml: 'xml', html: 'xml', svg: 'xml',
  jwt: 'jwt',
  cron: 'cron', crontab: 'cron',
  regex: 'regex', regexp: 'regex',
  diff: 'diff',
  csv: 'convert',
  sql: 'sql-list',
};

/** La herramienta para un bloque: por su lenguaje, o por la pinta del
 *  contenido si no tiene (un JWT, un JSON). */
export function toolForBlock(block: Pick<NoteCodeBlock, 'language' | 'code'>): ToolId | null {
  const byLanguage = LANGUAGE_TOOL[block.language];
  if (byLanguage) return byLanguage;
  const s = block.code.trim();
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(s) && s.startsWith('eyJ')) return 'jwt';
  if (/^[[{]/.test(s)) return 'json';
  if (/^</.test(s)) return 'xml';
  return null;
}

/** El lenguaje de la cerca al guardar una salida en una nota. */
export const OUTPUT_LANGUAGE: Partial<Record<ToolId, string>> = {
  json: 'json', yaml: 'yaml', xml: 'xml', jwt: 'json', regex: 'text', diff: 'diff', cron: 'text',
};

// ── Memoria de la sesión (D9) ────────────────────────────────────────
// Lo que el usuario pegó, por herramienta. Vive en memoria mientras la
// app está abierta (cambiar de sección no lo borra) y nunca se escribe en
// disco, ni en config.json ni en localStorage.

const drafts = new Map<string, string>();

export const draftKey = (tool: ToolId, field = 'input') => `${tool}:${field}`;
export const getDraft = (key: string) => drafts.get(key) ?? '';
export function setDraft(key: string, value: string) {
  if (value) drafts.set(key, value);
  else drafts.delete(key);
}
/** Al desactivar la extensión (R7), se olvida todo. */
export const clearDrafts = () => drafts.clear();

/** Lo que "Traer de una nota" deja para la herramienta que se abre. */
let pendingLoad: { tool: ToolId; code: string } | null = null;
export function queueLoad(tool: ToolId, code: string) {
  pendingLoad = { tool, code };
  setDraft(draftKey(tool), code);
}
export function takePendingLoad(tool: ToolId): string | null {
  if (pendingLoad?.tool !== tool) return null;
  const { code } = pendingLoad;
  pendingLoad = null;
  return code;
}
