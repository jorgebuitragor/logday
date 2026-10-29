// "OpenProject" (specs/openproject). Lógica sin React ni Tauri: la
// configuración, la lectura de la API v3 (HAL+JSON) y la tarea que se crea.
//
// La respuesta se lee como datos (P9): solo los campos que se usan, y si
// no tiene la forma esperada se avisa en vez de crear tareas a medias.

import type { Task, TaskStatus } from '../../types/task';

export const OPENPROJECT_ID = 'openproject' as const;
export const DEFAULT_PROJECT = 'openproject';

export interface OpenProjectLast {
  at: string;
  status: 'ok' | 'error';
  created?: number;
  /** Tareas ya importadas a las que se les corrigió código o proyecto. */
  updated?: number;
  /** P4d: las que se quitaron por no ser tareas ni errores. */
  removed?: number;
  error?: string;
}

/** Un campo personalizado de OpenProject (`customField<n>`). */
export interface PersonField {
  id: string;
  name: string;
}

/** Como lo devuelve `openproject_custom_fields`: de persona (P4b) o de
 *  texto, para el código de la tarea (P5). */
export interface CustomField extends PersonField {
  kind: 'user' | 'text';
}

/** P5: el código, el proyecto y el avance que la importación le puso a
 *  una tarea. Lo que el usuario cambió después no se vuelve a tocar. */
export interface Managed {
  code: string;
  project: string;
  /** P5d: el avance que puso; sin valor si todavía no puso ninguno. */
  progress?: number;
  /** P5e: el estado que puso. */
  status?: TaskStatus;
  /** P12: la versión del work package en la última importación o envío;
   *  con ella OpenProject rechaza un envío si alguien lo cambió entretanto. */
  lockVersion?: number;
}

/** P12: un estado de OpenProject (para la equivalencia de estados). */
export interface OpStatus {
  id: string;
  name: string;
  isClosed: boolean;
}

/** P12: lo que falta enviar a OpenProject (sin red, se reintenta). */
export interface PendingPush {
  progress?: number;
  status?: TaskStatus;
}

export interface PushLast {
  at: string;
  status: 'ok' | 'error';
  error?: string;
  /** El título de la tarea, para el aviso. */
  title?: string;
}

