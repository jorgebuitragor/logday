// Importar los work packages asignados como tareas de Logday
// (specs/openproject P4–P8).
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { nowInstant } from '../../lib/localDate';
import type { Task } from '../../types/task';
import { fs } from '../../lib/invoke';
import { projectDir, readTaskFromPath } from '../../store/appStore';
import {
  OPENPROJECT_ID, UnexpectedFormatError, parseProjectIds, parseWorkPackageRef, parseWorkPackages, placement, projectSlug,
  readOpenProjectSettings, workPackageToTask, type Managed, type WorkPackage,
} from './model';

const MAX_PAGES = 20; // como en Rust: hasta 2000 por rol
/** P4: asignado o responsable, y los campos de persona elegidos (P4b). La
 *  API solo une filtros con "y", así que es una consulta por campo, y un
 *  work package que sale en varias entra una sola vez. */
const ROLES = ['assignee', 'responsible'] as const;

function errorCode(err: unknown): string {
  if (err instanceof UnexpectedFormatError) return 'unexpected_format';
  return typeof err === 'string' ? err : 'unknown';
}

/** Todas las páginas de una consulta (P4). */
async function fetchAll(role: string, codeField: string | undefined, project?: number): Promise<WorkPackage[]> {
  const out: WorkPackage[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await invoke<string>('openproject_work_packages', { role, project: project ?? null, page });
    const { items, total } = parseWorkPackages(body, codeField);
    out.push(...items);
    if (!items.length || out.length >= total) break;
  }
  return out;
}

async function activeProjects(): Promise<number[]> {
  const ids: number[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { ids: pageIds, total } = parseProjectIds(await invoke<string>('openproject_projects', { page }));
    ids.push(...pageIds);
    if (!pageIds.length || ids.length >= total) break;
  }
  return ids;
}

// Un proyecto donde no está el campo, o que ya no se puede ver: se salta.
const SKIP_PROJECT = new Set(['bad_request', 'forbidden', 'not_found']);

/** Las tareas de un proyecto de Logday, leídas del disco: la lista del
 *  store solo tiene las del proyecto que se está viendo. */
async function readProjectTasks(basePath: string, project: string): Promise<Task[]> {
  try {
    const entries = await fs.listDir(projectDir(basePath, project));
    const tasks = await Promise.all(entries.filter((e) => !e.is_dir && e.name.endsWith('.md')).map((e) => readTaskFromPath(e.path)));
    return tasks.filter((t): t is Task => t !== null);
  } catch {
    return [];
  }
}

export interface ImportResult {
  created: number;
  updated: number;
}

let importing: Promise<ImportResult> | null = null;

/** Importa lo nuevo, corrige lo ya importado (P5c) y devuelve cuántas
 *  tareas creó y corrigió. Si ya hay una importación en curso, espera esa
 *  en vez de empezar otra. */
export function importFromOpenProject(): Promise<ImportResult> {
  importing ??= run().finally(() => { importing = null; });
  return importing;
}

