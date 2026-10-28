import { Language } from './common';
import { Theme, CustomTheme } from './theme';
import { OvertimeMonthMeta } from './overtime';

export type ViewMode = 'list' | 'kanban' | 'calendar';
export type ActiveSection = 'dashboard' | 'tasks' | 'notes' | 'dailys' | 'overtime';
export type StartupScreen = 'dashboard' | 'dailys' | 'tasks' | 'notes' | 'overtime';

export interface Shortcuts {
  newNote: string;
  newTask: string;
  search: string;
  newDaily: string;
  markAbsence: string;
}

export const DEFAULT_SHORTCUTS: Shortcuts = { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' };

/** Cómo se muestran las notas: 'list' (barra de carpetas + lista de
 *  notas, estilo Notas de Apple) o 'tree' (carpetas y notas en un árbol
 *  en la barra lateral, estilo Obsidian). */
export type NotesView = 'list' | 'tree';
export type NoteSortBy = 'updated' | 'created' | 'title';
export type NoteSortDir = 'desc' | 'asc';
/** Orden de la lista de tareas: 'due' agrupa por vencimiento. */
export type TaskSortBy = 'due' | 'created' | 'title';

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
  trashAutoPurgeEnabled?: boolean;
  sidebarLabelsVisible?: boolean;
  /** Vista de notas elegida en Opciones; se usa la primera vez. */
  notesViewDefault?: NotesView;
  /** Última vista usada (el botón de la barra lateral); se recuerda. */
  notesView?: NotesView;
  noteSortBy?: NoteSortBy;
  noteSortDir?: NoteSortDir;
  taskSortBy?: TaskSortBy;
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
  customThemes?: CustomTheme[];
}
