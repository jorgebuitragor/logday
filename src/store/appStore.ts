import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import TauriWebSocket from '@tauri-apps/plugin-websocket';
import { Task } from '../types/task';
import { Note } from '../types/note';
import { OvertimeEntry, OvertimeMonthMeta } from '../types/overtime';
import { CalendarEvent } from '../types/calendar';
import { AbsenceDay } from '../types/absence';
import { Theme, BuiltInTheme, CustomTheme } from '../types/theme';
import { GitConfig, GitStatus, GitRemoteStatus } from '../types/git';
import { SyncConfig, SyncConnectionStatus } from '../types/sync';
import { AppConfig, ViewMode, ActiveSection, StartupScreen, Shortcuts, DEFAULT_SHORTCUTS } from '../types/config';
import { Language, AppToast, ToastKind } from '../types/common';
import { deriveCustomThemeVars } from '../lib/themeColor';
import { calcOvertimeBreakdown } from '../lib/overtimeCalc';
import { parseDailyFile, serializeDailyFile } from '../lib/dailyFileFormat';
import { generateOvertimeXlsx } from '../lib/overtimeExcel';
import { fs, pickFolder, pickFile, saveDialog, SearchResult } from '../lib/invoke';
import {
  login as syncLogin, SyncApiError, normalizeServerUrl, syncChangesRemote, SyncChange,
  createTaskRemote, patchTaskRemote, deleteTaskRemote,
  createNoteRemote, patchNoteRemote, deleteNoteRemote, pushNoteContentRemote,
  createCalendarEventRemote, patchCalendarEventRemote, deleteCalendarEventRemote,
  createAbsenceDayRemote, patchAbsenceDayRemote, deleteAbsenceDayRemote,
  createOvertimeEntryRemote, patchOvertimeEntryRemote, deleteOvertimeEntryRemote,
  patchOvertimeMonthMetaRemote,
  putDailyEntryContentRemote, deleteDailyEntryRemote,
} from '../lib/sync';
import {
  taskToCreatePayload, taskFieldsToPatchPayload, taskFromApiResponse, TaskApiResponse, TaskCreatePayload, TaskPatchPayload,
  noteToCreatePayload, noteFieldsToPatchPayload, noteFromApiResponse, NoteApiResponse, NoteCreatePayload, NotePatchPayload,
  calendarEventToCreatePayload, calendarEventFieldsToPatchPayload, calendarEventFromApiResponse, CalendarEventApiResponse, CalendarEventCreatePayload, CalendarEventPatchPayload,
  absenceDayToCreatePayload, absenceDayFieldsToPatchPayload, absenceDayFromApiResponse, AbsenceDayApiResponse, AbsenceDayCreatePayload, AbsenceDayPatchPayload,
  overtimeEntryToCreatePayload, overtimeEntryFieldsToPatchPayload, overtimeEntryFromApiResponse, OvertimeEntryApiResponse, OvertimeEntryCreatePayload, OvertimeEntryPatchPayload,
  overtimeMonthMetaFieldsToPatchPayload, overtimeMonthMetaFromApiResponse, OvertimeMonthMetaApiResponse, OvertimeMonthMetaPatchPayload,
  DailyEntryApiResponse,
} from '../lib/syncMapping';
import * as syncQueue from '../lib/syncQueue';
import * as contentSyncQueue from '../lib/contentSyncQueue';
import * as trash from '../lib/trash';
import { bytesToBase64, persistYDoc, applyIncomingContentState, noteContentStatePath } from '../lib/noteContentSync';
import { persistDailyYDoc, applyIncomingDailyContentState, getContentText as getDailyContentText, applyTextEdit as applyDailyTextEdit, loadPersistedDailyYDoc, deleteDailyContentState } from '../lib/dailyContentSync';
import { parseFrontmatter, serializeTask, parseNote, serializeNote, formatDate } from '../lib/markdown';
import { t } from '../lib/i18n';
import {
  toISO,
  getPreviousWorkingDay,
  buildDailyCopyText,
  dateFromISO,
} from '../lib/colombianHolidays';

interface AppState {
  // Config
  basePath: string | null;
  configDir: string | null;
  isConfigured: boolean;
  isLoading: boolean;

  // Section
  activeSection: ActiveSection;

  // Projects (tasks)
  projects: string[];
  activeProject: string | null;

  // Tasks
  tasks: Task[];
  activeTask: Task | null;

  // Notes
  notes: Note[];
  noteFolders: string[];
  activeNote: Note | null;
  activeNoteFolder: string | null; // null = all notes

  // Dailys
  dailyEntries: Record<string, string>; // YYYY-MM-DD → activities text
  dailyMonths: string[];                // YYYY-MM sorted desc (meses con entradas)
  activeDailyDate: string | null;       // YYYY-MM-DD seleccionado
  activeDailyMonth: string;             // YYYY-MM visible en DailyList

  // Overtime
  overtimeEntries: OvertimeEntry[];
  overtimeMonth: string;              // YYYY-MM
  overtimeMonths: string[];           // YYYY-MM[] con entradas, desc
  overtimeMeta: OvertimeMonthMeta;

  // Calendar Events
  calendarEvents: CalendarEvent[];
  activeCalendarEvent: CalendarEvent | null;
  absenceDays: AbsenceDay[];

  // UI
  currentView: ViewMode;
  isSearchOpen: boolean;
  searchQuery: string;
  searchResults: Task[];
  isSidebarCollapsed: boolean;
  toasts: AppToast[];
  confirmDestructiveActions: boolean;

  // Notificaciones
  notificationsEnabled: boolean;
  defaultReminderMinutes: number;

  // Semana laboral
  workWeekDays: 5 | 6;
  holidaysAsNonWork: boolean;

  // Accesibilidad
  animationsEnabled: boolean;

  // Papelera de reciclaje
  trashAutoPurgeEnabled: boolean;

  // Theme + Settings
  theme: Theme;
  customThemes: CustomTheme[];
  startupScreen: StartupScreen;
  language: Language;
  fontSize: number;
  isSettingsOpen: boolean;
  shortcuts: Shortcuts;

  // Git
  gitConfig: GitConfig;
  gitStatus: GitStatus;
  gitRemoteStatus: GitRemoteStatus;
  lastCommitTime: string | null;
  isGitOpen: boolean;

  // Sync (logday-server)
  syncConfig: SyncConfig;
  syncConnectionStatus: SyncConnectionStatus;
  syncErrorMsg: string;
  isSyncOpen: boolean;

  // ── Actions ──────────────────────────────────────────────────

  init: () => Promise<void>;
  setupBasePath: () => Promise<void>;
  changeBasePath: () => Promise<void>;

  // Tasks
  loadProjects: () => Promise<void>;
  loadTasks: (project?: string | null) => Promise<void>;
  selectProject: (project: string | null) => void;
  createProject: (name: string, parent?: string) => Promise<void>;
  renameProject: (project: string, newName: string) => Promise<void>;
  deleteProject: (project: string) => Promise<void>;
  moveProject: (project: string, targetParent: string) => Promise<void>;
  createTask: (title: string, project?: string, content?: string, taskCode?: string) => Promise<Task>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (task: Task) => Promise<void>;
  setActiveTask: (task: Task | null) => void;
  setActiveCalendarEvent: (event: CalendarEvent | null) => void;
  moveTask: (task: Task, toProject: string) => Promise<void>;

  // Notes
  folderTags: Record<string, string[]>;
  loadNoteFolders: () => Promise<void>;
  loadNotes: (folder?: string | null) => Promise<void>;
  selectNoteFolder: (folder: string | null) => Promise<void>;
  createNoteFolder: (name: string, parent?: string) => Promise<void>;
  renameNoteFolder: (folder: string, newName: string) => Promise<void>;
  deleteNoteFolder: (folder: string) => Promise<void>;
  createNote: () => Promise<Note>;
  updateNote: (note: Note) => Promise<void>;
  renameNote: (note: Note, newTitle: string) => Promise<void>;
  duplicateNote: (note: Note) => Promise<void>;
  deleteNote: (note: Note, options?: { showToast?: boolean }) => Promise<void>;
  setActiveNote: (note: Note | null) => void;
  moveNote: (note: Note, toFolder: string) => Promise<void>;
  toggleNotePin: (note: Note) => Promise<void>;
  setFolderTags: (folder: string, tags: string[]) => void;
  replaceFolderTags: (tags: Record<string, string[]>) => void;
  moveNoteFolder: (folder: string, targetParent: string) => Promise<void>;
  duplicateNoteFolder: (folder: string, targetParent: string | null) => Promise<void>;
  importNotesFromPaths: (paths: string[]) => Promise<void>;
  importNotesFromContent: (files: Array<{ name: string; content: string }>) => Promise<void>;

  // Dailys
  loadDailyMonths: () => Promise<void>;
  loadDailyMonth: (yearMonth: string) => Promise<void>;
  saveDailyEntry: (date: string, activities: string) => Promise<void>;
  setActiveDailyDate: (date: string | null) => void;
  setActiveDailyMonth: (yearMonth: string) => void;
  createTodayDaily: () => void;
  createDailyForDate: (date: string) => void;
  copyDailyFormat: (date: string) => Promise<string>;
  deleteDailyEntry: (date: string) => Promise<void>;
  deleteDailyMonth: (yearMonth: string) => Promise<void>;

  // Overtime
  loadOvertimeMonths: () => Promise<void>;
  loadOvertimeMonth: (yearMonth: string) => Promise<void>;
  saveOvertimeEntry: (entry: Omit<OvertimeEntry, 'id' | 'totalHoras' | 'extrasDiurnas' | 'extrasNocturnas' | 'extrasDiurnasFestivas' | 'extrasNocturnasFestivas'> & { id?: string }) => Promise<void>;
  deleteOvertimeEntry: (id: string) => Promise<void>;
  deleteOvertimeMonth: (yearMonth: string) => Promise<void>;
  setOvertimeMeta: (meta: Partial<OvertimeMonthMeta>) => void;
  replaceOvertimeMetaSnapshot: (meta: OvertimeMonthMeta) => void;
  exportOvertimeExcel: (yearMonth: string) => Promise<void>;

  // Calendar Events
  loadCalendarEvents: () => Promise<void>;
  saveCalendarEvent: (event: CalendarEvent) => Promise<void>;
  deleteCalendarEvent: (id: string) => Promise<void>;

  // Absences
  loadAbsenceDays: () => Promise<void>;
  saveAbsenceDay: (absence: AbsenceDay) => Promise<void>;
  deleteAbsenceDay: (id: string) => Promise<void>;

  // UI
  setSection: (section: ActiveSection) => Promise<void>;
  setView: (view: ViewMode) => void;
  toggleSearch: () => void;
  runSearch: (query: string) => Promise<void>;
  addLinkedPath: () => Promise<void>;
  removeLinkedPath: (task: Task, path: string) => Promise<void>;
  toggleSidebar: () => void;
  showToast: (toast: { kind: ToastKind; title: string; description?: string; durationMs?: number }) => string;
  preExitToast: (id: string) => void;
  dismissToast: (id: string) => void;
  setConfirmDestructiveActions: (enabled: boolean) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  setDefaultReminderMinutes: (mins: number) => Promise<void>;
  setWorkWeekDays: (days: 5 | 6) => Promise<void>;
  setHolidaysAsNonWork: (enabled: boolean) => Promise<void>;
  setAnimationsEnabled: (enabled: boolean) => Promise<void>;
  setTrashAutoPurgeEnabled: (enabled: boolean) => Promise<void>;
  listTrash: () => Promise<trash.TrashListItem[]>;
  restoreFromTrash: (entity: trash.TrashEntity, key: string) => Promise<void>;
  deleteTrashItemForever: (entity: trash.TrashEntity, key: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  createCustomTheme: (input: { name: string; base: 'dark' | 'light'; accent: string; bgTint: string; textTint: string; intensity: number }) => CustomTheme;
  renameCustomTheme: (id: string, name: string) => void;
  duplicateCustomTheme: (id: string) => void;
  deleteCustomTheme: (id: string) => void;
  updateCustomTheme: (id: string, patch: Partial<Omit<CustomTheme, 'id' | 'createdAt'>>) => void;
  replaceCustomThemes: (customThemes: CustomTheme[]) => void;
  setStartupScreen: (screen: StartupScreen) => Promise<void>;
  setLanguage: (lang: Language) => Promise<void>;
  setFontSize: (size: number) => void;
  setShortcut: (action: keyof Shortcuts, key: string) => void;
  toggleSettings: () => void;

  // Git
  saveGitConfig: (cfg: GitConfig) => void;
  gitInit: (remote: string) => Promise<void>;
  gitCommit: () => Promise<void>;
  gitPush: () => Promise<void>;
  gitPull: () => Promise<void>;
  gitFetch: () => Promise<void>;
  toggleGit: () => void;
  openSettingsGitTab: () => void;

  // Sync (logday-server)
  syncConnect: (serverUrl: string, email: string, password: string) => Promise<void>;
  syncDisconnect: () => void;
  toggleSync: () => void;
  openSettingsSyncTab: () => void;
}

// ── Helpers ────────────────────────────────────────────────────

const projectsDir = (base: string) => `${base}/projects`;
const projectDir = (base: string, p: string) => `${base}/projects/${p}`;
const notesDir = (base: string) => `${base}/notes`;
const noteFolderDir = (base: string, folder: string) => `${base}/notes/${folder}`;
const configFilePath = (dir: string) => `${dir}/config.json`;
const taskFilePath = (base: string, project: string, id: string) =>
  `${base}/projects/${project}/${id}.md`;
const noteFilePath = (base: string, folder: string, id: string) =>
  folder ? `${base}/notes/${folder}/${id}.md` : `${base}/notes/${id}.md`;

// ── Daily helpers ──────────────────────────────────────────────

const dailysBaseDir = (base: string) => `${base}/dailys`;
const dailyMonthDir = (base: string, year: string, month: string) =>
  `${base}/dailys/${year}/${month}`;
const dailyMonthFilePath = (base: string, year: string, month: string) =>
  `${base}/dailys/${year}/${month}/${year}-${month}.md`;

// ── Overtime helpers ──────────────────────────────────────────

const overtimeBaseDir = (base: string) => `${base}/overtime`;
const overtimeMonthDir = (base: string, year: string, month: string) =>
  `${base}/overtime/${year}/${month}`;
const overtimeMonthFilePath = (base: string, year: string, month: string) =>
  `${base}/overtime/${year}/${month}/${year}-${month}.md`;

// Guard para evitar cargas concurrentes del mismo mes
const loadingDailyMonths = new Set<string>();
const loadingOvertimeMonths = new Set<string>();

async function loadConfig(dir: string): Promise<AppConfig | null> {
  try {
    const raw = await fs.readFile(configFilePath(dir));
    return JSON.parse(raw) as AppConfig;
  } catch {
    return null;
  }
}

async function saveConfig(dir: string, cfg: AppConfig): Promise<void> {
  await fs.createDir(dir);
  await fs.writeFile(configFilePath(dir), JSON.stringify(cfg, null, 2));
}

/** Arma el snapshot completo de `AppConfig` desde el estado actual y lo
 *  persiste — un solo lugar, en vez de que cada setter reconstruya el
 *  objeto a mano (bug real: los setters más viejos no incluían campos
 *  agregados después, así que cambiar una opción vieja podía pisar en
 *  silencio una más nueva — ver setTrashAutoPurgeEnabled más abajo, es
 *  el motivo por el que se consolidó esto acá). Se llama DESPUÉS de que
 *  el setter ya hizo su propio `set(...)`, así que `get()` ya refleja el
 *  valor nuevo — no hace falta un parámetro de patch. */
async function persistConfig(get: SyncGet): Promise<void> {
  const {
    configDir, basePath, startupScreen, language, confirmDestructiveActions,
    notificationsEnabled, defaultReminderMinutes, workWeekDays, holidaysAsNonWork,
    animationsEnabled, trashAutoPurgeEnabled, activeProject, activeNoteFolder,
  } = get();
  if (!configDir || !basePath) return;
  await saveConfig(configDir, {
    basePath,
    startupScreen,
    language,
    confirmDestructiveActions,
    notificationsEnabled,
    defaultReminderMinutes,
    workWeekDays,
    holidaysAsNonWork,
    animationsEnabled,
    trashAutoPurgeEnabled,
    lastOpenedProject: activeProject ?? undefined,
    lastOpenedNoteFolder: activeNoteFolder ?? undefined,
  });
}

async function readTaskFromPath(filePath: string): Promise<Task | null> {
  try {
    const raw = await fs.readFile(filePath);
    return parseFrontmatter(raw, filePath);
  } catch {
    return null;
  }
}

async function readNoteFromPath(filePath: string): Promise<Note | null> {
  try {
    const raw = await fs.readFile(filePath);
    return parseNote(raw, filePath);
  } catch {
    return null;
  }
}

function parseSearchResults(results: SearchResult[]): Task[] {
  return results
    .map((r) => parseFrontmatter(r.content, r.path))
    .filter((t): t is Task => t !== null);
}

// ── Theme helpers ──────────────────────────────────────────────

export function applyFontSizeToDOM(size: number) {
  document.documentElement.style.setProperty('--app-font-size', `${size}px`);
}

export function applyAnimationsToDOM(enabled: boolean) {
  document.documentElement.classList.toggle('no-animations', !enabled);
}

const CUSTOM_THEME_VARS = [
  '--bg-base', '--bg-panel', '--bg-surface', '--bg-secondary', '--bg-hover', '--bg-elevated', '--bg-input',
  '--border', '--border-card', '--border-high',
  '--text-primary', '--text-body', '--text-secondary', '--text-tertiary', '--text-muted', '--text-hint', '--text-faint',
  '--accent', '--accent-strong', '--accent-soft', '--accent-ink', '--accent-inline', '--accent-link', '--accent-code',
] as const;

const TINTED_BUILTIN_THEMES: BuiltInTheme[] = ['high-contrast', 'visual-rest', 'sepia', 'oled', 'nordic'];

export function applyCustomThemeToDOM(customTheme: CustomTheme | null) {
  const root = document.documentElement.style;
  if (!customTheme) {
    CUSTOM_THEME_VARS.forEach((v) => root.removeProperty(v));
    return;
  }
  const vars = deriveCustomThemeVars(customTheme);
  Object.entries(vars).forEach(([k, v]) => root.setProperty(k, v));
}

export function applyThemeToDOM(theme: Theme, animate = false, customThemes: CustomTheme[] = []) {
  let resolved: BuiltInTheme;
  let custom: CustomTheme | null = null;

  if (theme.startsWith('custom:')) {
    custom = customThemes.find((t) => `custom:${t.id}` === theme) ?? null;
    resolved = custom?.base ?? 'dark';
  } else {
    resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : (theme as BuiltInTheme);
  }

  if (animate) {
    document.documentElement.classList.add('theme-animating');
    window.setTimeout(() => {
      document.documentElement.classList.remove('theme-animating');
    }, 280);
  }

  document.documentElement.dataset.theme = resolved;
  applyCustomThemeToDOM(custom);
  document.documentElement.classList.toggle(
    'theme-tinted',
    custom !== null || TINTED_BUILTIN_THEMES.includes(resolved),
  );

  try {
    const nativeTheme = theme === 'system' ? null : (resolved === 'dark' ? 'dark' : 'light');
    void getCurrentWindow().setTheme(nativeTheme).catch(() => {});
  } catch {
    // Puede ejecutarse fuera del contexto Tauri (tests o navegador)
  }
}

// ── Sync (logday-server): escritura con cola offline ───────────────
// Al crear/editar/borrar una task localmente, si sync está
// configurado se intenta mandar la escritura al servidor. Sin
// conexión (o si el envío falla) queda en cola (syncQueue.ts) para
// reintentar al reconectar — el archivo en disco ya es la fuente de
// verdad para la UI, esto es solo el side-channel hacia el servidor
// (ver specs/sync-servidor/design.md). Por ahora solo Task tiene esta
// integración — Note/Overtime/Calendar/Absence quedan para una
// siguiente pasada sobre el mismo patrón.

type SyncGet = () => AppState;
type SyncSet = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;

const TASK_FIELD_MAP: Record<string, string> = {
  title: 'title', taskCode: 'task_code', status: 'status', tags: 'tags', project: 'project',
  created: 'created', completedAt: 'completed_at', due: 'due', content: 'content',
};

/** Aplica la respuesta del servidor a la task local, campo por campo,
 *  salteando cualquier campo que ya tenga una entrada más nueva en
 *  cola ("Regla de prioridad cola vs. respuesta tardía" en
 *  design.md) — esa entrada, cuando se drene, va a traer el valor
 *  final real; pisarlo ahora con una respuesta vieja perdería la
 *  edición todavía no enviada. */
function applyTaskResponse(get: SyncGet, set: SyncSet, entityId: string, sinceIso: string, response: TaskApiResponse): void {
  const current = get().tasks.find((t) => t.id === entityId);
  if (!current) return; // se borró localmente mientras tanto, nada que actualizar
  const mapped = taskFromApiResponse(response);
  const merged = { ...current } as unknown as Record<string, unknown>;
  const mappedRecord = mapped as unknown as Record<string, unknown>;
  for (const [localKey, serverKey] of Object.entries(TASK_FIELD_MAP)) {
    if (!syncQueue.hasNewerQueuedField('task', entityId, serverKey, sinceIso)) {
      merged[localKey] = mappedRecord[localKey];
    }
  }
  const updated = merged as unknown as Task;
  set((state) => ({
    tasks: state.tasks.map((t) => (t.id === entityId ? updated : t)),
    activeTask: state.activeTask?.id === entityId ? updated : state.activeTask,
  }));
}

async function syncCreateTask(get: SyncGet, set: SyncSet, task: Task): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  const payload = taskToCreatePayload(task);
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('task', task.id, 'create', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await createTaskRemote(syncConfig.serverUrl, syncConfig.accessToken, payload);
    applyTaskResponse(get, set, task.id, queuedAt, response);
  } catch {
    syncQueue.enqueue('task', task.id, 'create', payload as unknown as Record<string, unknown>);
  }
}