async function run(): Promise<ImportResult> {
  const store = useAppStore.getState;
  const settings = readOpenProjectSettings(store().extensions[OPENPROJECT_ID]?.settings);
  try {
    if (!settings.account || !settings.baseUrl) throw 'needs_connect';
    const codeField = settings.codeField?.id;
    // 1. Todos los abiertos donde está el usuario (P4, P4b).
    const byId = new Map<string, WorkPackage>();
    const add = (items: WorkPackage[]) => { for (const wp of items) if (!byId.has(wp.id)) byId.set(wp.id, wp); };
    for (const role of ROLES) add(await fetchAll(role, codeField));
    // P4b: un campo personalizado que no está en todos los proyectos solo
    // se acepta dentro de cada uno (en la FCV, fuera: "Cf 11 no existe").
    let projects: number[] | null = null;
    for (const field of settings.personFields) {
      try {
        add(await fetchAll(field.id, codeField));
      } catch (err) {
        if (err !== 'bad_request') throw err;
        projects ??= await activeProjects();
        for (const project of projects) {
          try {
            add(await fetchAll(field.id, codeField, project));
          } catch (e) {
            if (typeof e !== 'string' || !SKIP_PROJECT.has(e)) throw e;
          }
        }
      }
    }
    const all = [...byId.values()];

    // 2. P5b: la épica de cada uno, mirando el tipo de sus ancestros (cada
    //    ancestro se pide una vez). Uno que no se puede leer no detiene nada.
    const refs = new Map<string, { type?: string; subject: string } | undefined>();
    for (const id of new Set(all.flatMap((wp) => wp.ancestors))) {
      try {
        refs.set(id, parseWorkPackageRef(await invoke<string>('openproject_work_package', { id: Number(id) })));
      } catch (err) {
        if (typeof err !== 'string') throw err;
        refs.set(id, undefined);
      }
    }
    const base = projectSlug(settings.project);
    const projectOf = new Map(all.map((wp) => [wp.id, placement(wp, base, (id) => refs.get(id))]));

    // 3. Los proyectos que falten: el elegido y una carpeta por épica.
    const ensureProject = async (path: string) => {
      if (store().projects.includes(path)) return;
      const [parent, child] = path.includes('/') ? [path.slice(0, path.indexOf('/')), path.slice(path.indexOf('/') + 1)] : ['', path];
      if (parent && !store().projects.includes(parent)) await store().createProject(parent);
      await store().createProject(child, parent);
    };

    // Los códigos ya en uso: un código repetido se cambia por OP-<número>
    // (Logday no deja dos tareas con el mismo código).
    const basePath = store().basePath;
    if (!basePath) throw 'needs_connect';
    const known = (await Promise.all(store().projects.map((p) => readProjectTasks(basePath, p)))).flat();
    const codeOwner = new Map(known.filter((t) => t.taskCode).map((t) => [t.taskCode!, t.id]));
    const codeFor = (wp: WorkPackage, taskId?: string) => {
      const wanted = wp.code ?? `OP-${wp.id}`;
      const owner = codeOwner.get(wanted);
      return owner && owner !== taskId ? `OP-${wp.id}` : wanted;
    };

    const language = store().language;
    const texts = {
      open: t(language, 'openproject', 'taskOpen'),
      project: t(language, 'openproject', 'taskProject'),
      type: t(language, 'openproject', 'taskType'),
      status: t(language, 'openproject', 'taskStatus'),
      priority: t(language, 'openproject', 'taskPriority'),
      untitled: t(language, 'openproject', 'taskUntitled'),
    };
    const imported = { ...settings.imported };
    const managed = { ...settings.managed };
    const save = () => store().updateExtensionSettings(OPENPROJECT_ID, { imported, managed });

    // 4. P5c: las ya importadas se corrigen (código y proyecto) solo si el
    //    usuario no los cambió: si siguen como los dejó la importación.
    let updated = 0;
    const byTask = new Map(known.map((t) => [t.id, t]));
    for (const wp of all) {
      const taskId = imported[wp.id];
      const task = taskId ? byTask.get(taskId) : undefined;
      if (!task) continue;
      // Las importadas antes de P5c quedaron con OP-<número> en el proyecto elegido.
      const prev: Managed = managed[wp.id] ?? { code: `OP-${wp.id}`, project: base };
      const code = codeFor(wp, task.id);
      const project = projectOf.get(wp.id) ?? base;
      const next: Task = { ...task };
      if ((task.taskCode ?? '') === prev.code && code !== prev.code) next.taskCode = code;
      if (task.project === prev.project && project !== prev.project) next.project = project;
      if (next.taskCode !== task.taskCode || next.project !== task.project) {
        if (next.project !== task.project) await ensureProject(next.project);
        if (next.taskCode !== task.taskCode) {
          if (task.taskCode) codeOwner.delete(task.taskCode);
          if (next.taskCode) codeOwner.set(next.taskCode, task.id);
        }
        await store().updateTask(next, { prev: task });
        updated++;
      }
      // Lo que el usuario cambió queda como lo dejó la importación: así no
      // se confunde con un valor puesto por ella y no se vuelve a tocar.
      managed[wp.id] = {
        code: (task.taskCode ?? '') === prev.code ? (next.taskCode ?? '') : prev.code,
        project: task.project === prev.project ? next.project : prev.project,
      };
      await save();
    }

    // 5. P6: los nuevos, una sola vez; del más viejo al más nuevo, para que
    //    la lista quede en orden.
    let created = 0;
    for (const wp of all.filter((w) => !imported[w.id]).reverse()) {
      const project = projectOf.get(wp.id) ?? base;
      await ensureProject(project);
      const { title, content, due } = workPackageToTask(wp, settings.baseUrl, texts);
      const taskCode = codeFor(wp);
      const task = await store().createTask(title, project, content, taskCode, {
        tags: ['openproject'],
        ...(due ? { due } : {}),
        open: false,
      });
      codeOwner.set(taskCode, task.id);
      imported[wp.id] = task.id;
      managed[wp.id] = { code: task.taskCode ?? '', project };
      created++;
      // Se guarda tras cada tarea: si algo falla a mitad, lo creado ya no
      // se repite en la próxima importación.
      await save();
    }
    await store().updateExtensionSettings(OPENPROJECT_ID, {
      imported,
      managed,
      last: { at: nowInstant(), status: 'ok', created, updated },
    });
    return { created, updated };
  } catch (err) {
    await store().updateExtensionSettings(OPENPROJECT_ID, { last: { at: nowInstant(), status: 'error', error: errorCode(err) } }).catch(() => {});
    throw err;
  }
}
