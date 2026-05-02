export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type ViewMode = 'list' | 'kanban' | 'calendar';
export type Theme = 'dark' | 'light' | 'system' | 'high-contrast' | 'visual-rest';
export type ActiveSection = 'dashboard' | 'tasks' | 'notes' | 'dailys' | 'overtime';
export type StartupScreen = 'dashboard' | 'dailys' | 'tasks' | 'notes' | 'overtime';
export type Language = 'es' | 'en';

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
  completedAt?: string; // YYYY-MM-DD
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
  startupScreen?: StartupScreen;
  language?: Language;
  confirmDestructiveActions?: boolean;
  notificationsEnabled?: boolean;
  defaultReminderMinutes?: number;
  workWeekDays?: 5 | 6;
  holidaysAsNonWork?: boolean;
  animationsEnabled?: boolean;
}

export interface BackupSettings {
  language?: Language;
  startupScreen?: StartupScreen;
  confirmDestructiveActions?: boolean;
  theme?: Theme;
  fontSize?: number;
  shortcuts?: Partial<Shortcuts>;
  folderTags?: Record<string, string[]>;
  overtimeMeta?: OvertimeMonthMeta;
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

export type ToastKind = 'success' | 'error' | 'info';

export interface AppToast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  exiting?: boolean;
}

export interface SearchResult {
  path: string;
  content: string;
}

export type EventColor = 'indigo' | 'amber' | 'emerald' | 'rose' | 'sky' | 'violet';
export type EventRepeat = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;              // YYYY-MM-DD
  time: string;              // HH:MM   ('' = todo el día)
  description: string;
  color: EventColor;
  reminderMinutes: number;   // 0 = sin recordatorio
  repeat: EventRepeat;       // 'none' = sin repetición
}
