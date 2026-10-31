// Vista con que abre Tareas (specs/navegacion-secciones NS22). La vista
// actual (`currentView`) no se guarda: cada inicio arranca en la elegida en
// Opciones → Navegación, y cambiar de vista mientras se usa la app no la
// modifica.
import type { AppConfig, ViewMode } from '../types/config';

export const TASK_VIEW_MODES: readonly ViewMode[] = ['list', 'kanban', 'calendar'];

/** Lo guardado en `config.json`; cualquier otra cosa (o nada), la lista. */
export function parseTasksViewDefault(value: unknown): ViewMode {
  return TASK_VIEW_MODES.includes(value as ViewMode) ? (value as ViewMode) : 'list';
}

/** La preferencia y la vista con que abre Tareas al leer la config. */
export function initialTasksView(cfg: Pick<AppConfig, 'tasksViewDefault'> | null | undefined): {
  tasksViewDefault: ViewMode;
  currentView: ViewMode;
} {
  const tasksViewDefault = parseTasksViewDefault(cfg?.tasksViewDefault);
  return { tasksViewDefault, currentView: tasksViewDefault };
}
