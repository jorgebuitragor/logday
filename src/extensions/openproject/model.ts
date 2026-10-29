// "OpenProject" (specs/openproject). Lógica sin React ni Tauri: la
// configuración, la lectura de la API v3 (HAL+JSON) y la tarea que se crea.
//
// La respuesta se lee como datos (P9): solo los campos que se usan, y si
// no tiene la forma esperada se avisa en vez de crear tareas a medias.

export const OPENPROJECT_ID = 'openproject' as const;
export const DEFAULT_PROJECT = 'openproject';

export interface OpenProjectLast {
  at: string;
  status: 'ok' | 'error';
  created?: number;
  error?: string;
}

/** P4b: un campo personalizado de persona de OpenProject. */
export interface PersonField {
  id: string;
  name: string;
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
  auto: boolean;
  /** id del work package → id de la tarea de Logday (P6). */
  imported: Record<string, string>;
  last?: OpenProjectLast;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function readOpenProjectSettings(raw: Record<string, unknown> | undefined): OpenProjectSettings {
  const out: OpenProjectSettings = { project: DEFAULT_PROJECT, personFields: [], auto: false, imported: {} };
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
    if (typeof l.error === 'string') out.last.error = l.error;
  }
  return out;
}

/** El nombre de un proyecto de Logday como lo guarda `createProject`. */
export function projectSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[\\/]/g, '-').replace(/\s+/g, '-') || DEFAULT_PROJECT;
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

export function parseWorkPackages(body: string): WorkPackagePage {
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
    items.push({
      id: String(el.id),
      subject: (str(el.subject) ?? '').trim(),
      description: (desc ?? '').trim(),
      ...(due ? { due } : {}),
      status: linkTitle(links, 'status'),
      type: linkTitle(links, 'type'),
      priority: linkTitle(links, 'priority'),
      project: linkTitle(links, 'project'),
    });
  }
  return { items, total: typeof json.total === 'number' ? json.total : items.length };
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

/** P5: título, código `OP-<id>`, fecha, y en el cuerpo los datos del work
 *  package, el enlace y la descripción. */
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
    taskCode: `OP-${wp.id}`,
    content,
    due: wp.due,
  };
}
