// Dependencias reales de las herramientas MCP: lecturas de disco y
// escrituras con las acciones del store (specs/agentes-mcp R14).
import type { Task } from '../../types/task';
import { useAppStore, projectDir, readTaskFromPath, dailyMonthFilePath } from '../../store/appStore';
import { fs } from '../../lib/invoke';
import { parseDailyFile } from '../../lib/dailyFileFormat';
import { localISODate } from '../../lib/localDate';
import type { LogdayToolDeps } from './tools';

function basePathOrThrow(): string {
  const { basePath } = useAppStore.getState();
  if (!basePath) throw new Error('Logday has no data folder yet');
  return basePath;
}

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

export const storeToolDeps: LogdayToolDeps = {
  listProjects: async () => useAppStore.getState().projects,

  readAllTasks: async () => {
    const basePath = basePathOrThrow();
    const lists = await Promise.all(useAppStore.getState().projects.map((p) => readProjectTasks(basePath, p)));
    return lists.flat();
  },

  createTask: ({ title, project, content, due, tags, status }) =>
    // `open: false`: lo que crea el agente no le cambia la tarea abierta al usuario.
    useAppStore.getState().createTask(title, project, content, undefined, { due, tags, status, open: false }),

  updateTask: (next, prev) => useAppStore.getState().updateTask(next, { prev }),

  readDaily: async (date) => {
    const basePath = basePathOrThrow();
    try {
      const raw = await fs.readFile(dailyMonthFilePath(basePath, date.slice(0, 4), date.slice(5, 7)));
      return parseDailyFile(raw)[date] ?? '';
    } catch {
      return ''; // el mes todavía no tiene archivo
    }
  },

  saveDaily: (date, text, base) => useAppStore.getState().saveDailyEntry(date, text, base),

  today: () => localISODate(),
};
