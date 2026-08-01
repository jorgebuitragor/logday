export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;
  title: string;
  taskCode?: string; // optional unique code, e.g. "FEAT-01"
  status: TaskStatus;
  tags: string[];
  project: string;
  created: string;   // YYYY-MM-DD
  completedAt?: string; // YYYY-MM-DD
  due?: string;      // YYYY-MM-DD
  linked_paths: string[];
  content: string;   // markdown body
  filePath: string;  // absolute path to .md file
}