async function syncPatchTask(get: SyncGet, set: SyncSet, taskId: string, fields: Partial<Task>): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled || Object.keys(fields).length === 0) return;
  const payload = taskFieldsToPatchPayload(fields);
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('task', taskId, 'patch', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await patchTaskRemote(syncConfig.serverUrl, syncConfig.accessToken, taskId, payload);
    applyTaskResponse(get, set, taskId, queuedAt, response);
  } catch {
    syncQueue.enqueue('task', taskId, 'patch', payload as unknown as Record<string, unknown>);
  }
}

async function syncDeleteTask(get: SyncGet, taskId: string): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('task', taskId, 'delete');
    return;
  }
  try {
    await deleteTaskRemote(syncConfig.serverUrl, syncConfig.accessToken, taskId);
  } catch {
    syncQueue.enqueue('task', taskId, 'delete');
  }
}

/** Solo los campos que de verdad cambiaron entre prev y next — un
 *  PATCH mandando todo pisaría, en el servidor, cualquier edición
 *  concurrente a un campo que acá ni se tocó (ver LWW por campo en
 *  logday-server). */
function diffTaskFields(prev: Task | undefined, next: Task): Partial<Task> {
  if (!prev) return { ...next };
  const fields: Partial<Task> = {};
  if (prev.title !== next.title) fields.title = next.title;
  if (prev.taskCode !== next.taskCode) fields.taskCode = next.taskCode;
  if (prev.status !== next.status) fields.status = next.status;
  if (JSON.stringify(prev.tags) !== JSON.stringify(next.tags)) fields.tags = next.tags;
  if (prev.project !== next.project) fields.project = next.project;
  if (prev.created !== next.created) fields.created = next.created;
  if (prev.completedAt !== next.completedAt) fields.completedAt = next.completedAt;
  if (prev.due !== next.due) fields.due = next.due;
  if (prev.content !== next.content) fields.content = next.content;
  return fields;
}

// ── Note (metadata) ──────────────────────────────────────────────
// content queda afuera (CRDT, ver specs/sync-servidor "CRDT") — nunca
// se lee ni se manda desde acá, se preserva el valor local tal cual.

const NOTE_FIELD_MAP: Record<string, string> = {
  title: 'title', folder: 'folder', tags: 'tags', created: 'created', updated: 'updated', pinned: 'pinned',
};

function applyNoteResponse(get: SyncGet, set: SyncSet, entityId: string, sinceIso: string, response: NoteApiResponse): void {
  const current = get().notes.find((n) => n.id === entityId);
  if (!current) return;
  const mapped = noteFromApiResponse(response);
  const merged = { ...current } as unknown as Record<string, unknown>;
  const mappedRecord = mapped as unknown as Record<string, unknown>;
  for (const [localKey, serverKey] of Object.entries(NOTE_FIELD_MAP)) {
    if (!syncQueue.hasNewerQueuedField('note', entityId, serverKey, sinceIso)) {
      merged[localKey] = mappedRecord[localKey];
    }
  }
  const updated = merged as unknown as Note;
  set((state) => ({
    notes: state.notes.map((n) => (n.id === entityId ? updated : n)),
    activeNote: state.activeNote?.id === entityId ? updated : state.activeNote,
  }));
  if (response.content_state) void applyNoteContentUpdate(get, set, entityId, response.content_state);
}

/** Aplica un `content_state` (CRDT, base64) recibido del servidor —
 *  creación/patch propio (echo) o /sync/changes — al `.ydoc` local y
 *  reescribe `content` + el `.md` en disco. Misma operación sin importar si
 *  la nota está abierta en el editor ahora mismo: no hay forma de tocar el
 *  `Y.Doc` en memoria de un NoteEditor montado desde acá (sin WebSocket
 *  todavía, ver reconcileSync) — si el usuario la tiene abierta, ve el
 *  contenido fusionado la próxima vez que la abra. Colaboración en vivo
 *  depende de la fase "Tiempo real" (fuera de este diseño). */
async function applyNoteContentUpdate(get: SyncGet, set: SyncSet, noteId: string, contentStateB64: string): Promise<void> {
  const note = get().notes.find((n) => n.id === noteId);
  if (!note) return;
  const { content } = await applyIncomingContentState(note.filePath, contentStateB64);
  if (content === note.content) return;
  const updated = { ...note, content };
  await fs.writeFile(updated.filePath, serializeNote(updated));
  set((state) => ({
    notes: state.notes.map((n) => (n.id === noteId ? updated : n)),
    activeNote: state.activeNote?.id === noteId ? updated : state.activeNote,
  }));
}

/** Push del estado Yjs completo de una nota — canal separado de
 *  syncPatchNote (metadata/LWW). Persiste el `.ydoc` local siempre primero
 *  (offline-safe, igual que el `.md`); si hay conexión intenta mandarlo ya,
 *  si no (o falla) lo encola en contentSyncQueue — llamado desde
 *  NoteEditor.tsx en cada guardado. La respuesta es la fila completa de la
 *  nota (mismo shape que create/patch, ver logday-web api.ts
 *  `postNoteContent`) — se enruta por `applyNoteResponse` para reusar el
 *  mismo merge de metadata guardado-por-cola-pendiente y el enganche de
 *  `content_state` que ya tienen create/patch. */
export async function syncNoteContent(get: SyncGet, set: SyncSet, note: Note, ydoc: Y.Doc): Promise<void> {
  await persistYDoc(note.filePath, ydoc);
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  const updateB64 = bytesToBase64(Y.encodeStateAsUpdate(ydoc));
  if (syncConnectionStatus !== 'connected') {
    contentSyncQueue.enqueue('note', note.id, updateB64);
    return;
  }
  const queuedAt = new Date().toISOString();
  try {
    const response = await pushNoteContentRemote(syncConfig.serverUrl, syncConfig.accessToken, note.id, updateB64);
    applyNoteResponse(get, set, note.id, queuedAt, response);
  } catch {
    contentSyncQueue.enqueue('note', note.id, updateB64);
  }
}

/** Push del diff CRDT de un daily entry — mismo patrón que
 *  syncNoteContent, pero sin componente propio: vive enteramente acá
 *  porque saveDailyEntry (appStore.ts) ya recibe la llamada debounced
 *  800ms desde DailyEditor.tsx, no hace falta un Y.Doc por componente
 *  como el de NoteEditor.tsx. `oldText`/`newText` son solo un atajo para
 *  saltar el trabajo si no cambió nada — el diff real siempre se hace
 *  contra el contenido ya persistido en el `.ydoc` (getDailyContentText),
 *  nunca contra `oldText` directamente. */
async function pushDailyContentUpdate(get: SyncGet, set: SyncSet, date: string, oldText: string, newText: string): Promise<void> {
  const { basePath } = get();
  if (!basePath || oldText === newText) return;
  const ydoc = (await loadPersistedDailyYDoc(basePath, date)) ?? new Y.Doc();
  applyDailyTextEdit(ydoc, getDailyContentText(ydoc), newText);
  await persistDailyYDoc(basePath, date, ydoc);
  const updateB64 = bytesToBase64(Y.encodeStateAsUpdate(ydoc));
  ydoc.destroy();

  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  if (syncConnectionStatus !== 'connected') {
    contentSyncQueue.enqueue('daily_entry', date, updateB64);
    return;
  }
  try {
    const response = await putDailyEntryContentRemote(syncConfig.serverUrl, syncConfig.accessToken, date, updateB64);
    if (response.content_state) await applyDailyEntryContentUpdate(get, set, date, response.content_state);
  } catch {
    contentSyncQueue.enqueue('daily_entry', date, updateB64);
  }
}

async function syncDeleteDailyEntry(get: SyncGet, date: string): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('daily_entry', date, 'delete');
    return;
  }
  try {
    await deleteDailyEntryRemote(syncConfig.serverUrl, syncConfig.accessToken, date);
  } catch {
    syncQueue.enqueue('daily_entry', date, 'delete');
  }
}

async function drainContentSyncQueue(get: SyncGet, set: SyncSet): Promise<void> {
  const { syncConfig } = get();
  if (!syncConfig.enabled) return;
  await contentSyncQueue.drain(async (entity, key, updateB64) => {
    const queuedAt = new Date().toISOString();
    if (entity === 'note') {
      const response = await pushNoteContentRemote(syncConfig.serverUrl, syncConfig.accessToken, key, updateB64);
      applyNoteResponse(get, set, key, queuedAt, response);
    } else {
      const response = await putDailyEntryContentRemote(syncConfig.serverUrl, syncConfig.accessToken, key, updateB64);
      if (response.content_state) await applyDailyEntryContentUpdate(get, set, key, response.content_state);
    }
  });
}

async function syncCreateNote(get: SyncGet, set: SyncSet, note: Note): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  // Desktop permite crear una nota sin título (createNote la deja en
  // '', el usuario lo escribe después) — pero el server exige un
  // title no vacío (internal/note/handlers.go) y rechaza el create
  // con 400. Mismo placeholder que logday-web ya usa para esto ("Sin
  // título"), solo en el payload que se manda — el archivo/estado
  // local siguen con el título real (vacío o no) tal cual.
  const payload = noteToCreatePayload(note.title.trim() ? note : { ...note, title: 'Sin título' });
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('note', note.id, 'create', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await createNoteRemote(syncConfig.serverUrl, syncConfig.accessToken, payload);
    applyNoteResponse(get, set, note.id, queuedAt, response);
  } catch {
    syncQueue.enqueue('note', note.id, 'create', payload as unknown as Record<string, unknown>);
  }
}

async function syncPatchNote(get: SyncGet, set: SyncSet, noteId: string, fields: Partial<Note>): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled || Object.keys(fields).length === 0) return;
  const payload = noteFieldsToPatchPayload(fields);
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('note', noteId, 'patch', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await patchNoteRemote(syncConfig.serverUrl, syncConfig.accessToken, noteId, payload);
    applyNoteResponse(get, set, noteId, queuedAt, response);
  } catch {
    syncQueue.enqueue('note', noteId, 'patch', payload as unknown as Record<string, unknown>);
  }
}

async function syncDeleteNote(get: SyncGet, noteId: string): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('note', noteId, 'delete');
    return;
  }
  try {
    await deleteNoteRemote(syncConfig.serverUrl, syncConfig.accessToken, noteId);
  } catch {
    syncQueue.enqueue('note', noteId, 'delete');
  }
}

function diffNoteFields(prev: Note | undefined, next: Note): Partial<Note> {
  if (!prev) return { ...next };
  const fields: Partial<Note> = {};
  if (prev.title !== next.title) fields.title = next.title;
  if (prev.folder !== next.folder) fields.folder = next.folder;
  if (JSON.stringify(prev.tags) !== JSON.stringify(next.tags)) fields.tags = next.tags;
  if (prev.created !== next.created) fields.created = next.created;
  if (prev.updated !== next.updated) fields.updated = next.updated;
  if (prev.pinned !== next.pinned) fields.pinned = next.pinned;
  return fields;
}

// ── CalendarEvent ────────────────────────────────────────────────

const CALENDAR_EVENT_FIELD_MAP: Record<string, string> = {
  title: 'title', date: 'date', time: 'time', description: 'description',
  color: 'color', reminderMinutes: 'reminder_minutes', repeat: 'repeat',
};

function applyCalendarEventResponse(get: SyncGet, set: SyncSet, entityId: string, sinceIso: string, response: CalendarEventApiResponse): void {
  const current = get().calendarEvents.find((e) => e.id === entityId);
  if (!current) return;
  const mapped = calendarEventFromApiResponse(response);
  const merged = { ...current } as unknown as Record<string, unknown>;
  const mappedRecord = mapped as unknown as Record<string, unknown>;
  for (const [localKey, serverKey] of Object.entries(CALENDAR_EVENT_FIELD_MAP)) {
    if (!syncQueue.hasNewerQueuedField('calendar_event', entityId, serverKey, sinceIso)) {
      merged[localKey] = mappedRecord[localKey];
    }
  }
  const updated = merged as unknown as CalendarEvent;
  set((state) => ({ calendarEvents: state.calendarEvents.map((e) => (e.id === entityId ? updated : e)) }));
}

async function syncCreateCalendarEvent(get: SyncGet, set: SyncSet, event: CalendarEvent): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  const payload = calendarEventToCreatePayload(event);
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('calendar_event', event.id, 'create', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await createCalendarEventRemote(syncConfig.serverUrl, syncConfig.accessToken, payload);
    applyCalendarEventResponse(get, set, event.id, queuedAt, response);
  } catch {
    syncQueue.enqueue('calendar_event', event.id, 'create', payload as unknown as Record<string, unknown>);
  }
}

async function syncPatchCalendarEvent(get: SyncGet, set: SyncSet, eventId: string, fields: Partial<CalendarEvent>): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled || Object.keys(fields).length === 0) return;
  const payload = calendarEventFieldsToPatchPayload(fields);
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('calendar_event', eventId, 'patch', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await patchCalendarEventRemote(syncConfig.serverUrl, syncConfig.accessToken, eventId, payload);
    applyCalendarEventResponse(get, set, eventId, queuedAt, response);
  } catch {
    syncQueue.enqueue('calendar_event', eventId, 'patch', payload as unknown as Record<string, unknown>);
  }
}

async function syncDeleteCalendarEvent(get: SyncGet, eventId: string): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('calendar_event', eventId, 'delete');
    return;
  }
  try {
    await deleteCalendarEventRemote(syncConfig.serverUrl, syncConfig.accessToken, eventId);
  } catch {
    syncQueue.enqueue('calendar_event', eventId, 'delete');
  }
}

function diffCalendarEventFields(prev: CalendarEvent | undefined, next: CalendarEvent): Partial<CalendarEvent> {
  if (!prev) return { ...next };
  const fields: Partial<CalendarEvent> = {};
  if (prev.title !== next.title) fields.title = next.title;
  if (prev.date !== next.date) fields.date = next.date;
  if (prev.time !== next.time) fields.time = next.time;
  if (prev.description !== next.description) fields.description = next.description;
  if (prev.color !== next.color) fields.color = next.color;
  if (prev.reminderMinutes !== next.reminderMinutes) fields.reminderMinutes = next.reminderMinutes;
  if (prev.repeat !== next.repeat) fields.repeat = next.repeat;
  return fields;
}

// ── AbsenceDay ───────────────────────────────────────────────────

const ABSENCE_DAY_FIELD_MAP: Record<string, string> = { date: 'date', type: 'type', note: 'note' };

function applyAbsenceDayResponse(get: SyncGet, set: SyncSet, entityId: string, sinceIso: string, response: AbsenceDayApiResponse): void {
  const current = get().absenceDays.find((a) => a.id === entityId);
  if (!current) return;
  const mapped = absenceDayFromApiResponse(response);
  const merged = { ...current } as unknown as Record<string, unknown>;
  const mappedRecord = mapped as unknown as Record<string, unknown>;
  for (const [localKey, serverKey] of Object.entries(ABSENCE_DAY_FIELD_MAP)) {
    if (!syncQueue.hasNewerQueuedField('absence_day', entityId, serverKey, sinceIso)) {
      merged[localKey] = mappedRecord[localKey];
    }
  }
  const updated = merged as unknown as AbsenceDay;
  set((state) => ({ absenceDays: state.absenceDays.map((a) => (a.id === entityId ? updated : a)) }));
}

async function syncCreateAbsenceDay(get: SyncGet, set: SyncSet, absence: AbsenceDay): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  const payload = absenceDayToCreatePayload(absence);
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('absence_day', absence.id, 'create', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await createAbsenceDayRemote(syncConfig.serverUrl, syncConfig.accessToken, payload);
    applyAbsenceDayResponse(get, set, absence.id, queuedAt, response);
  } catch {
    syncQueue.enqueue('absence_day', absence.id, 'create', payload as unknown as Record<string, unknown>);
  }
}