export interface OpenProjectSettings {
  /** Nombre del usuario en OpenProject; vacío = sin conectar. */
  account?: string;
  /** Para los enlaces y para mostrarla. Rust usa la del llavero, guardada
   *  junto con el token (P2). */
  baseUrl?: string;
  project: string;
  /** P4b: también se busca al usuario en estos campos personalizados. */
  personFields: PersonField[];
  /** P5: el campo de texto que da el código de la tarea (en la FCV,
   *  "Tarea"); sin él, `OP-<número>`. */
  codeField?: PersonField;
  /** P5: id del work package → lo que la importación le puso. */
  managed: Record<string, Managed>;
  /** P4c: traer también los work packages cerrados (como tareas hechas). */
  includeClosed: boolean;
  /** P12: enviar a OpenProject el avance y el estado que se cambien en
   *  Logday. Apagado por defecto. */
  writeBack: boolean;
  /** P12: el estado de OpenProject que corresponde a cada uno de Logday; sin
   *  equivalencia, ese estado no se envía. */
  statusMap: Partial<Record<TaskStatus, { id: string; name: string }>>;
  /** P12: id del work package → lo que falta enviar. */
  pending: Record<string, PendingPush>;
  lastPush?: PushLast;
  auto: boolean;
  /** id del work package → id de la tarea de Logday (P6). */
  imported: Record<string, string>;
  last?: OpenProjectLast;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTaskStatus = (v: unknown): v is TaskStatus => v === 'todo' || v === 'in-progress' || v === 'done';

export function readOpenProjectSettings(raw: Record<string, unknown> | undefined): OpenProjectSettings {
  const out: OpenProjectSettings = {
    project: DEFAULT_PROJECT, personFields: [], managed: {}, includeClosed: false, writeBack: false, statusMap: {}, pending: {},
    auto: false, imported: {},
  };
  if (!raw) return out;
  if (typeof raw.account === 'string' && raw.account) out.account = raw.account;
  if (typeof raw.baseUrl === 'string' && /^https?:\/\//.test(raw.baseUrl)) out.baseUrl = raw.baseUrl;
  if (typeof raw.project === 'string' && raw.project.trim()) out.project = raw.project.trim();
  if (Array.isArray(raw.personFields)) {
    for (const f of raw.personFields) {
      if (isObject(f) && typeof f.id === 'string' && /^customField\d+$/.test(f.id) && typeof f.name === 'string') {
        out.personFields.push({ id: f.id, name: f.name });
      }
    }
  }
  const cf = raw.codeField;
  if (isObject(cf) && typeof cf.id === 'string' && /^customField\d+$/.test(cf.id) && typeof cf.name === 'string') {
    out.codeField = { id: cf.id, name: cf.name };
  }
  if (isObject(raw.managed)) {
    for (const [k, v] of Object.entries(raw.managed)) {
      if (isObject(v) && typeof v.code === 'string' && typeof v.project === 'string') {
        out.managed[k] = {
          code: v.code,
          project: v.project,
          ...(typeof v.progress === 'number' ? { progress: v.progress } : {}),
          ...(isTaskStatus(v.status) ? { status: v.status } : {}),
          ...(typeof v.lockVersion === 'number' ? { lockVersion: v.lockVersion } : {}),
        };
      }
    }
  }
  if (raw.includeClosed === true) out.includeClosed = true;
  if (raw.writeBack === true) out.writeBack = true;
  if (isObject(raw.statusMap)) {
    for (const [k, v] of Object.entries(raw.statusMap)) {
      if (isTaskStatus(k) && isObject(v) && typeof v.id === 'string' && /^\d+$/.test(v.id) && typeof v.name === 'string') {
        out.statusMap[k] = { id: v.id, name: v.name };
      }
    }
  }
  if (isObject(raw.pending)) {
    for (const [k, v] of Object.entries(raw.pending)) {
      if (!isObject(v)) continue;
      const p: PendingPush = {};
      if (typeof v.progress === 'number') p.progress = v.progress;
      if (isTaskStatus(v.status)) p.status = v.status;
      if (p.progress !== undefined || p.status) out.pending[k] = p;
    }
  }
  const lp = raw.lastPush;
  if (isObject(lp) && typeof lp.at === 'string' && (lp.status === 'ok' || lp.status === 'error')) {
    out.lastPush = { at: lp.at, status: lp.status };
    if (typeof lp.error === 'string') out.lastPush.error = lp.error;
    if (typeof lp.title === 'string') out.lastPush.title = lp.title;
  }
  if (raw.auto === true) out.auto = true;
  if (raw.imported && typeof raw.imported === 'object' && !Array.isArray(raw.imported)) {
    for (const [k, v] of Object.entries(raw.imported as Record<string, unknown>)) {
      if (typeof v === 'string') out.imported[k] = v;
    }
  }
  const l = raw.last as Record<string, unknown> | undefined;
  if (l && typeof l.at === 'string' && (l.status === 'ok' || l.status === 'error')) {
    out.last = { at: l.at, status: l.status };
    if (typeof l.created === 'number') out.last.created = l.created;
    if (typeof l.updated === 'number') out.last.updated = l.updated;
    if (typeof l.removed === 'number') out.last.removed = l.removed;
    if (typeof l.error === 'string') out.last.error = l.error;
  }
  return out;
}

/** El nombre de un proyecto de Logday como lo guarda `createProject`, sin
 *  los caracteres que no van en una carpeta y sin guiones repetidos
 *  ("App X V.1 - Bombas" → "app-x-v.1-bombas"). */
export function projectSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '') || DEFAULT_PROJECT;
}

// ── Lectura ───────────────────────────────────────────────────────────

export class UnexpectedFormatError extends Error {}

export interface WorkPackage {
  id: string;
  subject: string;
  description: string;
  /** YYYY-MM-DD: la fecha de fin, o la de un hito. */
  due?: string;
  status?: string;
  type?: string;
  priority?: string;
  project?: string;
  /** P5: el valor del campo de código (`codeField`), si lo tiene. */
  code?: string;
  /** % de avance en OpenProject (`percentageDone`). */
  progress?: number;
  /** P5b: ids de los ancestros, del más alto al padre. */
  ancestors: string[];
  /** P12: para enviar cambios sin pisar los de otros. */
  lockVersion?: number;
}

