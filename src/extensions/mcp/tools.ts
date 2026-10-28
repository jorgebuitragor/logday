// Herramientas MCP de Logday (specs/agentes-mcp R10–R15). No tocan el
// store directamente: reciben sus dependencias (`storeTools.ts` en la app,
// fakes en las pruebas). Las descripciones van en inglés porque son
// protocolo para el agente, no texto de interfaz.
import type { Task, TaskStatus } from '../../types/task';
import { stampSortKey } from '../../lib/localDate';

export interface NewTaskInput {
  title: string;
  project: string;
  content: string;
  due?: string;
  tags: string[];
  status: TaskStatus;
}

export interface LogdayToolDeps {
  listProjects: () => Promise<string[]>;
  /** Todas las tareas, leídas de disco (el store solo tiene las del
   *  proyecto activo). */
  readAllTasks: () => Promise<Task[]>;
  createTask: (input: NewTaskInput) => Promise<Task>;
  /** `prev` es la tarea tal como está en disco, para D2 y el sync. */
  updateTask: (next: Task, prev: Task) => Promise<Task | undefined>;
  /** Texto del daily de la fecha, o '' si no hay. */
  readDaily: (date: string) => Promise<string>;
  /** `saveDailyEntry(date, text, base)`: devuelve el texto ya mezclado. */
  saveDaily: (date: string, text: string, base: string) => Promise<string>;
  /** Hoy, `YYYY-MM-DD` en hora local. */
  today: () => string;
}

/** Error de la herramienta (R15): se devuelve con `isError: true`. */
export class ToolError extends Error {}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Solo aparece con "Permitir cambios" (R11, R12). */
  write: boolean;
  run: (args: Record<string, unknown>, deps: LogdayToolDeps) => Promise<unknown>;
}

const STATUSES: readonly TaskStatus[] = ['todo', 'in-progress', 'done'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ── Validación de argumentos ──────────────────────────────────────────

function optString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new ToolError(`"${key}" must be a string`);
  return v;
}

function reqString(args: Record<string, unknown>, key: string): string {
  const v = optString(args, key);
  if (!v || !v.trim()) throw new ToolError(`"${key}" is required`);
  return v;
}

function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function optDate(args: Record<string, unknown>, key: string): string | undefined {
  const v = optString(args, key);
  if (v !== undefined && !isCalendarDate(v)) throw new ToolError(`"${key}" must be a date YYYY-MM-DD`);
  return v;
}

function optStatus(args: Record<string, unknown>, key: string): TaskStatus | undefined {
  const v = optString(args, key);
  if (v !== undefined && !STATUSES.includes(v as TaskStatus)) {
    throw new ToolError(`"${key}" must be one of: ${STATUSES.join(', ')}`);
  }
  return v as TaskStatus | undefined;
}

function optTags(args: Record<string, unknown>, key: string): string[] | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new ToolError(`"${key}" must be an array of strings`);
  }
  return v.map((x) => x.trim()).filter(Boolean);
}

function optLimit(args: Record<string, unknown>): number {
  const v = args.limit;
  if (v === undefined || v === null) return DEFAULT_LIMIT;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new ToolError('"limit" must be a positive integer');
  return Math.min(v, MAX_LIMIT);
}

async function requireProject(deps: LogdayToolDeps, project: string): Promise<void> {
  const projects = await deps.listProjects();
  if (!projects.includes(project)) {
    throw new ToolError(`Project "${project}" does not exist. Projects: ${projects.join(', ') || '(none)'}`);
  }
}

async function findTask(deps: LogdayToolDeps, id: string): Promise<Task> {
  const task = (await deps.readAllTasks()).find((t) => t.id === id);
  if (!task) throw new ToolError(`Task "${id}" does not exist`);
  return task;
}

// ── Forma de las respuestas ───────────────────────────────────────────

function taskSummary(t: Task) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    project: t.project,
    ...(t.taskCode ? { taskCode: t.taskCode } : {}),
    ...(t.due ? { due: t.due } : {}),
    tags: t.tags,
    created: t.created,
    ...(t.status === 'done' && t.completedAt ? { completedAt: t.completedAt } : {}),
  };
}

const taskDetail = (t: Task) => ({ ...taskSummary(t), content: t.content });

const STRING = { type: 'string' } as const;
const DATE = { type: 'string', description: 'Calendar date YYYY-MM-DD (local time)' } as const;
const STATUS = { type: 'string', enum: STATUSES } as const;
const TAGS = { type: 'array', items: STRING } as const;

// ── Herramientas ──────────────────────────────────────────────────────