async function syncPatchAbsenceDay(get: SyncGet, set: SyncSet, absenceId: string, fields: Partial<AbsenceDay>): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled || Object.keys(fields).length === 0) return;
  const payload = absenceDayFieldsToPatchPayload(fields);
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('absence_day', absenceId, 'patch', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await patchAbsenceDayRemote(syncConfig.serverUrl, syncConfig.accessToken, absenceId, payload);
    applyAbsenceDayResponse(get, set, absenceId, queuedAt, response);
  } catch {
    syncQueue.enqueue('absence_day', absenceId, 'patch', payload as unknown as Record<string, unknown>);
  }
}

async function syncDeleteAbsenceDay(get: SyncGet, absenceId: string): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('absence_day', absenceId, 'delete');
    return;
  }
  try {
    await deleteAbsenceDayRemote(syncConfig.serverUrl, syncConfig.accessToken, absenceId);
  } catch {
    syncQueue.enqueue('absence_day', absenceId, 'delete');
  }
}

function diffAbsenceDayFields(prev: AbsenceDay | undefined, next: AbsenceDay): Partial<AbsenceDay> {
  if (!prev) return { ...next };
  const fields: Partial<AbsenceDay> = {};
  if (prev.date !== next.date) fields.date = next.date;
  if (prev.type !== next.type) fields.type = next.type;
  if (prev.note !== next.note) fields.note = next.note;
  return fields;
}

// ── OvertimeEntry ────────────────────────────────────────────────
// Sin filePath propio — vive bundleada en el archivo del mes de
// entry.fecha (ver saveOvertimeEntry). applyOvertimeEntryResponse
// solo toca el estado en memoria; el archivo ya lo escribió quien
// llamó (saveOvertimeEntry) antes de disparar el sync.

const OVERTIME_ENTRY_FIELD_MAP: Record<string, string> = {
  fecha: 'fecha', solicitadaPor: 'solicitada_por', actividad: 'actividad', observaciones: 'observaciones',
  horaInicio: 'hora_inicio', horaFinal: 'hora_final', totalHoras: 'total_horas',
  extrasDiurnas: 'extras_diurnas', extrasNocturnas: 'extras_nocturnas',
  extrasDiurnasFestivas: 'extras_diurnas_festivas', extrasNocturnasFestivas: 'extras_nocturnas_festivas',
};

function applyOvertimeEntryResponse(get: SyncGet, set: SyncSet, entityId: string, sinceIso: string, response: OvertimeEntryApiResponse): void {
  const current = get().overtimeEntries.find((e) => e.id === entityId);
  if (!current) return; // no es del mes actualmente cargado en memoria — el archivo ya quedó bien igual
  const mapped = overtimeEntryFromApiResponse(response);
  const merged = { ...current } as unknown as Record<string, unknown>;
  const mappedRecord = mapped as unknown as Record<string, unknown>;
  for (const [localKey, serverKey] of Object.entries(OVERTIME_ENTRY_FIELD_MAP)) {
    if (!syncQueue.hasNewerQueuedField('overtime_entry', entityId, serverKey, sinceIso)) {
      merged[localKey] = mappedRecord[localKey];
    }
  }
  const updated = merged as unknown as OvertimeEntry;
  set((state) => ({ overtimeEntries: state.overtimeEntries.map((e) => (e.id === entityId ? updated : e)) }));
}

async function syncCreateOvertimeEntry(get: SyncGet, set: SyncSet, entry: OvertimeEntry): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  const payload = overtimeEntryToCreatePayload(entry);
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('overtime_entry', entry.id, 'create', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await createOvertimeEntryRemote(syncConfig.serverUrl, syncConfig.accessToken, payload);
    applyOvertimeEntryResponse(get, set, entry.id, queuedAt, response);
  } catch {
    syncQueue.enqueue('overtime_entry', entry.id, 'create', payload as unknown as Record<string, unknown>);
  }
}

async function syncPatchOvertimeEntry(get: SyncGet, set: SyncSet, entryId: string, fields: Partial<OvertimeEntry>): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled || Object.keys(fields).length === 0) return;
  const payload = overtimeEntryFieldsToPatchPayload(fields);
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('overtime_entry', entryId, 'patch', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await patchOvertimeEntryRemote(syncConfig.serverUrl, syncConfig.accessToken, entryId, payload);
    applyOvertimeEntryResponse(get, set, entryId, queuedAt, response);
  } catch {
    syncQueue.enqueue('overtime_entry', entryId, 'patch', payload as unknown as Record<string, unknown>);
  }
}

async function syncDeleteOvertimeEntry(get: SyncGet, entryId: string): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled) return;
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('overtime_entry', entryId, 'delete');
    return;
  }
  try {
    await deleteOvertimeEntryRemote(syncConfig.serverUrl, syncConfig.accessToken, entryId);
  } catch {
    syncQueue.enqueue('overtime_entry', entryId, 'delete');
  }
}

// ── OvertimeMonthMeta ─────────────────────────────────────────────
// Mismatch de modelo: local es UN SOLO valor global (`overtimeMeta`,
// localStorage), el server lo trata por year_month. Se sincroniza el
// valor global como "la meta del mes que se está viendo ahora" — un
// cambio remoto de un mes que NO es el visible se ignora a propósito
// (no tiene sentido pisar lo que ves con la meta de un mes distinto).

const OVERTIME_MONTH_META_FIELD_MAP: Record<string, string> = { colaborador: 'colaborador', cedula: 'cedula' };

function applyOvertimeMonthMetaResponse(get: SyncGet, set: SyncSet, yearMonth: string, sinceIso: string, response: OvertimeMonthMetaApiResponse): void {
  if (get().overtimeMonth !== yearMonth) return;
  const mapped = overtimeMonthMetaFromApiResponse(response);
  const merged = { ...get().overtimeMeta } as unknown as Record<string, unknown>;
  const mappedRecord = mapped as unknown as Record<string, unknown>;
  for (const [localKey, serverKey] of Object.entries(OVERTIME_MONTH_META_FIELD_MAP)) {
    if (!syncQueue.hasNewerQueuedField('overtime_month_meta', yearMonth, serverKey, sinceIso)) {
      merged[localKey] = mappedRecord[localKey];
    }
  }
  const updated = merged as unknown as OvertimeMonthMeta;
  set({ overtimeMeta: updated });
  localStorage.setItem('overtimeMeta', JSON.stringify(updated));
}

async function syncPatchOvertimeMonthMeta(get: SyncGet, set: SyncSet, yearMonth: string, fields: Partial<OvertimeMonthMeta>): Promise<void> {
  const { syncConfig, syncConnectionStatus } = get();
  if (!syncConfig.enabled || Object.keys(fields).length === 0) return;
  const payload = overtimeMonthMetaFieldsToPatchPayload(fields);
  const queuedAt = new Date().toISOString();
  if (syncConnectionStatus !== 'connected') {
    syncQueue.enqueue('overtime_month_meta', yearMonth, 'patch', payload as unknown as Record<string, unknown>);
    return;
  }
  try {
    const response = await patchOvertimeMonthMetaRemote(syncConfig.serverUrl, syncConfig.accessToken, yearMonth, payload);
    applyOvertimeMonthMetaResponse(get, set, yearMonth, queuedAt, response);
  } catch {
    syncQueue.enqueue('overtime_month_meta', yearMonth, 'patch', payload as unknown as Record<string, unknown>);
  }
}

// Debounce del push — setOvertimeMeta se llama directo por cada tecla
// desde OvertimeList.tsx (sin debounce de componente, a diferencia de
// Note/Daily), así que este sí necesita el suyo acá.
let overtimeMetaPushTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleOvertimeMetaPush(get: SyncGet, set: SyncSet, fields: Partial<OvertimeMonthMeta>): void {
  if (overtimeMetaPushTimeout) clearTimeout(overtimeMetaPushTimeout);
  overtimeMetaPushTimeout = setTimeout(() => {
    void syncPatchOvertimeMonthMeta(get, set, get().overtimeMonth, fields);
  }, 400);
}

function diffOvertimeEntryFields(prev: OvertimeEntry | undefined, next: OvertimeEntry): Partial<OvertimeEntry> {
  if (!prev) return { ...next };
  const fields: Partial<OvertimeEntry> = {};
  if (prev.fecha !== next.fecha) fields.fecha = next.fecha;
  if (prev.solicitadaPor !== next.solicitadaPor) fields.solicitadaPor = next.solicitadaPor;
  if (prev.actividad !== next.actividad) fields.actividad = next.actividad;
  if (prev.observaciones !== next.observaciones) fields.observaciones = next.observaciones;
  if (prev.horaInicio !== next.horaInicio) fields.horaInicio = next.horaInicio;
  if (prev.horaFinal !== next.horaFinal) fields.horaFinal = next.horaFinal;
  if (prev.totalHoras !== next.totalHoras) fields.totalHoras = next.totalHoras;
  if (prev.extrasDiurnas !== next.extrasDiurnas) fields.extrasDiurnas = next.extrasDiurnas;
  if (prev.extrasNocturnas !== next.extrasNocturnas) fields.extrasNocturnas = next.extrasNocturnas;
  if (prev.extrasDiurnasFestivas !== next.extrasDiurnasFestivas) fields.extrasDiurnasFestivas = next.extrasDiurnasFestivas;
  if (prev.extrasNocturnasFestivas !== next.extrasNocturnasFestivas) fields.extrasNocturnasFestivas = next.extrasNocturnasFestivas;
  return fields;
}

async function dispatchQueuedWrite(get: SyncGet, set: SyncSet, write: syncQueue.QueuedWrite): Promise<void> {
  const { serverUrl, accessToken } = get().syncConfig;

  if (write.entity === 'note') {
    if (write.op === 'create') {
      applyNoteResponse(get, set, write.entityId, write.queuedAt, await createNoteRemote(serverUrl, accessToken, write.fields as unknown as NoteCreatePayload));
    } else if (write.op === 'patch') {
      applyNoteResponse(get, set, write.entityId, write.queuedAt, await patchNoteRemote(serverUrl, accessToken, write.entityId, write.fields as unknown as NotePatchPayload));
    } else {
      await deleteNoteRemote(serverUrl, accessToken, write.entityId);
    }
    return;
  }
  if (write.entity === 'calendar_event') {
    if (write.op === 'create') {
      applyCalendarEventResponse(get, set, write.entityId, write.queuedAt, await createCalendarEventRemote(serverUrl, accessToken, write.fields as unknown as CalendarEventCreatePayload));
    } else if (write.op === 'patch') {
      applyCalendarEventResponse(get, set, write.entityId, write.queuedAt, await patchCalendarEventRemote(serverUrl, accessToken, write.entityId, write.fields as unknown as CalendarEventPatchPayload));
    } else {
      await deleteCalendarEventRemote(serverUrl, accessToken, write.entityId);
    }
    return;
  }
  if (write.entity === 'absence_day') {
    if (write.op === 'create') {
      applyAbsenceDayResponse(get, set, write.entityId, write.queuedAt, await createAbsenceDayRemote(serverUrl, accessToken, write.fields as unknown as AbsenceDayCreatePayload));
    } else if (write.op === 'patch') {
      applyAbsenceDayResponse(get, set, write.entityId, write.queuedAt, await patchAbsenceDayRemote(serverUrl, accessToken, write.entityId, write.fields as unknown as AbsenceDayPatchPayload));
    } else {
      await deleteAbsenceDayRemote(serverUrl, accessToken, write.entityId);
    }
    return;
  }
  if (write.entity === 'overtime_entry') {
    if (write.op === 'create') {
      applyOvertimeEntryResponse(get, set, write.entityId, write.queuedAt, await createOvertimeEntryRemote(serverUrl, accessToken, write.fields as unknown as OvertimeEntryCreatePayload));
    } else if (write.op === 'patch') {
      applyOvertimeEntryResponse(get, set, write.entityId, write.queuedAt, await patchOvertimeEntryRemote(serverUrl, accessToken, write.entityId, write.fields as unknown as OvertimeEntryPatchPayload));
    } else {
      await deleteOvertimeEntryRemote(serverUrl, accessToken, write.entityId);
    }
    return;
  }
  if (write.entity === 'overtime_month_meta') {
    // Sin create — PATCH crea-si-no-existe (ver syncMapping.ts), y sin
    // delete tampoco: no hay acción local que borre la meta de un mes.
    if (write.op === 'patch') {
      applyOvertimeMonthMetaResponse(get, set, write.entityId, write.queuedAt, await patchOvertimeMonthMetaRemote(serverUrl, accessToken, write.entityId, write.fields as unknown as OvertimeMonthMetaPatchPayload));
    }
    return;
  }
  if (write.entity === 'daily_entry') {
    // Solo delete acá — el contenido va por contentSyncQueue (CRDT), no
    // por esta cola de create/patch/delete.
    if (write.op === 'delete') {
      await deleteDailyEntryRemote(serverUrl, accessToken, write.entityId);
    }
    return;
  }
  if (write.entity !== 'task') return;
  if (write.op === 'create') {
    const response = await createTaskRemote(serverUrl, accessToken, write.fields as unknown as TaskCreatePayload);
    applyTaskResponse(get, set, write.entityId, write.queuedAt, response);
  } else if (write.op === 'patch') {
    const response = await patchTaskRemote(serverUrl, accessToken, write.entityId, write.fields as unknown as TaskPatchPayload);
    applyTaskResponse(get, set, write.entityId, write.queuedAt, response);
  } else {
    await deleteTaskRemote(serverUrl, accessToken, write.entityId);
  }
}

/** Un 4xx del servidor (ej. un create con un campo requerido vacío)
 *  nunca se va a arreglar solo reintentando el mismo payload — a
 *  diferencia de una caída de red o un 5xx, donde sí tiene sentido
 *  parar el drenado y probar de nuevo más tarde. Sin esto, una sola
 *  entrada mal formada (por un bug ya corregido en el código, pero
 *  que ya quedó encolada con el payload viejo) bloquearía el resto de
 *  la cola para siempre, ver syncQueue.ts drainQueue. */
async function sendQueuedWrite(get: SyncGet, set: SyncSet, write: syncQueue.QueuedWrite): Promise<'ok' | 'permanent-failure'> {
  try {
    await dispatchQueuedWrite(get, set, write);
    return 'ok';
  } catch (e) {
    if (e instanceof SyncApiError && e.status >= 400 && e.status < 500) {
      return 'permanent-failure';
    }
    throw e;
  }
}

/** Drena la cola en orden — se llama al reconectar (ver
 *  syncConnect). Sin timers ni reintento automático todavía: eso es
 *  parte de la fase "Tiempo real" (reconexión WS con backoff). */
async function drainSyncQueue(get: SyncGet, set: SyncSet): Promise<void> {
  await syncQueue.drainQueue((write) => sendQueuedWrite(get, set, write));
}

// ── Cursor y reconciliación ─────────────────────────────────────
// Trae /sync/changes desde el cursor guardado y aplica cada cambio al
// estado local — así una edición hecha en otro cliente (logday-web,
// otra instalación de Desktop) llega acá, no solo al revés. Por ahora
// solo 'task' tiene el otro lado (escribir el archivo local) resuelto;
// el resto de los tipos que puedan venir en el feed se ignoran hasta
// que "Escritura y cola offline" se replique a esas entidades (ver
// specs/sync-servidor/tasks.md).

const SYNC_CURSOR_KEY = 'syncCursor';
// Cualquier entrada en cola en este momento es, por definición, una
// edición local todavía sin confirmar — no importa cuándo se encoló,
// tiene prioridad sobre cualquier cambio remoto que estemos
// reconciliando ahora. Pasar una fecha época como "sinceIso" hace que
// hasNewerQueuedField matchee cualquier entrada existente.
const EPOCH = '0000-01-01T00:00:00.000Z';

function getSyncCursor(): number {
  return Number(localStorage.getItem(SYNC_CURSOR_KEY) || '0');
}

function setSyncCursor(seq: number): void {
  localStorage.setItem(SYNC_CURSOR_KEY, String(seq));
}

async function applyRemoteTaskChange(get: SyncGet, set: SyncSet, change: SyncChange): Promise<void> {
  const { basePath } = get();
  if (!basePath) return;
  const existing = get().tasks.find((t) => t.id === change.id);

  if (change.deleted) {
    if (!existing) return; // nunca existió acá, nada que borrar
    // Delete que llegó de OTRA instalación desktop — se captura acá
    // también (no solo en deleteTask) para que la papelera quede
    // compartida entre instalaciones del mismo usuario, ver plan.
    await trash.writeTrashRecord(basePath, 'task', existing.id, existing.title, existing);
    await fs.deleteFile(existing.filePath).catch(() => {});
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== change.id),
      activeTask: state.activeTask?.id === change.id ? null : state.activeTask,
    }));
    return;
  }

  const mapped = taskFromApiResponse(change.data as TaskApiResponse);
  const filePath = existing?.filePath ?? taskFilePath(basePath, mapped.project, change.id);
  const merged = { ...existing, ...mapped, filePath, linked_paths: existing?.linked_paths ?? [] } as unknown as Record<string, unknown>;

  // Regla de prioridad: un campo con una edición local todavía sin
  // mandar (en cola) no se pisa con el valor remoto — esa cola,
  // cuando drene, va a traer el valor final real (ver
  // applyTaskResponse, misma regla).
  if (existing) {
    for (const [localKey, serverKey] of Object.entries(TASK_FIELD_MAP)) {
      if (syncQueue.hasNewerQueuedField('task', change.id, serverKey, EPOCH)) {
        merged[localKey] = (existing as unknown as Record<string, unknown>)[localKey];
      }
    }
  }

  const finalTask = merged as unknown as Task;
  await fs.writeFile(filePath, serializeTask(finalTask));
  set((state) => ({
    tasks: existing
      ? state.tasks.map((t) => (t.id === change.id ? finalTask : t))
      : [finalTask, ...state.tasks],
    activeTask: state.activeTask?.id === change.id ? finalTask : state.activeTask,
  }));
}

