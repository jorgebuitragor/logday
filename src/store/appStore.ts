import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Task, Note, AppConfig, ViewMode, Theme, ActiveSection, StartupScreen, Language, Shortcuts, DEFAULT_SHORTCUTS, OvertimeEntry, OvertimeMonthMeta, GitConfig, GitStatus, GitRemoteStatus, AppToast, ToastKind, CalendarEvent } from '../types';
import { calcOvertimeBreakdown } from '../lib/overtimeCalc';
import { generateOvertimeXlsx } from '../lib/overtimeExcel';
import { fs, pickFolder, pickFile, saveDialog, SearchResult } from '../lib/invoke';
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

  // Theme + Settings
  theme: Theme;
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
  setTheme: (theme: Theme) => void;
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

function parseDailyFile(content: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const parts = content.split(/^## (\d{4}-\d{2}-\d{2})\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    // Eliminar separadores "---" que quedan al final de cada bloque
    const raw = (parts[i + 1] || '').trim().replace(/(\n*---\s*)+$/, '').trim();
    entries[parts[i].trim()] = raw;
  }
  return entries;
}

function serializeDailyFile(entries: Record<string, string>, yearMonth: string): string {
  const sorted = Object.keys(entries).sort().reverse();
  const header = `# ${yearMonth}\n\n`;
  if (sorted.length === 0) return header;
  return header + sorted.map((d) => `## ${d}\n\n${entries[d]}`).join('\n\n---\n\n') + '\n';
}

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

