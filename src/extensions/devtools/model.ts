// Modelo de DevTools (specs/devtools): qué herramientas hay, cómo se
// agrupan, qué se recuerda y cómo se conecta con las notas.
import type { ExtensionId } from '../types';

export const DEVTOOLS_ID: ExtensionId = 'devtools';

export type ToolGroup = 'formats' | 'encoding' | 'generators' | 'time' | 'text' | 'lists';

export type ToolId =
  | 'json' | 'yaml' | 'xml' | 'convert' | 'html-preview'
  | 'base64' | 'url' | 'html' | 'jwt'
  | 'uuid' | 'hash' | 'password' | 'lorem' | 'qr' | 'barcode'
  | 'timestamp' | 'cron'
  | 'regex' | 'diff'
  | 'sql-list' | 'list-compare';

export const TOOL_GROUPS: readonly { group: ToolGroup; tools: readonly ToolId[] }[] = [
  // D26: el Visor HTML va al final de Formatos (D24).
  { group: 'formats', tools: ['json', 'yaml', 'xml', 'convert', 'html-preview'] },
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

// ── Preferencias (D9, D17–D24) ───────────────────────────────────────
// La última herramienta, las opciones de cada una y cómo se muestra la
// lista; nunca lo que se pega. Solo se escriben las claves que difieren de
// lo de por defecto: un `undefined` en el parche borra la clave
// (`withExtensionSettings`), así que lo guardado hasta hoy (`{ lastTool,
// options }`) se lee como todo por defecto y se ve igual que antes.

export type ToolListLayout = 'groups' | 'az';
export type OptionValue = string | number | boolean;

export interface DevtoolsSettings {
  lastTool: ToolId;
  /** Opciones por herramienta (indentación, longitud…), sin contenido. */
  options: Partial<Record<ToolId, Record<string, OptionValue>>>;
  /** D18: por grupos (por defecto) o una sola lista de la A a la Z. */
  layout: ToolListLayout;
  /** D19: el orden de los grupos. Sin él, el de `TOOL_GROUPS`. */
  groupOrder?: ToolGroup[];
  /** D19: el orden dentro de cada grupo; solo herramientas de ese grupo. */
  toolOrder?: Partial<Record<ToolGroup, ToolId[]>>;
  /** D20: las ocultas. Es una lista de exclusión: una herramienta nueva
   *  (D24) aparece visible. */
  hidden?: ToolId[];
  /** D21: los grupos plegados, también de exclusión (uno nuevo, desplegado). */
  collapsed?: ToolGroup[];
}

/** Lo que se pasa a `updateExtensionSettings`. */
export type DevtoolsSettingsPatch = { [K in keyof DevtoolsSettings]?: DevtoolsSettings[K] | undefined };

export const ALL_GROUPS: readonly ToolGroup[] = TOOL_GROUPS.map((g) => g.group);
const GROUP_TOOLS = new Map<ToolGroup, readonly ToolId[]>(TOOL_GROUPS.map((g) => [g.group, g.tools]));
export const GROUP_OF: Readonly<Record<ToolId, ToolGroup>> = Object.fromEntries(
  TOOL_GROUPS.flatMap((g) => g.tools.map((tool) => [tool, g.group])),
) as Record<ToolId, ToolGroup>;

const isToolGroup = (value: unknown): value is ToolGroup =>
  typeof value === 'string' && (ALL_GROUPS as readonly string[]).includes(value);

/** Los elementos válidos de una lista guardada, sin repetidos. Sin lista,
 *  o sin ninguno válido, `undefined`. */
function cleanList<T>(raw: unknown, valid: (value: unknown) => value is T): T[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = [...new Set(raw.filter(valid))];
  return out.length ? out : undefined;
}

export function readDevtoolsSettings(raw: Record<string, unknown> | undefined): DevtoolsSettings {
  const options = raw?.options && typeof raw.options === 'object' ? (raw.options as DevtoolsSettings['options']) : {};
  const settings: DevtoolsSettings = {
    lastTool: isToolId(raw?.lastTool) ? raw.lastTool : DEFAULT_TOOL,
    options,
    layout: raw?.layout === 'az' ? 'az' : 'groups',
  };
  const groupOrder = cleanList(raw?.groupOrder, isToolGroup);
  if (groupOrder) settings.groupOrder = groupOrder;
  if (raw?.toolOrder && typeof raw.toolOrder === 'object') {
    const toolOrder: Partial<Record<ToolGroup, ToolId[]>> = {};
    for (const [group, list] of Object.entries(raw.toolOrder as Record<string, unknown>)) {
      if (!isToolGroup(group)) continue;
      // Una herramienta no cambia de grupo (D19): las de otro se descartan.
      const tools = cleanList(list, (v): v is ToolId => isToolId(v) && GROUP_OF[v] === group);
      if (tools) toolOrder[group] = tools;
    }
    if (Object.keys(toolOrder).length) settings.toolOrder = toolOrder;
  }
  const hidden = cleanList(raw?.hidden, isToolId);
  // Todas ocultas solo puede venir de una edición a mano (D20): se ignora.
  if (hidden && hidden.length < ALL_TOOLS.length) settings.hidden = hidden;
  const collapsed = cleanList(raw?.collapsed, isToolGroup);
  if (collapsed) settings.collapsed = collapsed;
  return settings;
}

/** Lo guardado primero, y al final lo que no estaba, en el orden por
 *  defecto (D24, la regla de `resolveSections`). */
function withMissing<T>(saved: readonly T[] | undefined, all: readonly T[]): T[] {
  const known = (saved ?? []).filter((x) => all.includes(x));
  return [...known, ...all.filter((x) => !known.includes(x))];
}

/** Los grupos en el orden del usuario. */
export const orderedGroups = (settings: Pick<DevtoolsSettings, 'groupOrder'>): ToolGroup[] =>
  withMissing(settings.groupOrder, ALL_GROUPS);

/** Las herramientas de un grupo en el orden del usuario, también las ocultas. */
export const orderedTools = (settings: Pick<DevtoolsSettings, 'toolOrder'>, group: ToolGroup): ToolId[] =>
  withMissing(settings.toolOrder?.[group], GROUP_TOOLS.get(group) ?? []);

/** Las ocultas que cuentan: si lo están todas, ninguna (D20). */
function hiddenSet(settings: Pick<DevtoolsSettings, 'hidden'>): Set<ToolId> {
  const hidden = new Set((settings.hidden ?? []).filter(isToolId));
  return hidden.size >= ALL_TOOLS.length ? new Set() : hidden;
}

export const isToolHidden = (settings: Pick<DevtoolsSettings, 'hidden'>, tool: ToolId) => hiddenSet(settings).has(tool);

export interface ResolvedToolList {
  /** Los grupos en el orden del usuario, cada uno con sus visibles y sin
   *  los vacíos. En A-Z, una sola sección con `group: null`. */
  sections: { group: ToolGroup | null; tools: ToolId[] }[];
  /** Las ocultas, en el mismo orden (el grupo "Ocultas" de la lista). */
  hidden: ToolId[];
  /** El orden plano que se ve, sin las ocultas: el de ⌥⌘↓/↑ (D22). */
  order: ToolId[];
}

/** La lista que se ve (D18–D20, design §G.4). La usan la columna, el
 *  selector de la ventana angosta, ⌥⌘↓/↑ y la página de Opciones. */
export function resolveToolList(
  settings: Pick<DevtoolsSettings, 'layout' | 'groupOrder' | 'toolOrder' | 'hidden'>,
  nameOf: (tool: ToolId) => string,
  locale: string,
): ResolvedToolList {
  const hidden = hiddenSet(settings);
  if (settings.layout === 'az') {
    const sorted = [...ALL_TOOLS].sort((a, b) => nameOf(a).localeCompare(nameOf(b), locale));
    const visible = sorted.filter((tool) => !hidden.has(tool));
    return { sections: [{ group: null, tools: visible }], hidden: sorted.filter((tool) => hidden.has(tool)), order: visible };
  }
  const grouped = orderedGroups(settings).map((group) => ({ group, tools: orderedTools(settings, group) }));
  const sections = grouped
    .map((g) => ({ group: g.group as ToolGroup | null, tools: g.tools.filter((tool) => !hidden.has(tool)) }))
    .filter((g) => g.tools.length);
  return {
    sections,
    hidden: grouped.flatMap((g) => g.tools.filter((tool) => hidden.has(tool))),
    order: sections.flatMap((g) => g.tools),
  };
}

const sameList = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Pasa el elemento `from` a la posición `to` (acotada a la lista). */
function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, item);
  return out;
}