async function applyRemoteNoteChange(get: SyncGet, set: SyncSet, change: SyncChange): Promise<void> {
  const { basePath } = get();
  if (!basePath) return;
  const existing = get().notes.find((n) => n.id === change.id);

  if (change.deleted) {
    if (!existing) return;
    // Delete que llegó de OTRA instalación desktop — mismo motivo que en
    // applyRemoteTaskChange (papelera compartida entre instalaciones).
    // Igual que deleteNote, no vale la pena trashear una nota vacía.
    if (existing.title.trim() || existing.content.trim()) {
      await trash.writeTrashRecord(basePath, 'note', existing.id, existing.title || existing.id, existing);
    }
    await fs.deleteFile(existing.filePath).catch(() => {});
    await fs.deleteFile(noteContentStatePath(existing.filePath)).catch(() => {});
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== change.id),
      activeNote: state.activeNote?.id === change.id ? null : state.activeNote,
    }));
    return;
  }

  const mapped = noteFromApiResponse(change.data as NoteApiResponse);
  const filePath = existing?.filePath ?? noteFilePath(basePath, mapped.folder, change.id);
  // content nunca viene de acá por el campo `content` de la metadata
  // (ver comentario arriba del archivo) — se preserva el contenido
  // local tal cual, tanto para una nota existente como para una nueva
  // (que arranca sin contenido hasta que llegue su content_state, ver
  // abajo). `content_state` (CRDT) sí puede venir en este mismo
  // payload — se aplica aparte, después del set() de esta función.
  const merged = {
    ...existing, ...mapped, filePath,
    content: existing?.content ?? '',
  } as unknown as Record<string, unknown>;

  if (existing) {
    for (const [localKey, serverKey] of Object.entries(NOTE_FIELD_MAP)) {
      if (syncQueue.hasNewerQueuedField('note', change.id, serverKey, EPOCH)) {
        merged[localKey] = (existing as unknown as Record<string, unknown>)[localKey];
      }
    }
  }

  const finalNote = merged as unknown as Note;
  if (!existing && finalNote.folder) await fs.createDir(noteFolderDir(basePath, finalNote.folder)).catch(() => {});
  await fs.writeFile(filePath, serializeNote(finalNote));
  set((state) => ({
    notes: existing
      ? state.notes.map((n) => (n.id === change.id ? finalNote : n))
      : [finalNote, ...state.notes],
    activeNote: state.activeNote?.id === change.id ? finalNote : state.activeNote,
  }));
  const contentState = (change.data as NoteApiResponse).content_state;
  if (contentState) void applyNoteContentUpdate(get, set, change.id, contentState);
}

async function applyRemoteCalendarEventChange(get: SyncGet, set: SyncSet, change: SyncChange): Promise<void> {
  const { basePath } = get();
  if (!basePath) return;
  const path = `${basePath}/calendar/events.json`;
  const current = get().calendarEvents;
  const existing = current.find((e) => e.id === change.id);

  if (change.deleted) {
    if (!existing) return;
    const next = current.filter((e) => e.id !== change.id);
    await fs.writeFile(path, JSON.stringify(next, null, 2));
    set({ calendarEvents: next });
    return;
  }

  const mapped = calendarEventFromApiResponse(change.data as CalendarEventApiResponse);
  const merged = { ...existing, ...mapped } as unknown as Record<string, unknown>;
  if (existing) {
    for (const [localKey, serverKey] of Object.entries(CALENDAR_EVENT_FIELD_MAP)) {
      if (syncQueue.hasNewerQueuedField('calendar_event', change.id, serverKey, EPOCH)) {
        merged[localKey] = (existing as unknown as Record<string, unknown>)[localKey];
      }
    }
  }
  const finalEvent = merged as unknown as CalendarEvent;
  const next = existing ? current.map((e) => (e.id === change.id ? finalEvent : e)) : [...current, finalEvent];
  if (!(await fs.exists(`${basePath}/calendar`))) await fs.createDir(`${basePath}/calendar`);
  await fs.writeFile(path, JSON.stringify(next, null, 2));
  set({ calendarEvents: next });
}

async function applyRemoteAbsenceDayChange(get: SyncGet, set: SyncSet, change: SyncChange): Promise<void> {
  const { basePath } = get();
  if (!basePath) return;
  const path = `${basePath}/absences.json`;
  const current = get().absenceDays;
  const existing = current.find((a) => a.id === change.id);

  if (change.deleted) {
    if (!existing) return;
    const next = current.filter((a) => a.id !== change.id);
    await fs.writeFile(path, JSON.stringify(next, null, 2));
    set({ absenceDays: next });
    return;
  }

  const mapped = absenceDayFromApiResponse(change.data as AbsenceDayApiResponse);
  const merged = { ...existing, ...mapped } as unknown as Record<string, unknown>;
  if (existing) {
    for (const [localKey, serverKey] of Object.entries(ABSENCE_DAY_FIELD_MAP)) {
      if (syncQueue.hasNewerQueuedField('absence_day', change.id, serverKey, EPOCH)) {
        merged[localKey] = (existing as unknown as Record<string, unknown>)[localKey];
      }
    }
  }
  const finalAbsence = merged as unknown as AbsenceDay;
  const next = existing ? current.map((a) => (a.id === change.id ? finalAbsence : a)) : [...current, finalAbsence];
  await fs.writeFile(path, JSON.stringify(next, null, 2));
  set({ absenceDays: next });
}

/** A diferencia de las otras entidades, no toca el estado en memoria
 *  salvo que el mes de la entrada coincida con el mes actualmente
 *  visible (get().overtimeMonth) — aplicar una reconciliación en
 *  background no debería saltar la vista del usuario a un mes
 *  distinto, a diferencia de saveOvertimeEntry (que sí navega, porque
 *  ahí es una acción explícita del usuario). El archivo del mes que
 *  corresponda igual se escribe siempre. */
async function applyRemoteOvertimeEntryChange(get: SyncGet, set: SyncSet, change: SyncChange): Promise<void> {
  const { basePath } = get();
  if (!basePath) return;

  if (change.deleted) {
    // No sabemos a qué mes pertenecía sin la data — si está en el mes
    // visible, ya sabemos su fecha por el estado en memoria.
    const existing = get().overtimeEntries.find((e) => e.id === change.id);
    if (!existing) return; // no es del mes visible, no hay archivo que tocar sin arriesgar adivinar
    // Delete que llegó de OTRA instalación desktop — mismo motivo que en
    // applyRemoteTaskChange/applyRemoteNoteChange.
    await trash.writeTrashRecord(basePath, 'overtime_entry', existing.id, `${existing.fecha} — ${existing.actividad}`, existing);
    const ym = existing.fecha.slice(0, 7);
    const [year, month] = ym.split('-');
    const path = overtimeMonthFilePath(basePath, year, month);
    const entries = get().overtimeEntries.filter((e) => e.id !== change.id);
    await fs.writeFile(path, `---\n${JSON.stringify({ entries }, null, 2)}\n---\n`);
    set({ overtimeEntries: entries });
    return;
  }

  const mapped = overtimeEntryFromApiResponse(change.data as OvertimeEntryApiResponse);
  const ym = mapped.fecha.slice(0, 7);
  const [year, month] = ym.split('-');
  await fs.createDir(overtimeMonthDir(basePath, year, month)).catch(() => {});
  const path = overtimeMonthFilePath(basePath, year, month);

  let entries: OvertimeEntry[] = [];
  if (await fs.exists(path)) {
    try {
      const raw = await fs.readFile(path);
      const match = raw.match(/^---\n([\s\S]*?)\n---/);
      entries = match ? (JSON.parse(match[1]).entries ?? []) : [];
    } catch { /* archivo vacío o corrupto */ }
  }
  const existing = entries.find((e) => e.id === change.id);
  const merged = { ...existing, ...mapped } as unknown as Record<string, unknown>;
  if (existing) {
    for (const [localKey, serverKey] of Object.entries(OVERTIME_ENTRY_FIELD_MAP)) {
      if (syncQueue.hasNewerQueuedField('overtime_entry', change.id, serverKey, EPOCH)) {
        merged[localKey] = (existing as unknown as Record<string, unknown>)[localKey];
      }
    }
  }
  const finalEntry = merged as unknown as OvertimeEntry;
  const nextEntries = [...entries.filter((e) => e.id !== change.id), finalEntry]
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  await fs.writeFile(path, `---\n${JSON.stringify({ entries: nextEntries }, null, 2)}\n---\n`);

  const { overtimeMonths } = get();
  if (!overtimeMonths.includes(ym)) set({ overtimeMonths: [ym, ...overtimeMonths].sort().reverse() });
  if (get().overtimeMonth === ym) set({ overtimeEntries: nextEntries });
}

// change.id es el year_month (natural key, sin id generado — ver
// syncQueue.ts). Igual que el push, un cambio remoto de un mes que no
// es el visible se ignora a propósito (mismatch de modelo, ver arriba).
async function applyRemoteOvertimeMonthMetaChange(get: SyncGet, set: SyncSet, change: SyncChange): Promise<void> {
  const yearMonth = change.id;
  if (get().overtimeMonth !== yearMonth) return;
  if (change.deleted) {
    const empty = { colaborador: '', cedula: '' };
    set({ overtimeMeta: empty });
    localStorage.setItem('overtimeMeta', JSON.stringify(empty));
    return;
  }
  applyOvertimeMonthMetaResponse(get, set, yearMonth, EPOCH, change.data as OvertimeMonthMetaApiResponse);
}

/** Aplica un content_state de daily entry (echo del propio push o
 *  /sync/changes) — reescribe la sección del día en el archivo de su mes.
 *  Misma operación sin importar el origen, igual que applyNoteContentUpdate. */
async function applyDailyEntryContentUpdate(get: SyncGet, set: SyncSet, date: string, contentStateB64: string): Promise<void> {
  const { basePath } = get();
  if (!basePath) return;
  const { content } = await applyIncomingDailyContentState(basePath, date, contentStateB64);
  if (get().dailyEntries[date] === content) return;
  const year = date.slice(0, 4);
  const month = date.slice(5, 7);
  const yearMonth = `${year}-${month}`;
  const fp = dailyMonthFilePath(basePath, year, month);
  let entries: Record<string, string> = {};
  try { entries = parseDailyFile(await fs.readFile(fp)); } catch { /* archivo nuevo */ }
  entries[date] = content;
  await fs.createDir(dailyMonthDir(basePath, year, month));
  await fs.writeFile(fp, serializeDailyFile(entries, yearMonth));
  set((s) => ({
    dailyEntries: { ...s.dailyEntries, [date]: content },
    dailyMonths: s.dailyMonths.includes(yearMonth) ? s.dailyMonths : [yearMonth, ...s.dailyMonths].sort().reverse(),
  }));
}

async function applyRemoteDailyEntryChange(get: SyncGet, set: SyncSet, change: SyncChange): Promise<void> {
  const { basePath } = get();
  if (!basePath) return;
  const date = change.id;

  if (change.deleted) {
    const existingContent = get().dailyEntries[date];
    if (existingContent !== undefined) {
      // Delete que llegó de OTRA instalación desktop — mismo motivo que
      // Task/Note/OvertimeEntry (papelera compartida, ver
      // specs/papelera-reciclaje). Antes de esto, dailys no tenían sync
      // en absoluto, así que este es su primer hook de papelera remota.
      await trash.writeTrashRecord(basePath, 'daily_entry', date, date, { date, content: existingContent });
    }
    const year = date.slice(0, 4);
    const month = date.slice(5, 7);
    const yearMonth = `${year}-${month}`;
    const fp = dailyMonthFilePath(basePath, year, month);
    let entries: Record<string, string> = {};
    try { entries = parseDailyFile(await fs.readFile(fp)); } catch { /* no file */ }
    delete entries[date];
    await fs.createDir(dailyMonthDir(basePath, year, month));
    await fs.writeFile(fp, serializeDailyFile(entries, yearMonth));
    await deleteDailyContentState(basePath, date);
    set((s) => {
      const rest = { ...s.dailyEntries };
      delete rest[date];
      return { dailyEntries: rest };
    });
    return;
  }

  const contentState = (change.data as DailyEntryApiResponse).content_state;
  if (contentState) await applyDailyEntryContentUpdate(get, set, date, contentState);
}

async function applyRemoteChanges(get: SyncGet, set: SyncSet, changes: SyncChange[]): Promise<void> {
  for (const change of changes) {
    if (change.type === 'task') {
      await applyRemoteTaskChange(get, set, change);
    } else if (change.type === 'note') {
      await applyRemoteNoteChange(get, set, change);
    } else if (change.type === 'calendar_event') {
      await applyRemoteCalendarEventChange(get, set, change);
    } else if (change.type === 'absence_day') {
      await applyRemoteAbsenceDayChange(get, set, change);
    } else if (change.type === 'overtime_entry') {
      await applyRemoteOvertimeEntryChange(get, set, change);
    } else if (change.type === 'overtime_month_meta') {
      await applyRemoteOvertimeMonthMetaChange(get, set, change);
    } else if (change.type === 'daily_entry') {
      await applyRemoteDailyEntryChange(get, set, change);
    }
  }
}

/** GET /sync/changes desde el cursor guardado; si el servidor dice
 *  que el cursor ya no es válido (410 — se purgaron tombstones más
 *  viejos de lo que este cliente conoce), descarta el cursor y hace
 *  un resync completo desde cero. Los cambios en cola siguen
 *  protegidos igual (ver EPOCH arriba) — un full resync no pisa
 *  ediciones locales todavía sin confirmar. */
async function reconcileSync(get: SyncGet, set: SyncSet): Promise<void> {
  const { syncConfig } = get();
  if (!syncConfig.enabled) return;
  const cursor = getSyncCursor();
  try {
    const changes = await syncChangesRemote(syncConfig.serverUrl, syncConfig.accessToken, cursor);
    await applyRemoteChanges(get, set, changes);
    if (changes.length > 0) {
      setSyncCursor(changes.reduce((m, c) => Math.max(m, c.seq), cursor));
    }
  } catch (e) {
    if (e instanceof SyncApiError && e.status === 410) {
      const changes = await syncChangesRemote(syncConfig.serverUrl, syncConfig.accessToken, 0);
      await applyRemoteChanges(get, set, changes);
      setSyncCursor(changes.reduce((m, c) => Math.max(m, c.seq), 0));
    }
    // Otros errores (red caída, etc.): se reintenta solo en el
    // próximo intervalo periódico o la próxima reconexión — no hay
    // nada más que hacer acá sin bloquear la UI.
  }
}

// Sin WebSocket todavía (fase "Tiempo real" pendiente) — este
// intervalo es el stand-in hasta entonces. Se arranca/para junto con
// syncConnect/syncDisconnect.
//
// Cada tick también drena la cola local antes de reconciliar — no
// solo al conectar. syncCreateX/syncPatchX/syncDeleteX mandan directo
// cuando hay conexión y encolan solo si esa llamada falla (network
// blip, timeout, etc.); sin este drenado periódico esa entrada se
// queda en la cola para siempre aunque la app siga "Conectado", ya
// que nada más la reintenta hasta el próximo syncConnect (reconectar
// a mano o reiniciar la app). Bug real encontrado probando el delete
// de CalendarEvent: quedó en la cola sin drenar con la app conectada
// todo el tiempo.
const RECONCILE_INTERVAL_MS = 30_000;
let reconcileIntervalId: ReturnType<typeof setInterval> | null = null;

function startReconcileInterval(get: SyncGet, set: SyncSet): void {
  if (reconcileIntervalId) return;
  reconcileIntervalId = setInterval(() => {
    void Promise.all([drainSyncQueue(get, set), drainContentSyncQueue(get, set)])
      .then(() => reconcileSync(get, set));
  }, RECONCILE_INTERVAL_MS);
}

function stopReconcileInterval(): void {
  if (reconcileIntervalId) {
    clearInterval(reconcileIntervalId);
    reconcileIntervalId = null;
  }
}

// No depende de conexión a sync (a diferencia del reconcile de arriba) —
// es puro filesystem local, así que arranca directo desde init(). La
// ventana de retención es de 60 días, no hace falta chequear tan seguido
// como el sync — cada 6 horas alcanza de sobra.
const TRASH_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
let trashPurgeIntervalId: ReturnType<typeof setInterval> | null = null;

function startTrashPurgeInterval(get: SyncGet): void {
  if (trashPurgeIntervalId) return;
  trashPurgeIntervalId = setInterval(() => {
    const { basePath } = get();
    if (basePath) void trash.purgeExpiredTrash(basePath);
  }, TRASH_PURGE_INTERVAL_MS);
}

function stopTrashPurgeInterval(): void {
  if (trashPurgeIntervalId) {
    clearInterval(trashPurgeIntervalId);
    trashPurgeIntervalId = null;
  }
}

// ── Tiempo real (WebSocket) ──────────────────────────────────────
// Ver specs/sync-servidor "Tiempo real"/"Reconexión WebSocket" — el
// diseño (backoff, protocolo) ya estaba escrito ahí, esto lo
// implementa. Mismo patrón que logday-web (src/store/appStore.ts,
// connectRealtime/handleNotice/schedulePull) con dos diferencias
// deliberadas: transporte (@tauri-apps/plugin-websocket en vez de
// WebSocket nativo del navegador — mismo motivo que REST usa comandos
// Rust y no fetch, ver arriba "Capa de red") y backoff exponencial
// (design.md ya lo definía así, no el retry fijo de 3s de web).
//
// El aviso {"type","id","seq"} nunca se aplica directo — solo dispara
// reconcileSync (ya existente, sin cambios) antes de lo que tardaría
// el poll de 30s, que sigue como red de respaldo tal cual está.

const REALTIME_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
let realtimeWs: TauriWebSocket | null = null;
let realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeBackoffIdx = 0;
let realtimePullInFlight = false;
let realtimePullPending = false;
let realtimeNoticeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let realtimePendingNoticeSeq = 0;

function wsUrl(serverUrl: string): string {
  return normalizeServerUrl(serverUrl).replace(/^http/, 'ws') + '/ws';
}

// Una ráfaga de avisos (varios cambios casi juntos) no debe disparar
// un pull por cada uno — si ya hay uno en vuelo, el resto solo marca
// "pendiente" y dispara exactamente un pull más al terminar.
function scheduleRealtimePull(get: SyncGet, set: SyncSet): void {
  if (realtimePullInFlight) {
    realtimePullPending = true;
    return;
  }
  realtimePullInFlight = true;
  void reconcileSync(get, set).finally(() => {
    realtimePullInFlight = false;
    if (realtimePullPending) {
      realtimePullPending = false;
      scheduleRealtimePull(get, set);
    }
  });
}

// El servidor manda Notify() antes de resolver la respuesta HTTP del
// propio write (ver logday-web, mismo comentario) — el eco por WS de
// una escritura propia puede llegar antes de que esa respuesta
// termine de avanzar el cursor acá. Esperar un toque antes de decidir
// le da tiempo a que aterrice, y de paso agrupa ráfagas en una sola
// decisión.
const REALTIME_NOTICE_DEBOUNCE_MS = 250;

function handleRealtimeNotice(seq: number | undefined, get: SyncGet, set: SyncSet): void {
  if (typeof seq === 'number') realtimePendingNoticeSeq = Math.max(realtimePendingNoticeSeq, seq);
  if (realtimeNoticeDebounceTimer) return;
  realtimeNoticeDebounceTimer = setTimeout(() => {
    realtimeNoticeDebounceTimer = null;
    const seqToCheck = realtimePendingNoticeSeq;
    realtimePendingNoticeSeq = 0;
    if (seqToCheck > 0 && seqToCheck <= getSyncCursor()) return; // ya lo tenemos, viene de nuestra propia escritura
    scheduleRealtimePull(get, set);
  }, REALTIME_NOTICE_DEBOUNCE_MS);
}