export interface WorkPackagePage {
  items: WorkPackage[];
  total: number;
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const linkTitle = (links: Record<string, unknown>, key: string) => {
  const l = links[key];
  return isObject(l) ? str(l.title) : undefined;
};
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const wpIdOf = (href: unknown) => (typeof href === 'string' ? /\/work_packages\/(\d+)$/.exec(href)?.[1] : undefined);

/** Un campo de texto de OpenProject: texto simple o `{ raw }` (formateado). */
function textValue(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v : isObject(v) ? str(v.raw) : undefined;
  // Una línea y sin espacios de más: es un código.
  const out = s?.replace(/\s+/g, ' ').trim();
  return out ? out.slice(0, 80) : undefined;
}

export function parseWorkPackages(body: string, codeField?: string): WorkPackagePage {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new UnexpectedFormatError('json');
  }
  if (!isObject(json) || json._type !== 'WorkPackageCollection' || !isObject(json._embedded) || !Array.isArray(json._embedded.elements)) {
    throw new UnexpectedFormatError('collection');
  }
  const items: WorkPackage[] = [];
  for (const el of json._embedded.elements) {
    if (!isObject(el) || (typeof el.id !== 'number' && typeof el.id !== 'string')) continue;
    const links = isObject(el._links) ? el._links : {};
    const desc = isObject(el.description) ? str(el.description.raw) : undefined;
    const due = isDate(el.dueDate) ? el.dueDate : isDate(el.date) ? el.date : undefined;
    const code = codeField ? textValue(el[codeField]) : undefined;
    const progress = typeof el.percentageDone === 'number' && el.percentageDone >= 0 && el.percentageDone <= 100
      ? Math.round(el.percentageDone) : undefined;
    const ancestors = (Array.isArray(links.ancestors) ? links.ancestors : [])
      .map((a) => (isObject(a) ? wpIdOf(a.href) : undefined))
      .filter((id): id is string => !!id);
    items.push({
      id: String(el.id),
      subject: (str(el.subject) ?? '').trim(),
      description: (desc ?? '').trim(),
      ...(due ? { due } : {}),
      status: linkTitle(links, 'status'),
      type: linkTitle(links, 'type'),
      priority: linkTitle(links, 'priority'),
      project: linkTitle(links, 'project'),
      ...(code ? { code } : {}),
      ...(progress !== undefined ? { progress } : {}),
      ancestors,
      ...(typeof el.lockVersion === 'number' ? { lockVersion: el.lockVersion } : {}),
    });
  }
  return { items, total: typeof json.total === 'number' ? json.total : items.length };
}

/** P5b: de un work package suelto, solo su tipo y asunto (para saber si un
 *  ancestro es una épica). */
export function parseWorkPackageRef(body: string): { type?: string; subject: string } {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new UnexpectedFormatError('json');
  }
  if (!isObject(json) || json._type !== 'WorkPackage') throw new UnexpectedFormatError('work_package');
  const links = isObject(json._links) ? json._links : {};
  return { type: linkTitle(links, 'type'), subject: (str(json.subject) ?? '').trim() };
}

/** P5e, P12: los estados de OpenProject (`/api/v3/statuses`). */
export function parseStatuses(body: string): OpStatus[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new UnexpectedFormatError('json');
  }
  if (!isObject(json) || !isObject(json._embedded) || !Array.isArray(json._embedded.elements)) {
    throw new UnexpectedFormatError('statuses');
  }
  return json._embedded.elements
    .filter((s): s is Record<string, unknown> => isObject(s) && typeof s.name === 'string')
    .map((s) => ({
      id: typeof s.id === 'number' || typeof s.id === 'string' ? String(s.id) : '',
      name: (s.name as string).trim(),
      isClosed: s.isClosed === true,
    }));
}

/** P5e: los nombres de los estados que OpenProject cuenta como cerrados. */
export function parseClosedStatuses(body: string): Set<string> {
  return new Set(parseStatuses(body).filter((s) => s.isClosed).map((s) => s.name));
}

/** P12: la versión de un work package en la respuesta de un envío. */
export function lockVersionOf(body: string): number | undefined {
  try {
    const json: unknown = JSON.parse(body);
    return isObject(json) && typeof json.lockVersion === 'number' ? json.lockVersion : undefined;
  } catch {
    return undefined;
  }
}

/** P5e: el estado de la tarea en Logday según el de OpenProject: los
 *  cerrados, hechas; los que dicen que algo se está haciendo ("En
 *  Desarrollo", "In progress"), en progreso; el resto, por hacer. */
