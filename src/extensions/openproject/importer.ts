// Importar los work packages asignados como tareas de Logday
// (specs/openproject P4–P8).
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { nowInstant } from '../../lib/localDate';
import {
  OPENPROJECT_ID, UnexpectedFormatError, parseWorkPackages, projectSlug, readOpenProjectSettings, workPackageToTask,
  type WorkPackage,
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

let importing: Promise<number> | null = null;

/** Importa lo nuevo y devuelve cuántas tareas creó. Si ya hay una
 *  importación en curso, espera esa en vez de empezar otra. */
export function importFromOpenProject(): Promise<number> {
  importing ??= run().finally(() => { importing = null; });
  return importing;
}

async function run(): Promise<number> {
  const store = useAppStore.getState;
  const settings = readOpenProjectSettings(store().extensions[OPENPROJECT_ID]?.settings);
  try {
    if (!settings.account || !settings.baseUrl) throw 'needs_connect';
    // 1. Todos los abiertos donde está el usuario (P4, P4b).
    const byId = new Map<string, WorkPackage>();
    for (const role of [...ROLES, ...settings.personFields.map((f) => f.id)]) {
      let seen = 0;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { items, total } = parseWorkPackages(await invoke<string>('openproject_work_packages', { role, page }));
        for (const wp of items) if (!byId.has(wp.id)) byId.set(wp.id, wp);
        seen += items.length;
        if (!items.length || seen >= total) break;
      }
    }
    const all = [...byId.values()];
    // 2. P6: nunca dos veces el mismo, aunque cambie en OpenProject.
    const pending = all.filter((wp) => !settings.imported[wp.id]).reverse();

    // 3. El proyecto, si no existe.
    const project = projectSlug(settings.project);
    if (pending.length && !store().projects.includes(project)) {
      await store().createProject(project);
    }

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
    let created = 0;
    // Del más viejo al más nuevo, para que la lista quede en orden.
    for (const wp of pending) {
      const { title, taskCode, content, due } = workPackageToTask(wp, settings.baseUrl, texts);
      const task = await store().createTask(title, project, content, taskCode, {
        tags: ['openproject'],
        ...(due ? { due } : {}),
        open: false,
      });
      imported[wp.id] = task.id;
      created++;
      // Se guarda tras cada tarea: si algo falla a mitad, lo creado ya no
      // se repite en la próxima importación.
      await store().updateExtensionSettings(OPENPROJECT_ID, { imported });
    }
    await store().updateExtensionSettings(OPENPROJECT_ID, {
      imported,
      last: { at: nowInstant(), status: 'ok', created },
    });
    return created;
  } catch (err) {
    await store().updateExtensionSettings(OPENPROJECT_ID, { last: { at: nowInstant(), status: 'error', error: errorCode(err) } }).catch(() => {});
    throw err;
  }
}
