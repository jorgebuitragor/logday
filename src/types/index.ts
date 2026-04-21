export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type ViewMode = 'list' | 'kanban' | 'calendar';
export type Theme = 'dark' | 'light' | 'system';
export type ActiveSection = 'tasks' | 'notes' | 'dailys' | 'overtime';

export interface Shortcuts {
  newNote: string;
  newTask: string;
  search: string;
}

export const DEFAULT_SHORTCUTS: Shortcuts = { newNote: 'n', newTask: 't', search: 'f' };

export interface DailyEntry {
  date: string;       // YYYY-MM-DD
  activities: string; // texto libre con bullets
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  tags: string[];
  project: string;
  created: string;   // YYYY-MM-DD
  due?: string;      // YYYY-MM-DD
  linked_paths: string[];
  content: string;   // markdown body
  filePath: string;  // absolute path to .md file
}

export interface Note {
  id: string;
  title: string;
  folder: string;    // '' = unfiled (root)
  tags: string[];
  created: string;   // YYYY-MM-DD
  updated: string;   // YYYY-MM-DD
  pinned: boolean;
  content: string;
  filePath: string;
}

export interface OvertimeEntry {
  id: string;
  fecha: string;           // YYYY-MM-DD
  solicitadaPor: string;
  actividad: string;
  observaciones: string;
  horaInicio: string;      // HH:MM
  horaFinal: string;       // HH:MM
  totalHoras: number;
  extrasDiurnas: number;
  extrasNocturnas: number;
  extrasDiurnasFestivas: number;
  extrasNocturnasFestivas: number;
}

export interface OvertimeMonthMeta {
  colaborador: string;
  cedula: string;
}

export interface AppConfig {
  basePath: string;
  lastOpenedProject?: string;
  lastOpenedNoteFolder?: string;
}

export interface GitConfig {
  enabled: boolean;
  remote: string;
  autoCommitHourly: boolean;
  autoPushDaily: boolean;
  userName: string;
  userEmail: string;
}

export type GitStatus = 'idle' | 'synced' | 'pending' | 'error';
export type GitRemoteStatus = 'unknown' | 'synced' | 'behind' | 'ahead' | 'diverged' | 'offline';

export interface SearchResult {
  path: string;
  content: string;
}