function groupOrderPatch(order: ToolGroup[]): DevtoolsSettingsPatch {
  return { groupOrder: sameList(order, ALL_GROUPS) ? undefined : order };
}

/** Sube (`delta` -1) o baja (+1) un grupo. En un extremo, no cambia nada
 *  (el parche vacío). */
export function moveGroup(settings: Pick<DevtoolsSettings, 'groupOrder'>, group: ToolGroup, delta: -1 | 1): DevtoolsSettingsPatch {
  const order = orderedGroups(settings);
  const from = order.indexOf(group);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return {};
  return groupOrderPatch(moveItem(order, from, to));
}

/** Lleva un grupo a la posición `index` (al soltarlo al arrastrar). */
export function moveGroupTo(settings: Pick<DevtoolsSettings, 'groupOrder'>, group: ToolGroup, index: number): DevtoolsSettingsPatch {
  const order = orderedGroups(settings);
  const from = order.indexOf(group);
  if (from < 0 || from === index) return {};
  return groupOrderPatch(moveItem(order, from, index));
}

function toolOrderPatch(settings: Pick<DevtoolsSettings, 'toolOrder'>, group: ToolGroup, order: ToolId[]): DevtoolsSettingsPatch {
  // Se reescribe entero, normalizado: los grupos en su orden por defecto
  // no se guardan, y lo que ya no existe desaparece (§G.4).
  const toolOrder: Partial<Record<ToolGroup, ToolId[]>> = {};
  for (const g of ALL_GROUPS) {
    const list = g === group ? order : orderedTools(settings, g);
    if (!sameList(list, GROUP_TOOLS.get(g) ?? [])) toolOrder[g] = list;
  }
  return { toolOrder: Object.keys(toolOrder).length ? toolOrder : undefined };
}

