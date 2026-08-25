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
}

export const DEFAULT_SHORTCUTS: Shortcuts = { newNote: 'n', newTask: 't', search: 'f' };

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