async function connectRealtime(get: SyncGet, set: SyncSet): Promise<void> {
  if (realtimeWs) return;
  const { syncConfig } = get();
  if (!syncConfig.enabled || !syncConfig.accessToken) return;

  let socket: TauriWebSocket;
  try {
    socket = await TauriWebSocket.connect(wsUrl(syncConfig.serverUrl));
  } catch {
    scheduleRealtimeReconnect(get, set);
    return;
  }
  realtimeWs = socket;

  socket.addListener((msg) => {
    if (realtimeWs !== socket) return; // conexión vieja, ya reemplazada

    // El plugin de Rust serializa un cierre "sucio" (p. ej. el server
    // cierra con conn.CloseNow() justo después de un auth fallido, sin
    // esperar a que el cliente termine de leer la trama de cierre
    // prolija) como un string plano en vez de {type, data} — no como
    // 'Close'. Sin este chequeo, ese mensaje no matchea ninguna rama de
    // abajo, `realtimeWs` queda apuntando a un socket ya muerto para
    // siempre, y como connectRealtime empieza con `if (realtimeWs)
    // return`, ningún reintento futuro (ni el de este backoff ni el que
    // dispara un login/reconexión manual después) vuelve a conectar
    // (encontrado probando: cero intentos de /ws en el server tras un
    // primer cierre a los 3.8s).
    if (typeof msg !== 'object' || msg === null || typeof (msg as { type?: unknown }).type !== 'string') {
      if (realtimeWs === socket) {
        realtimeWs = null;
        scheduleRealtimeReconnect(get, set);
      }
      return;
    }

    if (msg.type === 'Text') {
      // Recibir CUALQUIER mensaje que pruebe que el servidor aceptó la
      // conexión (texto/ping/pong) sí prueba que la autenticación pasó —
      // reset acá. 'Close' se maneja aparte y NO resetea: si reseteara,
      // un token inválido volvería a reintentar cada 1s para siempre en
      // vez de escalar el backoff (el bug original que motivó todo esto).
      realtimeBackoffIdx = 0;
      try {
        const notice = JSON.parse(msg.data) as { seq?: number };
        handleRealtimeNotice(notice.seq, get, set);
      } catch { /* mensaje no-JSON, no debería pasar */ }
    } else if (msg.type === 'Ping') {
      realtimeBackoffIdx = 0;
      // El plugin/librería de bajo nivel debería responder el pong de
      // protocolo solo; este eco es una red de respaldo barata por si
      // no lo hace (no confirmado en runtime, ver plan).
      void socket.send({ type: 'Pong', data: msg.data }).catch(() => {});
    } else if (msg.type === 'Close') {
      if (realtimeWs === socket) {
        realtimeWs = null;
        scheduleRealtimeReconnect(get, set);
      }
    }
  });

  try {
    await socket.send(JSON.stringify({ type: 'auth', token: syncConfig.accessToken }));
  } catch {
    realtimeWs = null;
    scheduleRealtimeReconnect(get, set);
  }
}

function scheduleRealtimeReconnect(get: SyncGet, set: SyncSet): void {
  if (realtimeReconnectTimer || !get().syncConfig.enabled) return;
  const delay = REALTIME_BACKOFF_MS[Math.min(realtimeBackoffIdx, REALTIME_BACKOFF_MS.length - 1)];
  realtimeBackoffIdx = Math.min(realtimeBackoffIdx + 1, REALTIME_BACKOFF_MS.length - 1);
  realtimeReconnectTimer = setTimeout(() => {
    realtimeReconnectTimer = null;
    void connectRealtime(get, set);
  }, delay);
}

function disconnectRealtime(): void {
  if (realtimeReconnectTimer) {
    clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = null;
  }
  realtimeBackoffIdx = 0;
  if (realtimeWs) {
    const socket = realtimeWs;
    realtimeWs = null;
    void socket.disconnect().catch(() => {});
  }
}

// Mejor esfuerzo: al recargar/cerrar el webview, el socket real del lado
// Rust queda vivo para siempre si no se le avisa (el estado de JS se
// resetea solo, pero eso no cierra el socket viejo) — visto en pruebas
// como conexiones TCP "zombie" acumulándose en el servidor tras varios
// reloads. No hay garantía de que el IPC async alcance a completarse
// antes de que el proceso muera, pero reduce el leak en el caso común.
window.addEventListener('beforeunload', () => {
  disconnectRealtime();
});