/** Sube o baja una herramienta dentro de su grupo; nunca pasa a otro (D19). */
export function moveTool(settings: Pick<DevtoolsSettings, 'toolOrder'>, tool: ToolId, delta: -1 | 1): DevtoolsSettingsPatch {
  const group = GROUP_OF[tool];
  const order = orderedTools(settings, group);
  const from = order.indexOf(tool);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return {};
  return toolOrderPatch(settings, group, moveItem(order, from, to));
}

/** Lleva una herramienta a la posición `index` de su grupo. */
export function moveToolTo(settings: Pick<DevtoolsSettings, 'toolOrder'>, tool: ToolId, index: number): DevtoolsSettingsPatch {
  const group = GROUP_OF[tool];
  const order = orderedTools(settings, group);
  const from = order.indexOf(tool);
  if (from < 0 || from === index) return {};
  return toolOrderPatch(settings, group, moveItem(order, from, index));
}

/** Cuántas herramientas se ven en la lista (sin buscar). */
export const visibleToolCount = (settings: Pick<DevtoolsSettings, 'hidden'>) => ALL_TOOLS.length - hiddenSet(settings).size;

/** Oculta o muestra una herramienta. La última visible no se puede
 *  ocultar (D20): el parche queda vacío. */
export function setToolHidden(settings: Pick<DevtoolsSettings, 'hidden'>, tool: ToolId, hide: boolean): DevtoolsSettingsPatch {
  const current = hiddenSet(settings);
  if (current.has(tool) === hide) return {};
  if (hide) current.add(tool);
  else current.delete(tool);
  if (current.size >= ALL_TOOLS.length) return {};
  const hidden = ALL_TOOLS.filter((t) => current.has(t));
  return { hidden: hidden.length ? hidden : undefined };
}

/** Pliega o despliega un grupo de la lista (D21). */
export function toggleGroupCollapsed(settings: Pick<DevtoolsSettings, 'collapsed'>, group: ToolGroup): DevtoolsSettingsPatch {
  const current = new Set((settings.collapsed ?? []).filter(isToolGroup));
  if (current.has(group)) current.delete(group);
  else current.add(group);
  const collapsed = ALL_GROUPS.filter((g) => current.has(g));
  return { collapsed: collapsed.length ? collapsed : undefined };
}

export const isGroupCollapsed = (settings: Pick<DevtoolsSettings, 'collapsed'>, group: ToolGroup) =>
  settings.collapsed?.includes(group) ?? false;

export const setLayoutPatch = (layout: ToolListLayout): DevtoolsSettingsPatch => ({ layout: layout === 'groups' ? undefined : layout });

/** "Restablecer orden" (D19): el orden por defecto y todas visibles. No
 *  toca el modo ni los plegados. */
export const RESET_ORDER_PATCH: DevtoolsSettingsPatch = { groupOrder: undefined, toolOrder: undefined, hidden: undefined };

export const hasCustomOrder = (settings: DevtoolsSettings) =>
  Boolean(settings.groupOrder || settings.toolOrder || settings.hidden);

/** D23: "Restablecer las opciones" solo se ve si alguna herramienta las tiene. */
export const hasToolOptions = (settings: DevtoolsSettings) =>
  Object.values(settings.options).some((o) => o && typeof o === 'object' && Object.keys(o).length > 0);

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
  // D26: un bloque ```html se abre en el Visor HTML (el XML no acepta
  // `<br>` ni atributos sin comillas); el SVG sigue siendo XML.
  xml: 'xml', svg: 'xml',
  html: 'html-preview', htm: 'html-preview', xhtml: 'html-preview',
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
  if (/^<(?:!doctype\s+html|html[\s>])/i.test(s)) return 'html-preview';
  if (/^</.test(s)) return 'xml';
  return null;
}

/** El lenguaje de la cerca al guardar una salida en una nota. */
export const OUTPUT_LANGUAGE: Partial<Record<ToolId, string>> = {
  json: 'json', yaml: 'yaml', xml: 'xml', jwt: 'json', regex: 'plaintext', diff: 'diff', cron: 'plaintext',
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