export const LOGDAY_TOOLS: readonly ToolDef[] = [
  {
    name: 'list_projects',
    description: 'List the project names in Logday. Subprojects use "/" (e.g. "work/api").',
    inputSchema: { type: 'object', properties: {} },
    write: false,
    run: async (_args, deps) => ({ projects: await deps.listProjects() }),
  },
  {
    name: 'list_tasks',
    description:
      'List Logday tasks (without their content), newest first. Filter by project (includes its subprojects), ' +
      'status, or a text that matches the title, task code or tags.',
    inputSchema: {
      type: 'object',
      properties: {
        project: STRING,
        status: STATUS,
        query: STRING,
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, description: `Default ${DEFAULT_LIMIT}` },
      },
    },
    write: false,
    run: async (args, deps) => {
      const project = optString(args, 'project');
      const status = optStatus(args, 'status');
      const query = optString(args, 'query')?.trim().toLowerCase();
      const limit = optLimit(args);
      if (project) await requireProject(deps, project);
      const matches = (await deps.readAllTasks())
        .filter((t) => !project || t.project === project || t.project.startsWith(project + '/'))
        .filter((t) => !status || t.status === status)
        .filter((t) => !query || [t.title, t.taskCode ?? '', ...t.tags].some((s) => s.toLowerCase().includes(query)))
        // `created` mezcla instantes y YYYY-MM-DD legados: ver localDate.ts.
        .sort((a, b) => stampSortKey(b.created) - stampSortKey(a.created));
      return { total: matches.length, tasks: matches.slice(0, limit).map(taskSummary) };
    },
  },
  {
    name: 'get_task',
    description: 'Get one Logday task by id, including its Markdown content.',
    inputSchema: { type: 'object', properties: { id: STRING }, required: ['id'] },
    write: false,
    run: async (args, deps) => taskDetail(await findTask(deps, reqString(args, 'id'))),
  },
  {
    name: 'get_daily',
    description: 'Get the text of the daily log for a date (today by default). Returns an empty text if there is none.',
    inputSchema: { type: 'object', properties: { date: DATE } },
    write: false,
    run: async (args, deps) => {
      const date = optDate(args, 'date') ?? deps.today();
      return { date, text: await deps.readDaily(date) };
    },
  },
  {
    name: 'create_task',
    description: 'Create a task in Logday. The project defaults to "inbox".',
    inputSchema: {
      type: 'object',
      properties: { title: STRING, project: STRING, content: { type: 'string', description: 'Markdown' }, due: DATE, tags: TAGS, status: STATUS },
      required: ['title'],
    },
    write: true,
    run: async (args, deps) => {
      const title = reqString(args, 'title').trim();
      const project = optString(args, 'project')?.trim() || 'inbox';
      const input: NewTaskInput = {
        title,
        project,
        content: optString(args, 'content') ?? '',
        due: optDate(args, 'due'),
        tags: optTags(args, 'tags') ?? [],
        status: optStatus(args, 'status') ?? 'todo',
      };
      if (optString(args, 'project')) await requireProject(deps, project);
      return taskDetail(await deps.createTask(input));
    },
  },
  {
    name: 'update_task',
    description:
      'Update a Logday task by id. Send only the fields to change: title, status, due (null removes it), ' +
      'tags (replaces them) or content (replaces the Markdown body).',
    inputSchema: {
      type: 'object',
      properties: {
        id: STRING,
        title: STRING,
        status: STATUS,
        due: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null to remove' },
        tags: TAGS,
        content: STRING,
      },
      required: ['id'],
    },
    write: true,
    run: async (args, deps) => {
      const id = reqString(args, 'id');
      const title = optString(args, 'title');
      if (title !== undefined && !title.trim()) throw new ToolError('"title" cannot be empty');
      const status = optStatus(args, 'status');
      const removeDue = args.due === null;
      const due = removeDue ? undefined : optDate(args, 'due');
      const tags = optTags(args, 'tags');
      const content = optString(args, 'content');
      if ([title, status, due, tags, content].every((v) => v === undefined) && !removeDue) {
        throw new ToolError('Nothing to update: send at least one of title, status, due, tags or content');
      }
      const prev = await findTask(deps, id);
      const next: Task = {
        ...prev,
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(status ? { status } : {}),
        ...(due ? { due } : {}),
        ...(tags ? { tags } : {}),
        ...(content !== undefined ? { content } : {}),
      };
      if (removeDue) delete next.due;
      const saved = await deps.updateTask(next, prev);
      // El store devuelve undefined si rechaza el cambio (código repetido).
      if (!saved) throw new ToolError('Logday rejected the change (duplicate task code?)');
      return taskDetail(saved);
    },
  },
  {
    name: 'append_to_daily',
    description: 'Append text as new line(s) at the end of the daily log for a date (today by default).',
    inputSchema: { type: 'object', properties: { text: STRING, date: DATE }, required: ['text'] },
    write: true,
    run: async (args, deps) => {
      const text = reqString(args, 'text').replace(/\s+$/, '');
      const date = optDate(args, 'date') ?? deps.today();
      const base = await deps.readDaily(date);
      const next = !base ? text : base.endsWith('\n') ? base + text : `${base}\n${text}`;
      return { date, text: await deps.saveDaily(date, next, base) };
    },
  },
];