// ── Store ──────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  basePath: null,
  configDir: null,
  isConfigured: false,
  isLoading: true,
  activeSection: 'dashboard',
  projects: [],
  activeProject: null,
  tasks: [],
  activeTask: null,
  notes: [],
  noteFolders: [],
  activeNote: null,
  activeNoteFolder: null,
  dailyEntries: {},
  dailyMonths: [],
  activeDailyDate: null,
  activeDailyMonth: toISO(new Date()).slice(0, 7),
  currentView: 'list',
  isSearchOpen: false,
  searchQuery: '',
  searchResults: [],
  isSidebarCollapsed: false,
  toasts: [],
  confirmDestructiveActions: true,
  notificationsEnabled: true,
  defaultReminderMinutes: 5,
  workWeekDays: 5 as (5 | 6),
  holidaysAsNonWork: true,
  animationsEnabled: true,
  trashAutoPurgeEnabled: true,
  theme: (localStorage.getItem('theme') as Theme) || 'system',
  customThemes: (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('customThemes') || '[]') as CustomTheme[];
      // Normaliza temas creados antes de añadir bgTint/textTint/intensity.
      return parsed.map((ct) => ({
        ...ct,
        bgTint: ct.bgTint ?? (ct.base === 'light' ? '#f4f4f5' : '#1c1c1c'),
        textTint: ct.textTint ?? '#888888',
        intensity: ct.intensity ?? 50,
      }));
    } catch { return []; }
  })(),
  startupScreen: 'dashboard',
  language: (localStorage.getItem('language') as Language) || 'es',
  fontSize: Number(localStorage.getItem('fontSize')) || 17,
  isSettingsOpen: false,
  shortcuts: (() => {
    try { return { ...DEFAULT_SHORTCUTS, ...JSON.parse(localStorage.getItem('shortcuts') || '{}') }; }
    catch { return DEFAULT_SHORTCUTS; }
  })(),
  folderTags: (() => {
    try { return JSON.parse(localStorage.getItem('folderTags') || '{}'); }
    catch { return {}; }
  })(),
  gitConfig: (() => {
    try {
      return {
        enabled: false, remote: '', autoCommitHourly: false, autoPushDaily: false,
        ...JSON.parse(localStorage.getItem('gitConfig') || '{}'),
      };
    } catch { return { enabled: false, remote: '', autoCommitHourly: false, autoPushDaily: false, userName: '', userEmail: '' }; }
  })(),
  gitStatus: 'idle' as GitStatus,
  gitRemoteStatus: 'unknown' as GitRemoteStatus,
  lastCommitTime: null,
  isGitOpen: false,
  syncConfig: (() => {
    try {
      return {
        enabled: false, serverUrl: '', email: '', accessToken: '', refreshToken: '', deviceId: '',
        ...JSON.parse(localStorage.getItem('syncConfig') || '{}'),
      };
    } catch {
      return { enabled: false, serverUrl: '', email: '', accessToken: '', refreshToken: '', deviceId: '' };
    }
  })(),
  syncConnectionStatus: 'disconnected' as SyncConnectionStatus,
  syncErrorMsg: '',
  isSyncOpen: false,
  overtimeEntries: [],
  overtimeMonth: new Date().toISOString().slice(0, 7),
  overtimeMonths: [],
  overtimeMeta: (() => {
    try { return { colaborador: '', cedula: '', ...JSON.parse(localStorage.getItem('overtimeMeta') || '{}') }; }
    catch { return { colaborador: '', cedula: '' }; }
  })(),
  calendarEvents: [],
  activeCalendarEvent: null,
  absenceDays: [],

  showToast: ({ kind, title, description, durationMs = 3200 }) => {
    const id = uuidv4();
    set((state) => ({
      toasts: [...state.toasts, { id, kind, title, description }],
    }));
    if (durationMs > 0) {
      window.setTimeout(() => {
        get().preExitToast(id);
      }, durationMs);
    }
    return id;
  },

  preExitToast: (id) => set((state) => ({
    toasts: state.toasts.map((toast) => toast.id === id ? { ...toast, exiting: true } : toast),
  })),

  dismissToast: (id) => set((state) => ({
    toasts: state.toasts.filter((toast) => toast.id !== id),
  })),

  init: async () => {
    set({ isLoading: true });
    applyThemeToDOM(get().theme, false, get().customThemes);
    applyFontSizeToDOM(get().fontSize);
    applyAnimationsToDOM(get().animationsEnabled);
    try {
      const configDir = await fs.getAppConfigDir();
      set({ configDir });

      const cfg = await loadConfig(configDir);
      if (cfg?.basePath) {
        const exists = await fs.exists(cfg.basePath);
        if (exists) {
          const startupScreen: StartupScreen = cfg.startupScreen ?? 'dashboard';
          const language: Language = (cfg.language as Language) ?? 'es';
          set({
            basePath: cfg.basePath,
            isConfigured: true,
            startupScreen,
            activeSection: startupScreen,
            language,
            confirmDestructiveActions: cfg.confirmDestructiveActions ?? true,
            notificationsEnabled: cfg.notificationsEnabled ?? true,
            defaultReminderMinutes: cfg.defaultReminderMinutes ?? 5,
            workWeekDays: (cfg.workWeekDays as (5 | 6)) ?? 5,
            holidaysAsNonWork: cfg.holidaysAsNonWork ?? true,
            animationsEnabled: cfg.animationsEnabled ?? true,
            trashAutoPurgeEnabled: cfg.trashAutoPurgeEnabled ?? true,
          });

          const lastProject = cfg.lastOpenedProject || null;
          const lastNoteFolder = cfg.lastOpenedNoteFolder ?? null;

          // Cargar proyectos y carpetas de notas primero (loadTasks/loadNotes dependen de ellos)
          await Promise.all([get().loadProjects(), get().loadNoteFolders()]);

          // Luego cargar tareas, notas, dailys y overtime en paralelo
          await Promise.all([
            get().loadTasks(lastProject),
            get().loadNotes(lastNoteFolder),
            get().loadDailyMonths(),
            get().loadOvertimeMonths(),
            get().loadCalendarEvents(),
            get().loadAbsenceDays(),
          ]);

          if (lastProject) set({ activeProject: lastProject });
          if (lastNoteFolder !== undefined) set({ activeNoteFolder: lastNoteFolder });

          // Fetch remoto en background para detectar cambios pendientes
          const { gitConfig } = get();
          if (gitConfig.enabled && gitConfig.remote.trim()) {
            get().gitFetch().catch(() => {});
          }

          // Papelera: una pasada de purga ya al abrir (no espera al
          // primer tick del intervalo) + arranca el job periódico si
          // está habilitado. No depende de sync — es puro filesystem.
          if (get().trashAutoPurgeEnabled) {
            trash.purgeExpiredTrash(cfg.basePath).catch(() => {});
            startTrashPurgeInterval(get);
          }

          // Auto-reconexión de sync si ya estaba habilitado de una
          // sesión anterior — sin esto, hay que volver a entrar a
          // Ajustes después de cada reinicio de la app. Mismo patrón
          // optimista que syncConnect (arranca el poll/WS ya, drena y
          // reconcilia en background) — si el token guardado expiró,
          // no hay refresh automático todavía (ver plan), las
          // llamadas individuales fallan/encolan como en cualquier
          // corte de red, comportamiento aceptado explícitamente.
          const { syncConfig } = get();
          if (syncConfig.enabled && syncConfig.accessToken) {
            set({ syncConnectionStatus: 'connected' });
            void Promise.all([drainSyncQueue(get, set), drainContentSyncQueue(get, set)])
              .then(() => reconcileSync(get, set));
            startReconcileInterval(get, set);
            void connectRealtime(get, set);
          }
        }
      }
    } catch (e) {
      console.error('Init error:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  setupBasePath: async () => {
    const picked = await pickFolder();
    if (!picked) return;

    const basePath = picked;

    await fs.createDir(`${basePath}/projects/inbox`);
    await fs.createDir(`${basePath}/notes`);
    await fs.createDir(`${basePath}/dailys`);

    set({ basePath, isConfigured: true });
    await persistConfig(get);
    await get().loadProjects();
    await get().loadNoteFolders();
    await get().loadTasks(null);
    await get().loadNotes(null);
  },

  changeBasePath: async () => {
    const picked = await pickFolder();
    if (!picked) return;

    const basePath = picked;

    await fs.createDir(`${basePath}/projects/inbox`);
    await fs.createDir(`${basePath}/notes`);
    await fs.createDir(`${basePath}/dailys`);

    set({ basePath, activeProject: null, activeNote: null, activeNoteFolder: null, tasks: [], notes: [] });
    await persistConfig(get);
    await get().loadProjects();
    await get().loadNoteFolders();
    await get().loadTasks(null);
    await get().loadNotes(null);
  },

  // ── Tasks ──────────────────────────────────────────────────

  loadProjects: async () => {
    const { basePath } = get();
    if (!basePath) return;
    try {
      const pDir = projectsDir(basePath);
      await fs.createDir(pDir).catch(() => {});
      if (!(await fs.exists(`${pDir}/inbox`))) {
        await fs.createDir(`${pDir}/inbox`);
      }

      async function scanProjects(dirPath: string, prefix: string): Promise<string[]> {
        const entries = await fs.listDir(dirPath).catch(() => []);
        const result: string[] = [];
        for (const e of (entries as { name: string; path: string; is_dir: boolean }[]).filter((x) => x.is_dir)) {
          const fullPath = prefix ? `${prefix}/${e.name}` : e.name;
          result.push(fullPath);
          const children = await scanProjects(e.path, fullPath);
          result.push(...children);
        }
        return result;
      }

      const all = await scanProjects(pDir, '');
      const uniq = Array.from(new Set(all));
      const sorted = uniq.sort((a, b) => a.localeCompare(b));
      set({ projects: sorted.includes('inbox') ? sorted : ['inbox', ...sorted] });
    } catch (e) {
      console.error('loadProjects error:', e);
    }
  },

  loadTasks: async (project = null) => {
    const { basePath } = get();
    if (!basePath) return;
    try {
      const { projects } = get();
      const targetProjects = project
        ? projects.filter((p) => p === project || p.startsWith(project + '/'))
        : projects;
      const tasksByProject = await Promise.all(
        targetProjects.map(async (p) => {
          const dir = projectDir(basePath, p);
          try {
            const entries = await fs.listDir(dir);
            const mdFiles = entries.filter((e) => !e.is_dir && e.name.endsWith('.md'));
            const tasks = await Promise.all(mdFiles.map((f) => readTaskFromPath(f.path)));
            return tasks.filter((t): t is Task => t !== null);
          } catch { return []; }
        })
      );
      const allTasks = tasksByProject.flat();
      allTasks.sort((a, b) => b.created.localeCompare(a.created));
      set({ tasks: allTasks });
    } catch (e) {
      console.error('loadTasks error:', e);
    }
  },

  selectProject: (project) => {
    set({ activeProject: project });
    get().loadTasks(project);
    persistConfig(get).catch(() => {});
  },

  createProject: async (name, parent = '') => {
    const { basePath } = get();
    if (!basePath) return;
    const sanitized = name.trim().toLowerCase().replace(/\s+/g, '-');
    const fullPath = parent ? `${parent}/${sanitized}` : sanitized;
    await fs.createDir(projectDir(basePath, fullPath));
    await get().loadProjects();
  },

  renameProject: async (project, newName) => {
    const { basePath, tasks, activeTask, activeProject } = get();
    if (!basePath || !project || !newName.trim()) return;

    const parts = project.split('/');
    parts[parts.length - 1] = newName.trim().toLowerCase().replace(/\s+/g, '-');
    const renamed = parts.join('/');
    if (renamed === project) return;

    await fs.renameDir(projectDir(basePath, project), projectDir(basePath, renamed));

    const updatedTasks = tasks.map((t) => {
      if (t.project !== project && !t.project.startsWith(project + '/')) return t;
      const newProject = renamed + t.project.slice(project.length);
      return { ...t, project: newProject, filePath: taskFilePath(basePath, newProject, t.id) };
    });

    await Promise.all(
      updatedTasks
        .filter((t) => t.project === renamed || t.project.startsWith(renamed + '/'))
        .map((t) => fs.writeFile(t.filePath, serializeTask(t)))
    );

    const newActiveTask = activeTask && (activeTask.project === project || activeTask.project.startsWith(project + '/'))
      ? updatedTasks.find((t) => t.id === activeTask.id) ?? null
      : activeTask;

    const newActiveProject = activeProject === project
      ? renamed
      : activeProject?.startsWith(project + '/')
        ? renamed + activeProject.slice(project.length)
        : activeProject;

    set({ tasks: updatedTasks, activeTask: newActiveTask, activeProject: newActiveProject });
    await get().loadProjects();
  },

  deleteProject: async (project) => {
    const { basePath, tasks, activeTask, activeProject } = get();
    if (!basePath || !project || project === 'inbox') return;

    await fs.deleteDir(projectDir(basePath, project));

    const remainingTasks = tasks.filter((t) => t.project !== project && !t.project.startsWith(project + '/'));
    const nextActiveTask = activeTask && (activeTask.project === project || activeTask.project.startsWith(project + '/'))
      ? null
      : activeTask;
    const nextActiveProject = activeProject === project || activeProject?.startsWith(project + '/') ? null : activeProject;

    set({ tasks: remainingTasks, activeTask: nextActiveTask, activeProject: nextActiveProject });
    await get().loadProjects();
  },

  moveProject: async (project, targetParent) => {
    const { basePath, tasks, activeTask, activeProject } = get();
    if (!basePath || !project) return;
    if (targetParent === project || targetParent.startsWith(project + '/')) return;

    const leaf = project.split('/').pop()!;
    const moved = targetParent ? `${targetParent}/${leaf}` : leaf;
    if (moved === project) return;

    await fs.renameDir(projectDir(basePath, project), projectDir(basePath, moved));

    const updatedTasks = tasks.map((t) => {
      if (t.project !== project && !t.project.startsWith(project + '/')) return t;
      const newProject = moved + t.project.slice(project.length);
      return { ...t, project: newProject, filePath: taskFilePath(basePath, newProject, t.id) };
    });

    await Promise.all(
      updatedTasks
        .filter((t) => t.project === moved || t.project.startsWith(moved + '/'))
        .map((t) => fs.writeFile(t.filePath, serializeTask(t)))
    );

    const newActiveTask = activeTask && (activeTask.project === project || activeTask.project.startsWith(project + '/'))
      ? updatedTasks.find((t) => t.id === activeTask.id) ?? null
      : activeTask;

    const newActiveProject = activeProject === project
      ? moved
      : activeProject?.startsWith(project + '/')
        ? moved + activeProject.slice(project.length)
        : activeProject;

    set({ tasks: updatedTasks, activeTask: newActiveTask, activeProject: newActiveProject });
    await get().loadProjects();
  },

  createTask: async (title, project, content = '', taskCode?: string) => {
    const { basePath, activeProject } = get();
    if (!basePath) throw new Error('No base path');
    const targetProject = project || activeProject || 'inbox';
    const id = uuidv4();
    const today = formatDate(new Date());
    // Validate taskCode uniqueness
    if (taskCode) {
      const duplicate = get().tasks.find((t) => t.taskCode && t.taskCode === taskCode);
      if (duplicate) {
        const language = get().language;
        get().showToast({
          kind: 'error',
          title: t(language, 'tasks', 'taskCodeDuplicate'),
          description: `"${taskCode}"`,
        });
        taskCode = undefined;
      }
    }
    const task: Task = {
      id,
      title: title.trim() || 'Nueva tarea',
      status: 'todo',
      tags: [],
      project: targetProject,
      created: today,
      linked_paths: [],
      content,
      taskCode: taskCode || undefined,
      filePath: taskFilePath(basePath, targetProject, id),
    };
    await fs.writeFile(task.filePath, serializeTask(task));
    set((state) => ({ tasks: [task, ...state.tasks], activeTask: task }));
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
    void syncCreateTask(get, set, task);
    return task;
  },

  updateTask: async (task) => {
    // Validate taskCode uniqueness (skip own id)
    if (task.taskCode) {
      const duplicate = get().tasks.find(
        (t) => t.id !== task.id && t.taskCode && t.taskCode === task.taskCode
      );
      if (duplicate) {
        const language = get().language;
        get().showToast({
          kind: 'error',
          title: t(language, 'tasks', 'taskCodeDuplicate'),
          description: `"${task.taskCode}"`,
        });
        return;
      }
    }

    const prev = get().tasks.find((t) => t.id === task.id);
    const today = formatDate(new Date());
    const normalizedTask: Task = { ...task };

    if (normalizedTask.status === 'done') {
      // Sella fecha de completado al primer cambio a done.
      if (!normalizedTask.completedAt) {
        normalizedTask.completedAt = prev?.completedAt ?? today;
      }
    } else if (normalizedTask.completedAt) {
      // Si vuelve a no-done, elimina la marca de completado.
      delete normalizedTask.completedAt;
    }

    await fs.writeFile(normalizedTask.filePath, serializeTask(normalizedTask));
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === normalizedTask.id ? normalizedTask : t)),
      activeTask: state.activeTask?.id === normalizedTask.id ? normalizedTask : state.activeTask,
    }));
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
    const changedFields = diffTaskFields(prev, normalizedTask);
    if (Object.keys(changedFields).length > 0) void syncPatchTask(get, set, normalizedTask.id, changedFields);
  },

  deleteTask: async (task) => {
    const { basePath } = get();
    if (basePath) await trash.writeTrashRecord(basePath, 'task', task.id, task.title, task);
    await fs.deleteFile(task.filePath);
    const language = get().language;
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== task.id),
      activeTask: state.activeTask?.id === task.id ? null : state.activeTask,
    }));
    get().showToast({
      kind: 'success',
      title: t(language, 'toast', 'taskDeleted'),
      description: task.title,
    });
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
    void syncDeleteTask(get, task.id);
  },

  setActiveTask: (task) => set({ activeTask: task, activeCalendarEvent: null }),
  setActiveCalendarEvent: (event) => set({ activeCalendarEvent: event, activeTask: null }),

  moveTask: async (task, toProject) => {
    const { basePath } = get();
    if (!basePath || task.project === toProject) return;
    const newFilePath = taskFilePath(basePath, toProject, task.id);
    const updatedTask: Task = { ...task, project: toProject, filePath: newFilePath };
    await fs.writeFile(newFilePath, serializeTask(updatedTask));
    await fs.deleteFile(task.filePath);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? updatedTask : t)),
      activeTask: state.activeTask?.id === task.id ? updatedTask : state.activeTask,
    }));
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  // ── Notes ──────────────────────────────────────────────────

  loadNoteFolders: async () => {
    const { basePath } = get();
    if (!basePath) return;
    try {
      const nDir = notesDir(basePath);
      await fs.createDir(nDir).catch(() => {});

      async function scanFolders(dirPath: string, prefix: string): Promise<string[]> {
        const entries = await fs.listDir(dirPath).catch(() => []);
        const result: string[] = [];
        for (const e of (entries as { name: string; path: string; is_dir: boolean }[]).filter(e => e.is_dir)) {
          const fullPath = prefix ? `${prefix}/${e.name}` : e.name;
          result.push(fullPath);
          const children = await scanFolders(`${dirPath}/${e.name}`, fullPath);
          result.push(...children);
        }
        return result;
      }

      const folders = await scanFolders(nDir, '');
      set({ noteFolders: folders });
    } catch (e) {
      console.error('loadNoteFolders error:', e);
    }
  },

  loadNotes: async (folder = null) => {
    const { basePath } = get();
    if (!basePath) return;
    try {
      const allNotes: Note[] = [];
      const nDir = notesDir(basePath);

      if (folder === null) {
        // All notes: root + all subfolders
        const rootEntries = await fs.listDir(nDir).catch(() => [] as { name: string; path: string; is_dir: boolean }[]);
        const rootFiles = (rootEntries as { name: string; path: string; is_dir: boolean }[]).filter(
          (e) => !e.is_dir && e.name.endsWith('.md')
        );
        const rootNotes = await Promise.all(rootFiles.map((f) => readNoteFromPath(f.path)));
        allNotes.push(...rootNotes.filter((n): n is Note => n !== null));

        const { noteFolders } = get();
        const folderNotes = await Promise.all(
          noteFolders.map(async (nf) => {
            const folderEntries = await fs.listDir(noteFolderDir(basePath, nf)).catch(() => []);
            const mdFiles = (folderEntries as { name: string; path: string; is_dir: boolean }[]).filter(
              (e) => !e.is_dir && e.name.endsWith('.md')
            );
            const notes = await Promise.all(mdFiles.map((f) => readNoteFromPath(f.path)));
            return notes.filter((n): n is Note => n !== null);
          })
        );
        allNotes.push(...folderNotes.flat());
      } else if (folder === '') {
        // Unfiled notes (root only)
        const rootEntries = await fs.listDir(nDir).catch(() => []);
        const rootFiles = (rootEntries as { name: string; path: string; is_dir: boolean }[]).filter(
          (e) => !e.is_dir && e.name.endsWith('.md')
        );
        const notes = await Promise.all(rootFiles.map((f) => readNoteFromPath(f.path)));
        allNotes.push(...notes.filter((n): n is Note => n !== null));
      } else {
        // Specific folder
        const folderEntries = await fs.listDir(noteFolderDir(basePath, folder)).catch(() => []);
        const mdFiles = (folderEntries as { name: string; path: string; is_dir: boolean }[]).filter(
          (e) => !e.is_dir && e.name.endsWith('.md')
        );
        const notes = await Promise.all(mdFiles.map((f) => readNoteFromPath(f.path)));
        allNotes.push(...notes.filter((n): n is Note => n !== null));
      }

      // Pinned first, then by updated desc
      allNotes.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updated.localeCompare(a.updated);
      });
      set({ notes: allNotes });
    } catch (e) {
      console.error('loadNotes error:', e);
    }
  },

  selectNoteFolder: async (folder) => {
    // Si hay una nota vacía activa, descartarla antes de cambiar carpeta
    const { activeNote } = get();
    if (activeNote && !activeNote.title.trim() && !activeNote.content.trim()) {
      await get().deleteNote(activeNote, { showToast: false });
    }
    set({ activeNoteFolder: folder, activeNote: null });
    get().loadNotes(folder);
    persistConfig(get).catch(() => {});
  },

  createNoteFolder: async (name, parent?) => {
    const { basePath } = get();
    if (!basePath) return;
    const sanitized = name.trim().toLowerCase().replace(/\s+/g, '-');
    const fullPath = parent ? `${parent}/${sanitized}` : sanitized;
    await fs.createDir(noteFolderDir(basePath, fullPath));
    await get().loadNoteFolders();
  },

  renameNoteFolder: async (folder, newName) => {
    const { basePath, notes, activeNote, activeNoteFolder, folderTags } = get();
    if (!basePath || !folder || !newName.trim() || folder === newName) return;
    // Keep parent prefix, only rename the last segment
    const parts = folder.split('/');
    parts[parts.length - 1] = newName.trim().toLowerCase().replace(/\s+/g, '-');
    const sanitized = parts.join('/');
    if (sanitized === folder) return;
    const oldDirPath = noteFolderDir(basePath, folder);
    const newDirPath = noteFolderDir(basePath, sanitized);
    await fs.renameDir(oldDirPath, newDirPath);
    // Update notes in this folder and all descendant folders
    const updatedNotes = notes.map((n) => {
      if (n.folder !== folder && !n.folder.startsWith(folder + '/')) return n;
      const newFolder = sanitized + n.folder.slice(folder.length);
      const newFilePath = noteFilePath(basePath, newFolder, n.id);
      return { ...n, folder: newFolder, filePath: newFilePath };
    });
    // Update folderTags keys
    const updatedFolderTags: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(folderTags)) {
      if (k === folder || k.startsWith(folder + '/')) {
        updatedFolderTags[sanitized + k.slice(folder.length)] = v;
      } else {
        updatedFolderTags[k] = v;
      }
    }
    localStorage.setItem('folderTags', JSON.stringify(updatedFolderTags));
    const newActiveNote = activeNote?.folder === folder || activeNote?.folder.startsWith(folder + '/')
      ? updatedNotes.find((n) => n.id === activeNote!.id) ?? null
      : activeNote;
    const newActiveFolder = activeNoteFolder === folder
      ? sanitized
      : activeNoteFolder?.startsWith(folder + '/')
        ? sanitized + activeNoteFolder.slice(folder.length)
        : activeNoteFolder;
    set({ notes: updatedNotes, activeNote: newActiveNote, activeNoteFolder: newActiveFolder, folderTags: updatedFolderTags });
    await get().loadNoteFolders();
  },

  deleteNoteFolder: async (folder) => {
    const { basePath, notes, activeNote, activeNoteFolder, folderTags } = get();
    if (!basePath || !folder) return;
    await fs.deleteDir(noteFolderDir(basePath, folder));
    // Remove notes in this folder and all descendants
    const remainingNotes = notes.filter((n) => n.folder !== folder && !n.folder.startsWith(folder + '/'));
    // Remove folderTags for deleted folders
    const updatedFolderTags = Object.fromEntries(
      Object.entries(folderTags).filter(([k]) => k !== folder && !k.startsWith(folder + '/'))
    );
    localStorage.setItem('folderTags', JSON.stringify(updatedFolderTags));
    const wasActive = activeNoteFolder === folder || (activeNoteFolder?.startsWith(folder + '/') ?? false);
    set({
      notes: remainingNotes,
      activeNote: (activeNote?.folder === folder || activeNote?.folder.startsWith(folder + '/')) ? null : activeNote,
      activeNoteFolder: wasActive ? null : activeNoteFolder,
      folderTags: updatedFolderTags,
    });
    await get().loadNoteFolders();
  },

  createNote: async () => {
    const { basePath, activeNoteFolder } = get();
    if (!basePath) throw new Error('No base path');
    const folder = activeNoteFolder ?? '';
    const id = uuidv4();
    const today = formatDate(new Date());
    const note: Note = {
      id,
      title: '',
      folder,
      tags: [],
      created: today,
      updated: today,
      pinned: false,
      content: '',
      filePath: noteFilePath(basePath, folder, id),
    };
    if (folder) await fs.createDir(noteFolderDir(basePath, folder)).catch(() => {});
    await fs.writeFile(note.filePath, serializeNote(note));
    set((state) => ({ notes: [note, ...state.notes], activeNote: note }));
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
    void syncCreateNote(get, set, note);
    return note;
  },

  importNotesFromPaths: async (paths) => {
    const { basePath, activeNoteFolder, language } = get();
    if (!basePath) return;
    const folder = activeNoteFolder ?? '';
    const imported: Note[] = [];
    for (const filePath of paths) {
      try {
        const raw = await fs.readFile(filePath);
        const id = uuidv4();
        const today = formatDate(new Date());
        const parsed = parseNote(raw, filePath);
        let title: string;
        let content: string;
        let tags: string[] = [];
        if (parsed) {
          title = parsed.title;
          content = parsed.content;
          tags = parsed.tags;
        } else {
          const headingMatch = raw.match(/^#\s+(.+)$/m);
          const filename = filePath.split('/').pop()?.split('\\').pop()?.replace(/\.(md|txt)$/i, '') ?? 'Imported';
          title = headingMatch ? headingMatch[1].trim() : filename;
          content = raw.trim();
        }
        const note: Note = {
          id,
          title,
          folder,
          tags,
          created: today,
          updated: today,
          pinned: false,
          content,
          filePath: noteFilePath(basePath, folder, id),
        };
        if (folder) await fs.createDir(noteFolderDir(basePath, folder)).catch(() => {});
        await fs.writeFile(note.filePath, serializeNote(note));
        imported.push(note);
      } catch { /* skip unreadable files */ }
    }
    if (imported.length > 0) {
      set((state) => ({ notes: [...imported, ...state.notes], activeNote: imported[0] }));
      if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
      imported.forEach((note) => void syncCreateNote(get, set, note));
      get().showToast({
        kind: 'success',
        title: t(language, 'toast', 'noteImported'),
        description: imported.length === 1 ? imported[0].title || t(language, 'notes', 'untitled') : `${imported.length} ${t(language, 'notes', 'title').toLowerCase()}`,
      });
    }
  },

  importNotesFromContent: async (files) => {
    const { basePath, activeNoteFolder, language } = get();
    if (!basePath) return;
    const folder = activeNoteFolder ?? '';
    const imported: Note[] = [];
    for (const { name, content: rawContent } of files) {
      try {
        const id = uuidv4();
        const today = formatDate(new Date());
        const parsed = parseNote(rawContent, '');
        let title: string;
        let content: string;
        let tags: string[] = [];
        if (parsed) {
          title = parsed.title;
          content = parsed.content;
          tags = parsed.tags;
        } else {
          const headingMatch = rawContent.match(/^#\s+(.+)$/m);
          title = headingMatch ? headingMatch[1].trim() : name.replace(/\.(md|txt)$/i, '');
          content = rawContent.trim();
        }
        const note: Note = {
          id,
          title,
          folder,
          tags,
          created: today,
          updated: today,
          pinned: false,
          content,
          filePath: noteFilePath(basePath, folder, id),
        };
        if (folder) await fs.createDir(noteFolderDir(basePath, folder)).catch(() => {});
        await fs.writeFile(note.filePath, serializeNote(note));
        imported.push(note);
      } catch { /* skip unreadable entries */ }
    }
    if (imported.length > 0) {
      set((state) => ({ notes: [...imported, ...state.notes], activeNote: imported[0] }));
      if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
      imported.forEach((note) => void syncCreateNote(get, set, note));
      get().showToast({
        kind: 'success',
        title: t(language, 'toast', 'noteImported'),
        description: imported.length === 1 ? imported[0].title || t(language, 'notes', 'untitled') : `${imported.length} ${t(language, 'notes', 'title').toLowerCase()}`,
      });
    }
  },

  updateNote: async (note) => {
    const prev = get().notes.find((n) => n.id === note.id);
    const updated = { ...note, updated: formatDate(new Date()) };
    await fs.writeFile(updated.filePath, serializeNote(updated));
    set((state) => ({
      notes: state.notes.map((n) => (n.id === updated.id ? updated : n)),
      activeNote: state.activeNote?.id === updated.id ? updated : state.activeNote,
    }));
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
    const changedFields = diffNoteFields(prev, updated);
    if (Object.keys(changedFields).length > 0) void syncPatchNote(get, set, updated.id, changedFields);
  },

  deleteNote: async (note, options) => {
    const showToast = options?.showToast ?? true;
    const { basePath } = get();
    // Una nota vacía (sin título ni contenido) es un descarte automático
    // (ver selectNoteFolder/setSection/NoteList "descartar nota vacía"),
    // no un borrado real del usuario — no vale la pena ensuciar la
    // papelera con esas.
    const isEmpty = !note.title.trim() && !note.content.trim();
    if (basePath && !isEmpty) {
      await trash.writeTrashRecord(basePath, 'note', note.id, note.title || note.id, note);
    }
    await fs.deleteFile(note.filePath);
    await fs.deleteFile(noteContentStatePath(note.filePath)).catch(() => {});
    const language = get().language;
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== note.id),
      activeNote: state.activeNote?.id === note.id ? null : state.activeNote,
    }));
    void syncDeleteNote(get, note.id);
    if (showToast) {
      get().showToast({
        kind: 'success',
        title: t(language, 'toast', 'noteDeleted'),
        description: note.title || t(language, 'notes', 'untitled'),
      });
    }
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  duplicateNote: async (note) => {
    const { basePath } = get();
    if (!basePath) return;
    const id = uuidv4();
    const today = formatDate(new Date());
    const copy: Note = {
      ...note,
      id,
      title: note.title ? `${note.title} (copia)` : '(copia)',
      created: today,
      updated: today,
      pinned: false,
      filePath: noteFilePath(basePath, note.folder, id),
    };
    await fs.writeFile(copy.filePath, serializeNote(copy));
    set((state) => ({ notes: [copy, ...state.notes], activeNote: copy }));
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  setActiveNote: (note) => set({ activeNote: note }),

  renameNote: async (note, newTitle) => {
    await get().updateNote({ ...note, title: newTitle });
  },

  setFolderTags: (folder, tags) => {
    const updated = { ...get().folderTags, [folder]: tags };
    localStorage.setItem('folderTags', JSON.stringify(updated));
    set({ folderTags: updated });
  },

  replaceFolderTags: (tags) => {
    localStorage.setItem('folderTags', JSON.stringify(tags));
    set({ folderTags: tags });
  },

  moveNoteFolder: async (folder, targetParent) => {
    const { basePath, notes, activeNote, activeNoteFolder, folderTags } = get();
    // targetParent puede ser '' para mover a la raíz
    if (!basePath || !folder) return;
    // Evitar mover a sí misma o a un descendiente
    if (targetParent === folder || targetParent.startsWith(folder + '/')) return;
    const lastSegment = folder.split('/').pop()!;
    const newPath = targetParent ? `${targetParent}/${lastSegment}` : lastSegment;
    if (newPath === folder) return;
    const oldDirPath = noteFolderDir(basePath, folder);
    const newDirPath = noteFolderDir(basePath, newPath);
    await fs.renameDir(oldDirPath, newDirPath);
    // Actualizar notas y carpetas descendientes
    const updatedNotes = notes.map((n) => {
      if (n.folder !== folder && !n.folder.startsWith(folder + '/')) return n;
      const newFolder = newPath + n.folder.slice(folder.length);
      return { ...n, folder: newFolder, filePath: noteFilePath(basePath, newFolder, n.id) };
    });
    // Actualizar folderTags
    const updatedFolderTags: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(folderTags)) {
      if (k === folder || k.startsWith(folder + '/')) {
        updatedFolderTags[newPath + k.slice(folder.length)] = v;
      } else {
        updatedFolderTags[k] = v;
      }
    }
    localStorage.setItem('folderTags', JSON.stringify(updatedFolderTags));
    const newActiveNote = (activeNote?.folder === folder || activeNote?.folder.startsWith(folder + '/'))
      ? updatedNotes.find(n => n.id === activeNote!.id) ?? null
      : activeNote;
    const newActiveFolder = activeNoteFolder === folder
      ? newPath
      : activeNoteFolder?.startsWith(folder + '/')
        ? newPath + activeNoteFolder.slice(folder.length)
        : activeNoteFolder;
    set({ notes: updatedNotes, activeNote: newActiveNote, activeNoteFolder: newActiveFolder, folderTags: updatedFolderTags });
    await get().loadNoteFolders();
  },

  duplicateNoteFolder: async (folder, targetParent) => {
    const { basePath, notes, noteFolders, folderTags } = get();
    if (!basePath || !folder) return;
    const lastSegment = folder.split('/').pop()!;
    const baseName = targetParent ? `${targetParent}/${lastSegment}` : lastSegment;
    // Generar nombre único si ya existe
    let finalPath = baseName;
    if (finalPath === folder || noteFolders.includes(finalPath)) {
      finalPath = `${baseName}_copia`;
      let i = 2;
      while (noteFolders.includes(finalPath) || finalPath === folder) {
        finalPath = `${baseName}_copia${i++}`;
      }
    }
    // Copiar notas de la carpeta y descendientes
    const folderNotes = notes.filter(n => n.folder === folder || n.folder.startsWith(folder + '/'));
    const newNotes: Note[] = [];
    for (const note of folderNotes) {
      const newFolder = finalPath + note.folder.slice(folder.length);
      const newId = uuidv4();
      const newFilePath = noteFilePath(basePath, newFolder, newId);
      await fs.createDir(noteFolderDir(basePath, newFolder)).catch(() => {});
      const newNote: Note = { ...note, id: newId, folder: newFolder, filePath: newFilePath,
        created: formatDate(new Date()), updated: formatDate(new Date()) };
      await fs.writeFile(newFilePath, serializeNote(newNote));
      newNotes.push(newNote);
    }
    // Si no había notas, crear la carpeta vacía de todos modos
    if (folderNotes.length === 0) {
      await fs.createDir(noteFolderDir(basePath, finalPath)).catch(() => {});
    }
    // Copiar folderTags
    const updatedFolderTags = { ...folderTags };
    for (const [k, v] of Object.entries(folderTags)) {
      if (k === folder || k.startsWith(folder + '/')) {
        updatedFolderTags[finalPath + k.slice(folder.length)] = v;
      }
    }
    localStorage.setItem('folderTags', JSON.stringify(updatedFolderTags));
    set(state => ({ notes: [...state.notes, ...newNotes], folderTags: updatedFolderTags }));
    await get().loadNoteFolders();
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  moveNote: async (note, toFolder) => {
    const { basePath } = get();
    if (!basePath || note.folder === toFolder) return;
    const newFilePath = noteFilePath(basePath, toFolder, note.id);
    if (toFolder) await fs.createDir(noteFolderDir(basePath, toFolder)).catch(() => {});
    const updatedNote: Note = { ...note, folder: toFolder, filePath: newFilePath, updated: formatDate(new Date()) };
    await fs.writeFile(newFilePath, serializeNote(updatedNote));
    await fs.deleteFile(note.filePath);
    set((state) => ({
      notes: state.notes.map((n) => (n.id === note.id ? updatedNote : n)),
      activeNote: state.activeNote?.id === note.id ? updatedNote : state.activeNote,
    }));
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  toggleNotePin: async (note) => {
    const updated: Note = { ...note, pinned: !note.pinned };
    await get().updateNote(updated);
  },

  // ── Dailys ─────────────────────────────────────────────────

  loadDailyMonths: async () => {
    const { basePath } = get();
    if (!basePath) return;
    const months: string[] = [];
    try {
      const base = dailysBaseDir(basePath);
      await fs.createDir(base).catch(() => {});
      const yearDirs = await fs.listDir(base).catch(() => []);
      for (const y of (yearDirs as { name: string; is_dir: boolean }[]).filter((e) => e.is_dir)) {
        const monthDirs = await fs.listDir(`${base}/${y.name}`).catch(() => []);
        for (const mo of (monthDirs as { name: string; is_dir: boolean }[]).filter((e) => e.is_dir)) {
          months.push(`${y.name}-${mo.name}`);
        }
      }
    } catch { /* vacío */ }
    months.sort().reverse();
    set({ dailyMonths: months });
  },

  loadDailyMonth: async (yearMonth) => {
    if (loadingDailyMonths.has(yearMonth)) return;
    const { basePath } = get();
    if (!basePath) return;
    loadingDailyMonths.add(yearMonth);
    const [year, month] = yearMonth.split('-');
    const fp = dailyMonthFilePath(basePath, year, month);
    try {
      const raw = await fs.readFile(fp);
      const entries = parseDailyFile(raw);
      set((s) => ({ dailyEntries: { ...s.dailyEntries, ...entries } }));
    } catch { /* archivo no existe aún */ }
    finally { loadingDailyMonths.delete(yearMonth); }
  },

  saveDailyEntry: async (date, activities) => {
    const { basePath } = get();
    if (!basePath) return;
    const year = date.slice(0, 4);
    const month = date.slice(5, 7);
    const yearMonth = `${year}-${month}`;
    const fp = dailyMonthFilePath(basePath, year, month);

    // Cargar entradas existentes del mes
    let existing: Record<string, string> = {};
    try {
      const raw = await fs.readFile(fp);
      existing = parseDailyFile(raw);
    } catch { /* archivo nuevo */ }

    const updated = { ...existing, [date]: activities };
    await fs.createDir(dailyMonthDir(basePath, year, month));
    await fs.writeFile(fp, serializeDailyFile(updated, yearMonth));

    set((s) => ({
      dailyEntries: { ...s.dailyEntries, [date]: activities },
      dailyMonths: s.dailyMonths.includes(yearMonth)
        ? s.dailyMonths
        : [yearMonth, ...s.dailyMonths].sort().reverse(),
    }));
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
    void pushDailyContentUpdate(get, set, date, existing[date] ?? '', activities);
  },

  setActiveDailyDate: (date) => set({ activeDailyDate: date }),

  setActiveDailyMonth: (yearMonth) => {
    set({ activeDailyMonth: yearMonth });
    get().loadDailyMonth(yearMonth);
  },

  createTodayDaily: () => {
    const today = toISO(new Date());
    const yearMonth = today.slice(0, 7);
    get().loadDailyMonth(yearMonth).then(() => {
      set((s) => ({
        activeDailyDate: today,
        activeDailyMonth: yearMonth,
        dailyMonths: s.dailyMonths.includes(yearMonth)
          ? s.dailyMonths
          : [yearMonth, ...s.dailyMonths].sort().reverse(),
      }));
    });
  },

  createDailyForDate: (date) => {
    const yearMonth = date.slice(0, 7);
    get().loadDailyMonth(yearMonth).then(() => {
      set((s) => ({
        activeDailyDate: date,
        activeDailyMonth: yearMonth,
        dailyMonths: s.dailyMonths.includes(yearMonth)
          ? s.dailyMonths
          : [yearMonth, ...s.dailyMonths].sort().reverse(),
      }));
    });
  },

  copyDailyFormat: async (date) => {
    const { basePath, absenceDays } = get();
    const todayDate = dateFromISO(date);
    const absenceDates = new Set(absenceDays.map((a) => a.date));
    const prevDate = getPreviousWorkingDay(todayDate, absenceDates);
    const prevISO = toISO(prevDate);

    // Asegurarse de tener cargado el mes del día anterior (puede ser distinto)
    if (basePath) {
      const prevYear = prevISO.slice(0, 4);
      const prevMonth = prevISO.slice(5, 7);
      const fp = dailyMonthFilePath(basePath, prevYear, prevMonth);
      try {
        const raw = await fs.readFile(fp);
        const entries = parseDailyFile(raw);
        // Solo mezcla si no están ya cargadas
        set((s) => ({ dailyEntries: { ...entries, ...s.dailyEntries } }));
      } catch { /* mes sin archivo */ }
    }

    const { dailyEntries } = get();
    const prevActivities = dailyEntries[prevISO] || '';
    const todayActivities = dailyEntries[date] || '';
    const text = buildDailyCopyText(prevDate, prevActivities, todayDate, todayActivities);
    return text;
  },

  deleteDailyEntry: async (date) => {
    const { basePath } = get();
    if (!basePath) return;
    const language = get().language;
    const year = date.slice(0, 4);
    const month = date.slice(5, 7);
    const yearMonth = `${year}-${month}`;
    const fp = dailyMonthFilePath(basePath, year, month);
    let existing: Record<string, string> = {};
    try {
      const raw = await fs.readFile(fp);
      existing = parseDailyFile(raw);
    } catch { /* no file */ }
    const dayContent = existing[date];
    if (dayContent !== undefined) {
      await trash.writeTrashRecord(basePath, 'daily_entry', date, date, { date, content: dayContent });
    }
    delete existing[date];
    await fs.createDir(dailyMonthDir(basePath, year, month));
    await fs.writeFile(fp, serializeDailyFile(existing, yearMonth));
    await deleteDailyContentState(basePath, date);
    set((s) => {
      const { [date]: _removed, ...rest } = s.dailyEntries;
      return {
        dailyEntries: rest,
        activeDailyDate: s.activeDailyDate === date ? null : s.activeDailyDate,
      };
    });
    void syncDeleteDailyEntry(get, date);
    get().showToast({
      kind: 'success',
      title: t(language, 'toast', 'dailyDeleted'),
      description: date,
    });
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  deleteDailyMonth: async (yearMonth) => {
    const base = get().basePath;
    if (!base) return;
    const language = get().language;
    const [year, month] = yearMonth.split('-');
    const dir = dailyMonthDir(base, year, month);
    try { await fs.deleteDir(dir); } catch { /* ya no existe */ }
    set((s) => {
      const entries = { ...s.dailyEntries };
      Object.keys(entries).forEach((d) => { if (d.startsWith(yearMonth)) delete entries[d]; });
      const newMonths = s.dailyMonths.filter((m) => m !== yearMonth);
      const newActive = s.activeDailyDate?.startsWith(yearMonth) ? null : s.activeDailyDate;
      const newActiveMonth = s.activeDailyMonth === yearMonth
        ? (newMonths[0] ?? yearMonth)
        : s.activeDailyMonth;
      return { dailyEntries: entries, dailyMonths: newMonths, activeDailyDate: newActive, activeDailyMonth: newActiveMonth };
    });
    get().showToast({
      kind: 'success',
      title: t(language, 'toast', 'dailyMonthDeleted'),
      description: yearMonth,
    });
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  // ── UI ──────────────────────────────────────────────────────

  setSection: async (section) => {
    // Si hay una nota vacía activa y salimos de notas, descartarla
    const { activeNote, activeSection } = get();
    if (activeSection === 'notes' && activeNote && !activeNote.title.trim() && !activeNote.content.trim()) {
      await get().deleteNote(activeNote, { showToast: false });
    }
    set({ activeSection: section });
  },

  setView: (view) => set({ currentView: view }),

  toggleSearch: () => set((s) => ({ isSearchOpen: !s.isSearchOpen, searchQuery: '', searchResults: [] })),

  runSearch: async (query) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    const { basePath } = get();
    if (!basePath) return;
    try {
      const raw = await fs.searchTasks(basePath, query);
      set({ searchResults: parseSearchResults(raw) });
    } catch (e) {
      console.error('Search error:', e);
    }
  },

  addLinkedPath: async () => {
    const { activeTask } = get();
    if (!activeTask) return;
    const result = await pickFile(true);
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    const updated: Task = {
      ...activeTask,
      linked_paths: [...new Set([...activeTask.linked_paths, ...paths])],
    };
    await get().updateTask(updated);
  },

  removeLinkedPath: async (task, path) => {
    const updated: Task = { ...task, linked_paths: task.linked_paths.filter((p) => p !== path) };
    await get().updateTask(updated);
  },

  toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),

  loadOvertimeMonths: async () => {
    const { basePath } = get();
    if (!basePath) return;
    const months: string[] = [];
    try {
      const base = overtimeBaseDir(basePath);
      await fs.createDir(base).catch(() => {});
      const yearDirs = await fs.listDir(base).catch(() => []);
      for (const y of (yearDirs as { name: string; is_dir: boolean }[]).filter((e) => e.is_dir)) {
        const monthDirs = await fs.listDir(`${base}/${y.name}`).catch(() => []);
        for (const mo of (monthDirs as { name: string; is_dir: boolean }[]).filter((e) => e.is_dir)) {
          months.push(`${y.name}-${mo.name}`);
        }
      }
    } catch { /* vacío */ }
    months.sort().reverse();
    set({ overtimeMonths: months });
  },

  loadOvertimeMonth: async (yearMonth) => {
    if (loadingOvertimeMonths.has(yearMonth)) return;
    const base = get().basePath;
    if (!base) return;
    loadingOvertimeMonths.add(yearMonth);
    set({ overtimeMonth: yearMonth });
    const [year, month] = yearMonth.split('-');
    try {
      await fs.createDir(overtimeMonthDir(base, year, month)).catch(() => {});
      const path = overtimeMonthFilePath(base, year, month);
      if (!(await fs.exists(path))) { set({ overtimeEntries: [] }); return; }
      const raw = await fs.readFile(path);
      try {
        const match = raw.match(/^---\n([\s\S]*?)\n---/);
        set({ overtimeEntries: match ? (JSON.parse(match[1]).entries ?? []) : [] });
      } catch { set({ overtimeEntries: [] }); }
    } finally { loadingOvertimeMonths.delete(yearMonth); }
  },

  saveOvertimeEntry: async (input) => {
    const base = get().basePath;
    if (!base) return;
    const calc = calcOvertimeBreakdown(input.fecha, input.horaInicio, input.horaFinal);
    const id = input.id ?? uuidv4();
    const entry: OvertimeEntry = { ...input, id, ...calc };
    // Usar el mes de la fecha de la entrada, no el mes visible en la lista
    const ym = input.fecha.slice(0, 7);
    const [year, month] = ym.split('-');
    await fs.createDir(overtimeMonthDir(base, year, month));
    const path = overtimeMonthFilePath(base, year, month);
    // Leer del archivo para no depender del estado en memoria (evita sobreescritura)
    let existing: OvertimeEntry[] = [];
    if (await fs.exists(path)) {
      try {
        const raw = await fs.readFile(path);
        const match = raw.match(/^---\n([\s\S]*?)\n---/);
        existing = match ? (JSON.parse(match[1]).entries ?? []) : [];
      } catch { /* archivo vacío o corrupto */ }
    }
    const prevEntry = existing.find((e) => e.id === entry.id);
    const entries = [...existing.filter(e => e.id !== entry.id), entry]
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    // Actualizar lista de meses si es nuevo
    const { overtimeMonths } = get();
    if (!overtimeMonths.includes(ym)) {
      set({ overtimeMonths: [ym, ...overtimeMonths].sort().reverse() });
    }
    await fs.writeFile(path, `---\n${JSON.stringify({ entries }, null, 2)}\n---\n`);
    // Navegar al mes de la entrada para que aparezca en la lista
    await get().loadOvertimeMonth(ym);
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
    if (prevEntry) {
      const changedFields = diffOvertimeEntryFields(prevEntry, entry);
      if (Object.keys(changedFields).length > 0) void syncPatchOvertimeEntry(get, set, entry.id, changedFields);
    } else {
      void syncCreateOvertimeEntry(get, set, entry);
    }
  },

  deleteOvertimeEntry: async (id) => {
    const base = get().basePath;
    if (!base) return;
    const language = get().language;
    const deletedEntry = get().overtimeEntries.find((entry) => entry.id === id);
    if (deletedEntry) {
      await trash.writeTrashRecord(base, 'overtime_entry', id, `${deletedEntry.fecha} — ${deletedEntry.actividad}`, deletedEntry);
    }
    const entries = get().overtimeEntries.filter(e => e.id !== id);
    set({ overtimeEntries: entries });
    const ym = get().overtimeMonth;
    const [year, month] = ym.split('-');
    const path = overtimeMonthFilePath(base, year, month);
    await fs.writeFile(path, `---\n${JSON.stringify({ entries }, null, 2)}\n---\n`);
    void syncDeleteOvertimeEntry(get, id);
    get().showToast({
      kind: 'success',
      title: t(language, 'toast', 'overtimeDeleted'),
      description: deletedEntry?.fecha,
    });
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  deleteOvertimeMonth: async (yearMonth) => {
    const base = get().basePath;
    if (!base) return;
    const language = get().language;
    const [year, month] = yearMonth.split('-');
    const dir = overtimeMonthDir(base, year, month);
    try { await fs.deleteDir(dir); } catch { /* ya no existe */ }
    const newMonths = get().overtimeMonths.filter((m) => m !== yearMonth);
    set({ overtimeMonths: newMonths });
    // Si el mes eliminado era el activo, ir al primero disponible o quedarse vacío
    if (get().overtimeMonth === yearMonth) {
      const next = newMonths[0] ?? yearMonth;
      await get().loadOvertimeMonth(next);
    }
    get().showToast({
      kind: 'success',
      title: t(language, 'toast', 'overtimeMonthDeleted'),
      description: yearMonth,
    });
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  setOvertimeMeta: (meta) => {
    const updated = { ...get().overtimeMeta, ...meta };
    localStorage.setItem('overtimeMeta', JSON.stringify(updated));
    set({ overtimeMeta: updated });
    scheduleOvertimeMetaPush(get, set, meta);
  },

  replaceOvertimeMetaSnapshot: (meta) => {
    localStorage.setItem('overtimeMeta', JSON.stringify(meta));
    set({ overtimeMeta: meta });
  },

  exportOvertimeExcel: async (yearMonth) => {
    const base = get().basePath;
    if (!base) return;
    const language = get().language;
    const [year, month] = yearMonth.split('-');
    const path = overtimeMonthFilePath(base, year, month);
    let entries: OvertimeEntry[] = [];
    if (await fs.exists(path)) {
      const raw = await fs.readFile(path);
      const match = raw.match(/^---\n([\s\S]*?)\n---/);
      if (match) entries = JSON.parse(match[1]).entries ?? [];
    }
    const meta = get().overtimeMeta;
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const mesLabel = `${monthNames[parseInt(month) - 1]} ${year}`;
    const bytes = await generateOvertimeXlsx(entries, meta, mesLabel);
    const colaborador = meta.colaborador || 'Colaborador';
    const dest = await saveDialog({
      defaultPath: `Reporte Extras ${colaborador} - ${mesLabel}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (dest) {
      const b64 = btoa(String.fromCharCode(...bytes));
      await fs.writeBinary(dest, b64);
      get().showToast({
        kind: 'success',
        title: t(language, 'toast', 'overtimeExported'),
        description: dest.split('/').pop() ?? dest,
      });
    }
  },

  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    applyThemeToDOM(theme, true, get().customThemes);
    set({ theme });
  },

  createCustomTheme: ({ name, base, accent, bgTint, textTint, intensity }) => {
    const newTheme: CustomTheme = {
      id: uuidv4(),
      name: name.trim() || t(get().language, 'settings', 'customThemeDefaultName'),
      base,
      accent,
      bgTint,
      textTint,
      intensity,
      createdAt: new Date().toISOString(),
    };
    const customThemes = [...get().customThemes, newTheme];
    localStorage.setItem('customThemes', JSON.stringify(customThemes));
    set({ customThemes });
    get().setTheme(`custom:${newTheme.id}`);
    return newTheme;
  },

  renameCustomTheme: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const customThemes = get().customThemes.map((th) => th.id === id ? { ...th, name: trimmed } : th);
    localStorage.setItem('customThemes', JSON.stringify(customThemes));
    set({ customThemes });
  },

  duplicateCustomTheme: (id) => {
    const source = get().customThemes.find((th) => th.id === id);
    if (!source) return;
    const newTheme: CustomTheme = {
      ...source,
      id: uuidv4(),
      name: `${source.name} ${t(get().language, 'settings', 'customThemeCopySuffix')}`,
      createdAt: new Date().toISOString(),
    };
    const customThemes = [...get().customThemes, newTheme];
    localStorage.setItem('customThemes', JSON.stringify(customThemes));
    set({ customThemes });
  },

  deleteCustomTheme: (id) => {
    const wasActive = get().theme === `custom:${id}`;
    const customThemes = get().customThemes.filter((th) => th.id !== id);
    localStorage.setItem('customThemes', JSON.stringify(customThemes));
    set({ customThemes });
    if (wasActive) get().setTheme('dark');
  },

  updateCustomTheme: (id, patch) => {
    const customThemes = get().customThemes.map((th) => th.id === id ? { ...th, ...patch } : th);
    localStorage.setItem('customThemes', JSON.stringify(customThemes));
    set({ customThemes });
    if (get().theme === `custom:${id}`) {
      applyThemeToDOM(get().theme, false, customThemes);
    }
  },

  replaceCustomThemes: (customThemes) => {
    localStorage.setItem('customThemes', JSON.stringify(customThemes));
    set({ customThemes });
  },

  setConfirmDestructiveActions: async (enabled) => {
    set({ confirmDestructiveActions: enabled });
    await persistConfig(get);
  },

  setNotificationsEnabled: async (enabled) => {
    set({ notificationsEnabled: enabled });
    await persistConfig(get);
  },

  setDefaultReminderMinutes: async (mins) => {
    set({ defaultReminderMinutes: mins });
    await persistConfig(get);
  },

  setWorkWeekDays: async (days) => {
    set({ workWeekDays: days });
    await persistConfig(get);
  },

  setHolidaysAsNonWork: async (enabled) => {
    set({ holidaysAsNonWork: enabled });
    await persistConfig(get);
  },

  setAnimationsEnabled: async (enabled) => {
    set({ animationsEnabled: enabled });
    applyAnimationsToDOM(enabled);
    await persistConfig(get);
  },

  setTrashAutoPurgeEnabled: async (enabled) => {
    set({ trashAutoPurgeEnabled: enabled });
    await persistConfig(get);
    if (enabled) startTrashPurgeInterval(get);
    else stopTrashPurgeInterval();
  },

  setStartupScreen: async (screen) => {
    set({ startupScreen: screen, activeSection: screen });
    await persistConfig(get);
  },

  setLanguage: async (lang) => {
    localStorage.setItem('language', lang);
    set({ language: lang });
    await persistConfig(get);
  },

  setFontSize: (size: number) => {
    localStorage.setItem('fontSize', String(size));
    applyFontSizeToDOM(size);
    set({ fontSize: size });
  },

  setShortcut: (action, key) => {
    const shortcuts = { ...get().shortcuts, [action]: key };
    localStorage.setItem('shortcuts', JSON.stringify(shortcuts));
    set({ shortcuts });
  },

  toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),

  // ── Git ────────────────────────────────────────────────────────

  saveGitConfig: (cfg: GitConfig) => {
    localStorage.setItem('gitConfig', JSON.stringify(cfg));
    set({ gitConfig: cfg });
  },

  gitInit: async (remote: string) => {
    const { basePath, gitConfig } = get();
    if (!basePath) return;
    await invoke('git_run', { cwd: basePath, args: ['init'] });
    if (gitConfig.userName.trim()) {
      await invoke('git_run', { cwd: basePath, args: ['config', '--local', 'user.name', gitConfig.userName.trim()] });
    }
    if (gitConfig.userEmail.trim()) {
      await invoke('git_run', { cwd: basePath, args: ['config', '--local', 'user.email', gitConfig.userEmail.trim()] });
    }
    await invoke('git_run', { cwd: basePath, args: ['add', '-A'] });
    try {
      await invoke('git_run', { cwd: basePath, args: ['commit', '-m', 'init: logday'] });
    } catch {
      // No hay nada que commitear — está bien
    }
    if (remote.trim()) {
      try {
        await invoke('git_run', { cwd: basePath, args: ['remote', 'add', 'origin', remote.trim()] });
      } catch {
        // El remote ya existía — actualizar
        await invoke('git_run', { cwd: basePath, args: ['remote', 'set-url', 'origin', remote.trim()] });
      }
    }
    set({ gitStatus: 'synced', lastCommitTime: new Date().toISOString() });
  },

  gitCommit: async () => {
    const { basePath } = get();
    if (!basePath) return;
    try {
      await invoke('git_run', { cwd: basePath, args: ['add', '-A'] });
      const msg = `auto: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
      await invoke('git_run', { cwd: basePath, args: ['commit', '-m', msg] });
      set({ gitStatus: 'synced', lastCommitTime: new Date().toISOString() });
    } catch {
      // Puede fallar si no hay cambios — no es un error real
      set({ gitStatus: 'synced' });
    }
  },

  gitPush: async () => {
    const { basePath } = get();
    if (!basePath) return;
    await get().gitCommit();
    try {
      await invoke('git_run', { cwd: basePath, args: ['push', '--set-upstream', 'origin', 'main'] });
      set({ gitStatus: 'synced', gitRemoteStatus: 'synced' });
    } catch (e) {
      set({ gitStatus: 'error' });
      throw e;
    }
  },

  gitFetch: async () => {
    const { basePath, gitConfig } = get();
    if (!basePath || !gitConfig.remote.trim()) return;
    try {
      await invoke('git_run', { cwd: basePath, args: ['fetch', 'origin'] });
      // Contar commits que el remoto tiene y nosotros no
      let behind = 0;
      let ahead = 0;
      try {
        const behindStr = await invoke<string>('git_run', {
          cwd: basePath,
          args: ['rev-list', 'HEAD..origin/HEAD', '--count'],
        });
        behind = parseInt(String(behindStr).trim(), 10) || 0;
      } catch { /* rama remota no existe aún */ }
      try {
        const aheadStr = await invoke<string>('git_run', {
          cwd: basePath,
          args: ['rev-list', 'origin/HEAD..HEAD', '--count'],
        });
        ahead = parseInt(String(aheadStr).trim(), 10) || 0;
      } catch { /* ok */ }

      const remoteStatus: GitRemoteStatus =
        behind > 0 && ahead > 0 ? 'diverged' :
        behind > 0 ? 'behind' :
        ahead  > 0 ? 'ahead'  : 'synced';
      set({ gitRemoteStatus: remoteStatus });
    } catch {
      set({ gitRemoteStatus: 'offline' });
    }
  },

  gitPull: async () => {
    const { basePath } = get();
    if (!basePath) return;
    set({ gitStatus: 'pending' });
    try {
      // Primero commitear local para no perder cambios
      await get().gitCommit();
      await invoke('git_run', { cwd: basePath, args: ['pull', 'origin', 'main'] });
      set({ gitStatus: 'synced', gitRemoteStatus: 'synced' });
      // Recargar todos los datos desde disco
      await Promise.all([
        get().loadProjects(),
        get().loadNoteFolders(),
      ]);
      const { activeProject, activeNoteFolder } = get();
      await Promise.all([
        get().loadTasks(activeProject),
        get().loadNotes(activeNoteFolder),
        get().loadDailyMonths(),
        get().loadOvertimeMonths(),
      ]);
    } catch (e) {
      set({ gitStatus: 'error' });
      throw e;
    }
  },

  toggleGit: () => set((s) => ({ isGitOpen: !s.isGitOpen })),
  openSettingsGitTab: () => set({ isGitOpen: true, isSettingsOpen: true }),

  // ── Sync (logday-server) ──────────────────────────────────────

  syncConnect: async (serverUrl: string, email: string, password: string) => {
    set({ syncConnectionStatus: 'connecting', syncErrorMsg: '' });
    const normalizedUrl = normalizeServerUrl(serverUrl);
    try {
      const tokens = await syncLogin(normalizedUrl, email, password, 'Logday Desktop');
      const cfg: SyncConfig = {
        enabled: true,
        serverUrl: normalizedUrl,
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        deviceId: tokens.device_id,
      };
      localStorage.setItem('syncConfig', JSON.stringify(cfg));
      set({ syncConfig: cfg, syncConnectionStatus: 'connected' });
      // Primero manda lo local pendiente, después trae lo remoto —
      // así una edición local recién hecha no se pisa a sí misma con
      // el eco de su propia respuesta llegando por /sync/changes
      // (aplicarla de nuevo es inofensivo, pero drenar primero evita
      // el orden raro de verla "revertirse" un instante).
      void Promise.all([drainSyncQueue(get, set), drainContentSyncQueue(get, set)])
        .then(() => reconcileSync(get, set));
      startReconcileInterval(get, set);
      void connectRealtime(get, set);
    } catch (e) {
      const msg = e instanceof SyncApiError ? e.message : String(e);
      set({ syncConnectionStatus: 'error', syncErrorMsg: msg });
      throw e;
    }
  },

  syncDisconnect: () => {
    stopReconcileInterval();
    disconnectRealtime();
    const cfg: SyncConfig = { enabled: false, serverUrl: '', email: '', accessToken: '', refreshToken: '', deviceId: '' };
    localStorage.setItem('syncConfig', JSON.stringify(cfg));
    set({ syncConfig: cfg, syncConnectionStatus: 'disconnected', syncErrorMsg: '' });
  },

  toggleSync: () => set((s) => ({ isSyncOpen: !s.isSyncOpen })),
  openSettingsSyncTab: () => set({ isSyncOpen: true, isSettingsOpen: true }),

  // ── Calendar Events ────────────────────────────────────────────

  loadCalendarEvents: async () => {
    const base = get().basePath;
    if (!base) return;
    const path = `${base}/calendar/events.json`;
    try {
      if (await fs.exists(path)) {
        const raw = await fs.readFile(path);
        const events: CalendarEvent[] = JSON.parse(raw);
        set({ calendarEvents: events });
      }
    } catch {
      set({ calendarEvents: [] });
    }
  },

  saveCalendarEvent: async (event) => {
    const base = get().basePath;
    if (!base) return;
    const dir = `${base}/calendar`;
    if (!(await fs.exists(dir))) await fs.createDir(dir);
    const path = `${dir}/events.json`;
    const current = get().calendarEvents;
    const idx = current.findIndex((e) => e.id === event.id);
    const prev = idx >= 0 ? current[idx] : undefined;
    const next = idx >= 0
      ? current.map((e) => (e.id === event.id ? event : e))
      : [...current, event];
    await fs.writeFile(path, JSON.stringify(next, null, 2));
    set({ calendarEvents: next });
    if (prev) {
      const changedFields = diffCalendarEventFields(prev, event);
      if (Object.keys(changedFields).length > 0) void syncPatchCalendarEvent(get, set, event.id, changedFields);
    } else {
      void syncCreateCalendarEvent(get, set, event);
    }
  },

  deleteCalendarEvent: async (id) => {
    const base = get().basePath;
    if (!base) return;
    const path = `${base}/calendar/events.json`;
    const next = get().calendarEvents.filter((e) => e.id !== id);
    await fs.writeFile(path, JSON.stringify(next, null, 2));
    set({ calendarEvents: next });
    void syncDeleteCalendarEvent(get, id);
  },

  // ── Absences ───────────────────────────────────────────────────

  loadAbsenceDays: async () => {
    const base = get().basePath;
    if (!base) return;
    const path = `${base}/absences.json`;
    try {
      if (await fs.exists(path)) {
        const raw = await fs.readFile(path);
        const absences: AbsenceDay[] = JSON.parse(raw);
        set({ absenceDays: absences });
      }
    } catch {
      set({ absenceDays: [] });
    }
  },

  saveAbsenceDay: async (absence) => {
    const base = get().basePath;
    if (!base) return;
    const path = `${base}/absences.json`;
    const current = get().absenceDays;
    const idx = current.findIndex((a) => a.id === absence.id);
    const prev = idx >= 0 ? current[idx] : undefined;
    const next = idx >= 0
      ? current.map((a) => (a.id === absence.id ? absence : a))
      : [...current, absence];
    await fs.writeFile(path, JSON.stringify(next, null, 2));
    set({ absenceDays: next });
    if (prev) {
      const changedFields = diffAbsenceDayFields(prev, absence);
      if (Object.keys(changedFields).length > 0) void syncPatchAbsenceDay(get, set, absence.id, changedFields);
    } else {
      void syncCreateAbsenceDay(get, set, absence);
    }
  },

  deleteAbsenceDay: async (id) => {
    const base = get().basePath;
    if (!base) return;
    const path = `${base}/absences.json`;
    const next = get().absenceDays.filter((a) => a.id !== id);
    await fs.writeFile(path, JSON.stringify(next, null, 2));
    set({ absenceDays: next });
    void syncDeleteAbsenceDay(get, id);
  },

  // ── Papelera de reciclaje ────────────────────────────────────
  // Local por instalación (ver src/lib/trash.ts) — restaurar Task/Note/
  // OvertimeEntry vuelve a mandar un CREATE al servidor con el mismo id;
  // logday-server hace upsert-revive (ON CONFLICT... deleted_at = NULL,
  // confirmado leyendo internal/note|task|overtime/store.go), así que
  // esto revive el tombstone en vez de chocar con él. Daily entry no
  // tiene sync hoy, no dispara nada de red.

  listTrash: async () => {
    const { basePath } = get();
    if (!basePath) return [];
    return trash.listTrashRecords(basePath);
  },

  restoreFromTrash: async (entity, key) => {
    const { basePath, language } = get();
    if (!basePath) return;
    const record = await trash.readTrashRecord(basePath, entity, key);
    if (!record) return;

    if (entity === 'task') {
      const task = record.data as Task;
      await fs.createDir(projectDir(basePath, task.project)).catch(() => {});
      await fs.writeFile(task.filePath, serializeTask(task));
      set((state) => ({ tasks: [task, ...state.tasks.filter((t) => t.id !== task.id)] }));
      void syncCreateTask(get, set, task);
    } else if (entity === 'note') {
      const note = record.data as Note;
      if (note.folder) await fs.createDir(noteFolderDir(basePath, note.folder)).catch(() => {});
      await fs.writeFile(note.filePath, serializeNote(note));
      set((state) => ({ notes: [note, ...state.notes.filter((n) => n.id !== note.id)] }));
      void syncCreateNote(get, set, note);
    } else if (entity === 'overtime_entry') {
      const entry = record.data as OvertimeEntry;
      const ym = entry.fecha.slice(0, 7);
      const [year, month] = ym.split('-');
      await fs.createDir(overtimeMonthDir(basePath, year, month)).catch(() => {});
      const path = overtimeMonthFilePath(basePath, year, month);
      let entries: OvertimeEntry[] = [];
      if (await fs.exists(path)) {
        try {
          const raw = await fs.readFile(path);
          const match = raw.match(/^---\n([\s\S]*?)\n---/);
          entries = match ? (JSON.parse(match[1]).entries ?? []) : [];
        } catch { /* archivo vacío o corrupto */ }
      }
      const nextEntries = [...entries.filter((e) => e.id !== entry.id), entry]
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      await fs.writeFile(path, `---\n${JSON.stringify({ entries: nextEntries }, null, 2)}\n---\n`);
      const { overtimeMonths } = get();
      if (!overtimeMonths.includes(ym)) set({ overtimeMonths: [ym, ...overtimeMonths].sort().reverse() });
      if (get().overtimeMonth === ym) set({ overtimeEntries: nextEntries });
      void syncCreateOvertimeEntry(get, set, entry);
    } else {
      const { date, content } = record.data as { date: string; content: string };
      const year = date.slice(0, 4);
      const month = date.slice(5, 7);
      const yearMonth = `${year}-${month}`;
      const fp = dailyMonthFilePath(basePath, year, month);
      let dayEntries: Record<string, string> = {};
      try {
        const raw = await fs.readFile(fp);
        dayEntries = parseDailyFile(raw);
      } catch { /* no file */ }
      dayEntries[date] = content;
      await fs.createDir(dailyMonthDir(basePath, year, month));
      await fs.writeFile(fp, serializeDailyFile(dayEntries, yearMonth));
      set((state) => ({ dailyEntries: { ...state.dailyEntries, [date]: content } }));
      const { dailyMonths } = get();
      if (!dailyMonths.includes(yearMonth)) set({ dailyMonths: [yearMonth, ...dailyMonths].sort().reverse() });
    }

    await trash.deleteTrashRecord(basePath, entity, key);
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
    get().showToast({
      kind: 'success',
      title: t(language, 'toast', 'trashRestored'),
      description: record.label,
    });
  },

  deleteTrashItemForever: async (entity, key) => {
    const { basePath, language } = get();
    if (!basePath) return;
    await trash.deleteTrashRecord(basePath, entity, key);
    get().showToast({ kind: 'success', title: t(language, 'toast', 'trashItemDeleted') });
  },

  emptyTrash: async () => {
    const { basePath, language } = get();
    if (!basePath) return;
    const items = await trash.listTrashRecords(basePath);
    for (const item of items) {
      await trash.deleteTrashRecord(basePath, item.entity, item.key);
    }
    get().showToast({ kind: 'success', title: t(language, 'toast', 'trashEmptied') });
  },
}));
