export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;
  title: string;
  taskCode?: string; // optional unique code, e.g. "FEAT-01"
  status: TaskStatus;
  tags: string[];
  project: string;
  // Marcas: instante UTC (toISOString) o YYYY-MM-DD legado (fecha local).
  // Leerlas con los helpers de lib/localDate.ts (stampToLocalDate, stampSortKey).
  created: string;
  completedAt?: string; // solo cuenta si status === 'done'
  due?: string;      // YYYY-MM-DD
  linked_paths: string[];
  content: string;   // markdown body
  filePath: string;  // absolute path to .md file
}