export function applyThemeToDOM(theme: Theme, animate = false) {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;

  if (animate) {
    document.documentElement.classList.add('theme-animating');
    window.setTimeout(() => {
      document.documentElement.classList.remove('theme-animating');
    }, 280);
  }

  document.documentElement.dataset.theme = resolved;

  try {
    const nativeTheme = theme === 'system' ? null : (resolved === 'dark' ? 'dark' : 'light');
    void getCurrentWindow().setTheme(nativeTheme).catch(() => {});
  } catch {
    // Puede ejecutarse fuera del contexto Tauri (tests o navegador)
  }
}

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
  theme: (localStorage.getItem('theme') as Theme) || 'system',
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
  overtimeEntries: [],
  overtimeMonth: new Date().toISOString().slice(0, 7),
  overtimeMonths: [],
  overtimeMeta: (() => {
    try { return { colaborador: '', cedula: '', ...JSON.parse(localStorage.getItem('overtimeMeta') || '{}') }; }
    catch { return { colaborador: '', cedula: '' }; }
  })(),
  calendarEvents: [],
  activeCalendarEvent: null,

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
    applyThemeToDOM(get().theme);
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
          ]);

          if (lastProject) set({ activeProject: lastProject });
          if (lastNoteFolder !== undefined) set({ activeNoteFolder: lastNoteFolder });

          // Fetch remoto en background para detectar cambios pendientes
          const { gitConfig } = get();
          if (gitConfig.enabled && gitConfig.remote.trim()) {
            get().gitFetch().catch(() => {});
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

    const { configDir, startupScreen, confirmDestructiveActions } = get();
    const basePath = picked;

    await fs.createDir(`${basePath}/projects/inbox`);
    await fs.createDir(`${basePath}/notes`);
    await fs.createDir(`${basePath}/dailys`);

    if (configDir) {
      await saveConfig(configDir, { basePath, startupScreen, language: get().language, confirmDestructiveActions, notificationsEnabled: get().notificationsEnabled, defaultReminderMinutes: get().defaultReminderMinutes });
    }

    set({ basePath, isConfigured: true });
    await get().loadProjects();
    await get().loadNoteFolders();
    await get().loadTasks(null);
    await get().loadNotes(null);
  },

  changeBasePath: async () => {
    const picked = await pickFolder();
    if (!picked) return;

    const { configDir, startupScreen, confirmDestructiveActions } = get();
    const basePath = picked;

    await fs.createDir(`${basePath}/projects/inbox`);
    await fs.createDir(`${basePath}/notes`);
    await fs.createDir(`${basePath}/dailys`);

    if (configDir) {
      await saveConfig(configDir, { basePath, startupScreen, language: get().language, confirmDestructiveActions, notificationsEnabled: get().notificationsEnabled, defaultReminderMinutes: get().defaultReminderMinutes });
    }

    set({ basePath, activeProject: null, activeNote: null, activeNoteFolder: null, tasks: [], notes: [] });
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
    const { configDir, basePath, activeNoteFolder, startupScreen } = get();
    if (configDir && basePath) {
      saveConfig(configDir, {
        basePath,
        startupScreen,
        language: get().language,
        confirmDestructiveActions: get().confirmDestructiveActions,
        lastOpenedProject: project ?? undefined,
        lastOpenedNoteFolder: activeNoteFolder ?? undefined,
      }).catch(() => {});
    }
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
  },

  deleteTask: async (task) => {
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
    const { configDir, basePath, activeProject, startupScreen } = get();
    if (configDir && basePath) {
      saveConfig(configDir, {
        basePath,
        startupScreen,
        language: get().language,
        confirmDestructiveActions: get().confirmDestructiveActions,
        notificationsEnabled: get().notificationsEnabled,
        defaultReminderMinutes: get().defaultReminderMinutes,
        lastOpenedProject: activeProject ?? undefined,
        lastOpenedNoteFolder: folder ?? undefined,
      }).catch(() => {});
    }
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
    return note;
  },

  updateNote: async (note) => {
    const updated = { ...note, updated: formatDate(new Date()) };
    await fs.writeFile(updated.filePath, serializeNote(updated));
    set((state) => ({
      notes: state.notes.map((n) => (n.id === updated.id ? updated : n)),
      activeNote: state.activeNote?.id === updated.id ? updated : state.activeNote,
    }));
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  deleteNote: async (note, options) => {
    const showToast = options?.showToast ?? true;
    await fs.deleteFile(note.filePath);
    const language = get().language;
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== note.id),
      activeNote: state.activeNote?.id === note.id ? null : state.activeNote,
    }));
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
    const { basePath } = get();
    const todayDate = dateFromISO(date);
    const prevDate = getPreviousWorkingDay(todayDate);
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
    delete existing[date];
    await fs.createDir(dailyMonthDir(basePath, year, month));
    await fs.writeFile(fp, serializeDailyFile(existing, yearMonth));
    set((s) => {
      const { [date]: _removed, ...rest } = s.dailyEntries;
      return {
        dailyEntries: rest,
        activeDailyDate: s.activeDailyDate === date ? null : s.activeDailyDate,
      };
    });
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
    const ym = get().overtimeMonth;
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
    const entries = [...existing.filter(e => e.id !== entry.id), entry]
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    set({ overtimeEntries: entries });
    await fs.writeFile(path, `---\n${JSON.stringify({ entries }, null, 2)}\n---\n`);
    // Actualizar lista de meses si es nuevo
    const { overtimeMonths } = get();
    if (!overtimeMonths.includes(ym)) {
      set({ overtimeMonths: [ym, ...overtimeMonths].sort().reverse() });
    }
    if (get().gitConfig.enabled) set({ gitStatus: 'pending' });
  },

  deleteOvertimeEntry: async (id) => {
    const base = get().basePath;
    if (!base) return;
    const language = get().language;
    const deletedEntry = get().overtimeEntries.find((entry) => entry.id === id);
    const entries = get().overtimeEntries.filter(e => e.id !== id);
    set({ overtimeEntries: entries });
    const ym = get().overtimeMonth;
    const [year, month] = ym.split('-');
    const path = overtimeMonthFilePath(base, year, month);
    await fs.writeFile(path, `---\n${JSON.stringify({ entries }, null, 2)}\n---\n`);
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

  setTheme: (theme: Theme) => {
    localStorage.setItem('theme', theme);
    applyThemeToDOM(theme, true);
    set({ theme });
  },

  setConfirmDestructiveActions: async (enabled) => {
    set({ confirmDestructiveActions: enabled });
    const { configDir, basePath, startupScreen, activeProject, activeNoteFolder, language } = get();
    if (configDir && basePath) {
      await saveConfig(configDir, {
        basePath,
        startupScreen,
        language,
        confirmDestructiveActions: enabled,
        notificationsEnabled: get().notificationsEnabled,
        defaultReminderMinutes: get().defaultReminderMinutes,
        lastOpenedProject: activeProject ?? undefined,
        lastOpenedNoteFolder: activeNoteFolder ?? undefined,
      });
    }
  },

  setNotificationsEnabled: async (enabled) => {
    set({ notificationsEnabled: enabled });
    const { configDir, basePath, startupScreen, activeProject, activeNoteFolder, language } = get();
    if (configDir && basePath) {
      await saveConfig(configDir, {
        basePath,
        startupScreen,
        language,
        confirmDestructiveActions: get().confirmDestructiveActions,
        notificationsEnabled: enabled,
        defaultReminderMinutes: get().defaultReminderMinutes,
        lastOpenedProject: activeProject ?? undefined,
        lastOpenedNoteFolder: activeNoteFolder ?? undefined,
      });
    }
  },

  setDefaultReminderMinutes: async (mins) => {
    set({ defaultReminderMinutes: mins });
    const { configDir, basePath, startupScreen, activeProject, activeNoteFolder, language } = get();
    if (configDir && basePath) {
      await saveConfig(configDir, {
        basePath,
        startupScreen,
        language,
        confirmDestructiveActions: get().confirmDestructiveActions,
        notificationsEnabled: get().notificationsEnabled,
        defaultReminderMinutes: mins,
        workWeekDays: get().workWeekDays,
        holidaysAsNonWork: get().holidaysAsNonWork,
        lastOpenedProject: activeProject ?? undefined,
        lastOpenedNoteFolder: activeNoteFolder ?? undefined,
      });
    }
  },

  setWorkWeekDays: async (days) => {
    set({ workWeekDays: days });
    const { configDir, basePath, startupScreen, activeProject, activeNoteFolder, language } = get();
    if (configDir && basePath) {
      await saveConfig(configDir, {
        basePath,
        startupScreen,
        language,
        confirmDestructiveActions: get().confirmDestructiveActions,
        notificationsEnabled: get().notificationsEnabled,
        defaultReminderMinutes: get().defaultReminderMinutes,
        workWeekDays: days,
        holidaysAsNonWork: get().holidaysAsNonWork,
        lastOpenedProject: activeProject ?? undefined,
        lastOpenedNoteFolder: activeNoteFolder ?? undefined,
      });
    }
  },

  setHolidaysAsNonWork: async (enabled) => {
    set({ holidaysAsNonWork: enabled });
    const { configDir, basePath, startupScreen, activeProject, activeNoteFolder, language } = get();
    if (configDir && basePath) {
      await saveConfig(configDir, {
        basePath,
        startupScreen,
        language,
        confirmDestructiveActions: get().confirmDestructiveActions,
        notificationsEnabled: get().notificationsEnabled,
        defaultReminderMinutes: get().defaultReminderMinutes,
        workWeekDays: get().workWeekDays,
        holidaysAsNonWork: enabled,
        animationsEnabled: get().animationsEnabled,
        lastOpenedProject: activeProject ?? undefined,
        lastOpenedNoteFolder: activeNoteFolder ?? undefined,
      });
    }
  },

  setAnimationsEnabled: async (enabled) => {
    set({ animationsEnabled: enabled });
    applyAnimationsToDOM(enabled);
    const { configDir, basePath, startupScreen, activeProject, activeNoteFolder, language } = get();
    if (configDir && basePath) {
      await saveConfig(configDir, {
        basePath,
        startupScreen,
        language,
        confirmDestructiveActions: get().confirmDestructiveActions,
        notificationsEnabled: get().notificationsEnabled,
        defaultReminderMinutes: get().defaultReminderMinutes,
        workWeekDays: get().workWeekDays,
        holidaysAsNonWork: get().holidaysAsNonWork,
        animationsEnabled: enabled,
        lastOpenedProject: activeProject ?? undefined,
        lastOpenedNoteFolder: activeNoteFolder ?? undefined,
      });
    }
  },

  setStartupScreen: async (screen) => {
    set({ startupScreen: screen, activeSection: screen });
    const { configDir, basePath, activeProject, activeNoteFolder } = get();
    if (configDir && basePath) {
      await saveConfig(configDir, {
        basePath,
        startupScreen: screen,
        language: get().language,
        confirmDestructiveActions: get().confirmDestructiveActions,
        notificationsEnabled: get().notificationsEnabled,
        defaultReminderMinutes: get().defaultReminderMinutes,
        lastOpenedProject: activeProject ?? undefined,
        lastOpenedNoteFolder: activeNoteFolder ?? undefined,
      });
    }
  },

  setLanguage: async (lang) => {
    localStorage.setItem('language', lang);
    set({ language: lang });
    const { configDir, basePath, startupScreen, activeProject, activeNoteFolder } = get();
    if (configDir && basePath) {
      await saveConfig(configDir, {
        basePath,
        startupScreen,
        language: lang,
        confirmDestructiveActions: get().confirmDestructiveActions,
        notificationsEnabled: get().notificationsEnabled,
        defaultReminderMinutes: get().defaultReminderMinutes,
        lastOpenedProject: activeProject ?? undefined,
        lastOpenedNoteFolder: activeNoteFolder ?? undefined,
      });
    }
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
    const next = idx >= 0
      ? current.map((e) => (e.id === event.id ? event : e))
      : [...current, event];
    await fs.writeFile(path, JSON.stringify(next, null, 2));
    set({ calendarEvents: next });
  },

  deleteCalendarEvent: async (id) => {
    const base = get().basePath;
    if (!base) return;
    const path = `${base}/calendar/events.json`;
    const next = get().calendarEvents.filter((e) => e.id !== id);
    await fs.writeFile(path, JSON.stringify(next, null, 2));
    set({ calendarEvents: next });
  },
}));
