import { Language } from './common';
import { Theme, CustomTheme } from './theme';
import { OvertimeMonthMeta } from './overtime';
import type { ExtensionSection, ExtensionsConfig } from '../extensions/types';
import type { SavedSection, SidebarStyle } from '../components/sidebar/sectionOrder';

export type ViewMode = 'list' | 'kanban' | 'calendar';
/** Secciones fijas del menú lateral. */
export type CoreSection = 'dashboard' | 'tasks' | 'notes' | 'dailys' | 'overtime';
/** Una sección fija o la vista de una extensión activa (`ext:<id>`). */
export type ActiveSection = CoreSection | ExtensionSection;
/** Igual que `ActiveSection`; una extensión desactivada se resuelve a
 *  Inicio al cargar la config (specs/extensiones R13). */
export type StartupScreen = ActiveSection;

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
  /** Antes de specs/navegacion-secciones: los textos de la fila de
   *  secciones. Ya no se lee ni se escribe (NS5); queda en el tipo porque
   *  aparece en configs viejas. */
  sidebarLabelsVisible?: boolean;
  /** Estilo de las secciones del menú (NS1). Sin él, la Barra de íconos. */
  sidebarStyle?: SidebarStyle;
  /** Orden y visibilidad de las secciones (NS7, NS9). Sin él, el orden
   *  por defecto. */
  sidebarSections?: SavedSection[];
  /** Vista de notas elegida en Opciones; se usa la primera vez. */
  notesViewDefault?: NotesView;
  /** Última vista usada (el botón de la barra lateral); se recuerda. */
  notesView?: NotesView;
  noteSortBy?: NoteSortBy;
  noteSortDir?: NoteSortDir;
  taskSortBy?: TaskSortBy;
  /** Extensiones: activación, aviso aceptado y configuración no secreta.
   *  Local, no se sincroniza; los secretos van en el llavero
   *  (specs/extensiones R9, R10). */
  extensions?: ExtensionsConfig;
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
  /** Sin secretos: la URL de un webhook no viaja en el backup (R10). */
  extensions?: ExtensionsConfig;
}