export function logdayStatus(status: string | undefined, closed: Set<string>): TaskStatus {
  const s = (status ?? '').trim();
  if (closed.has(s)) return 'done';
  return /^(en|in)\s/i.test(s) ? 'in-progress' : 'todo';
}

export const isEpicType = (type: string | undefined) => !!type && /^(epic|[eé]pica)$/i.test(type.trim());
/** P4d: solo las tareas y los errores se importan como tareas; las
 *  épicas, Features, hitos y fases son contenedores (las carpetas). Un
 *  work package sin tipo se importa. */
export const isWorkItemType = (type: string | undefined) =>
  !type || /^(task|bug|tarea|error|defecto)$/i.test(type.trim());

export const isFeatureType = (type: string | undefined) => !!type && /^(feature|funcionalidad|caracter[ií]stica)$/i.test(type.trim());

/** P5b: el proyecto de Logday de un work package. En la FCV la estructura
 *  es Épica > Feature > Tarea, y Jorge pidió las dos como carpetas: un
 *  subproyecto del elegido por la épica que lo contiene (la más cercana) y,
 *  dentro, uno por su Feature (la más cercana, por debajo de esa épica).
 *  Una épica o una Feature va en su propia carpeta. Sin épica ni Feature,
 *  en el proyecto elegido. */
export function placement(
  wp: WorkPackage,
  baseProject: string,
  ancestor: (id: string) => { type?: string; subject: string } | undefined,
): string {
  const base = projectSlug(baseProject);
  // Del propio work package hacia arriba.
  const chain = [{ type: wp.type, subject: wp.subject }, ...[...wp.ancestors].reverse().map(ancestor)];
  const epicAt = chain.findIndex((a) => a && isEpicType(a.type));
  const below = epicAt === -1 ? chain : chain.slice(0, epicAt);
  const feature = below.find((a) => a && isFeatureType(a.type));
  const parts = [epicAt === -1 ? undefined : chain[epicAt]?.subject, feature?.subject].filter((s): s is string => !!s);
  return [base, ...parts.map(projectSlug)].join('/');
}

/** P4b: los ids de una página de `/api/v3/projects`. */
export function parseProjectIds(body: string): { ids: number[]; total: number } {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new UnexpectedFormatError('json');
  }
  if (!isObject(json) || !isObject(json._embedded) || !Array.isArray(json._embedded.elements)) {
    throw new UnexpectedFormatError('projects');
  }
  const ids = json._embedded.elements
    .map((el) => (isObject(el) && typeof el.id === 'number' && Number.isInteger(el.id) && el.id > 0 ? el.id : null))
    .filter((id): id is number => id !== null);
  return { ids, total: typeof json.total === 'number' ? json.total : ids.length };
}

// ── La tarea ──────────────────────────────────────────────────────────

export interface TaskTexts {
  open: string;
  project: string;
  type: string;
  status: string;
  priority: string;
  untitled: string;
}

/** P5: título, código (el del campo elegido, o `OP-<id>`), fecha, y en el
 *  cuerpo los datos del work package, el enlace y la descripción. */
export function workPackageToTask(wp: WorkPackage, baseUrl: string, texts: TaskTexts) {
  const link = `${baseUrl.replace(/\/+$/, '')}/work_packages/${wp.id}`;
  const meta = ([
    [texts.project, wp.project],
    [texts.type, wp.type],
    [texts.status, wp.status],
    [texts.priority, wp.priority],
  ] as const)
    .filter(([, v]) => v)
    .map(([k, v]) => `- **${k}:** ${v}`);
  const content = [`[${texts.open} #${wp.id}](${link})`, meta.join('\n'), wp.description].filter(Boolean).join('\n\n');
  return {
    title: wp.subject || `${texts.untitled} #${wp.id}`,
    taskCode: wp.code ?? `OP-${wp.id}`,
    content,
    due: wp.due,
  };
}

/** P12: lo que cambió en una tarea y se puede enviar: el avance, y el
 *  estado si tiene equivalencia en OpenProject. */
export function changesToPush(
  prev: Task | undefined,
  next: Task,
  statusMapped: (status: TaskStatus) => boolean,
): PendingPush | null {
  const out: PendingPush = {};
  if (next.progress !== undefined && next.progress !== prev?.progress) out.progress = next.progress;
  if (prev && next.status !== prev.status && statusMapped(next.status)) out.status = next.status;
  return out.progress !== undefined || out.status ? out : null;
}
