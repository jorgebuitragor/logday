// Las tareas de todos los proyectos, leídas de disco: el store solo tiene
// las del proyecto abierto (`tasks` según `activeProject`). Lo usan las
// herramientas MCP y el selector de tarea del Pomodoro (specs/pomodoro,
// hallazgo 5). Solo lee.
import type { Task } from '../types/task';
import { useAppStore, projectDir, readTaskFromPath } from '../store/appStore';
import { fs } from './invoke';

async function readProjectTasks(basePath: string, project: string): Promise<Task[]> {
  try {
    const entries = await fs.listDir(projectDir(basePath, project));
    const files = entries.filter((e) => !e.is_dir && e.name.endsWith('.md'));
    const tasks = await Promise.all(files.map((f) => readTaskFromPath(f.path)));
    return tasks.filter((t): t is Task => t !== null);
  } catch {
    return [];
  }
}

/** Lanza si Logday todavía no tiene carpeta de datos. */
export async function readAllTasks(): Promise<Task[]> {
  const { basePath, projects } = useAppStore.getState();
  if (!basePath) throw new Error('Logday has no data folder yet');
  const lists = await Promise.all(projects.map((p) => readProjectTasks(basePath, p)));
  return lists.flat();
}
