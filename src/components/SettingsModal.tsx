import { useEffect, useRef, useState } from 'react';
import { X, Monitor, Sun, Moon, FolderOpen, Minus, Plus, Download, Upload, Type, Keyboard, AlertTriangle, ChevronDown, Eye, EyeOff, RefreshCw, ExternalLink, GitCommit, CheckCircle2, AlertCircle, Clock, CloudOff, ArrowDown } from 'lucide-react';
import { Theme, Shortcuts, StartupScreen, Language, BackupSettings, GitConfig } from '../types';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';
import { fs, checkUpdate, ReleaseInfo } from '../lib/invoke';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import JSZip from 'jszip';

const BACKUP_SETTINGS_PATH = '__logday/settings.json';

function isICloudPath(path: string): boolean {
  return (
    path.includes('/Library/Mobile Documents') ||
    path.includes('com~apple~CloudDocs') ||
    path.includes('/iCloud Drive/')
  );
}

const THEME_VALUES: { value: Theme; Icon: React.ElementType }[] = [
  { value: 'system', Icon: Monitor },
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'high-contrast', Icon: AlertTriangle },
  { value: 'visual-rest', Icon: Eye },
];

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

// STARTUP_SCREEN_OPTIONS se genera reactivamente dentro del componente con t()
const STARTUP_SCREEN_VALUES: StartupScreen[] = ['dashboard', 'dailys', 'tasks', 'notes', 'overtime'];

function timeAgo(iso: string, lang: 'es' | 'en'): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (lang === 'en') {
    if (diff < 60) return 'less than 1 min ago';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  }
  if (diff < 60) return 'hace menos de 1 min';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} días`;
}

type SettingsTab = 'general' | 'work' | 'shortcuts' | 'data' | 'git' | 'sync' | 'about';

async function collectFiles(
  zip: JSZip,
  baseDir: string,
  currentDir: string,
): Promise<void> {
  const entries = await fs.listDir(currentDir);
  for (const entry of entries) {
    // Ignorar archivos del sistema macOS y carpetas ocultas
    const name = entry.path.split('/').pop() ?? '';
    if (name.startsWith('.')) continue;

    if (entry.is_dir) {
      await collectFiles(zip, baseDir, entry.path);
    } else {
      const relative = entry.path.startsWith(baseDir + '/')
        ? entry.path.slice(baseDir.length + 1)
        : entry.path.slice(baseDir.length);
      // Leer como binario (base64) — seguro con cualquier tipo de archivo
      const b64: string = await invoke('read_file_binary', { path: entry.path });
      // Decodificar base64 a Uint8Array para JSZip
      const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      zip.file(relative, binary);
    }
  }
}

export function SettingsModal() {
  const {
    isSettingsOpen, toggleSettings,
    theme, setTheme,
    startupScreen, setStartupScreen,
    language, setLanguage,
    fontSize, setFontSize,
    confirmDestructiveActions, setConfirmDestructiveActions,
    notificationsEnabled, setNotificationsEnabled,
    defaultReminderMinutes, setDefaultReminderMinutes,
    workWeekDays, setWorkWeekDays,
    holidaysAsNonWork, setHolidaysAsNonWork,
    animationsEnabled, setAnimationsEnabled,
    basePath, changeBasePath,
    shortcuts, setShortcut,
    folderTags, replaceFolderTags,
    overtimeMeta, replaceOvertimeMetaSnapshot,
    activeProject, activeNoteFolder,
    loadProjects, loadTasks,
    loadNoteFolders, loadNotes,
    loadDailyMonths, loadOvertimeMonths,
    showToast,
    isGitOpen, toggleGit,
    gitConfig, saveGitConfig,
    gitStatus, gitRemoteStatus, lastCommitTime,
    gitInit, gitCommit, gitPush, gitPull, gitFetch,
    isSyncOpen, toggleSync,
    syncConfig, syncConnectionStatus, syncErrorMsg,
    syncConnect, syncDisconnect,
  } = useAppStore();

  const [backupStatus, setBackupStatus] = useState<'idle' | 'exporting' | 'importing' | 'done' | 'error'>('idle');
  const [backupMsg, setBackupMsg] = useState('');
  const [recordingFor, setRecordingFor] = useState<keyof Shortcuts | null>(null);
  const [isStartupSelectorOpen, setIsStartupSelectorOpen] = useState(false);
  const startupSelectorRef = useRef<HTMLDivElement | null>(null);
  const [isReminderMenuOpen, setIsReminderMenuOpen] = useState(false);
  const reminderMenuRef = useRef<HTMLDivElement | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'upToDate' | 'available' | 'error'>('idle');
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);

  // Git local state
  const [gitRemote, setGitRemote] = useState(gitConfig.remote);
  const [gitAutoCommit, setGitAutoCommit] = useState(gitConfig.autoCommitHourly);
  const [gitAutoPush, setGitAutoPush] = useState(gitConfig.autoPushDaily);
  const [gitEnabled, setGitEnabled] = useState(gitConfig.enabled);
  const [gitUserName, setGitUserName] = useState(gitConfig.userName ?? '');
  const [gitUserEmail, setGitUserEmail] = useState(gitConfig.userEmail ?? '');
  const [gitBusy, setGitBusy] = useState(false);
  // Sync local state
  const [syncServerUrl, setSyncServerUrl] = useState(syncConfig.serverUrl);
  const [syncEmail, setSyncEmail] = useState(syncConfig.email);
  const [syncPassword, setSyncPassword] = useState('');
  const [showSyncPassword, setShowSyncPassword] = useState(false);
  const [gitFetchBusy, setGitFetchBusy] = useState(false);
  const [gitErrorMsg, setGitErrorMsg] = useState('');
  const [gitNow, setGitNow] = useState(Date.now());
  const gitAutoCommitRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startupScreenOptions = STARTUP_SCREEN_VALUES.map((value) => ({
    value,
    label: t(language, 'settings', `startup${value.charAt(0).toUpperCase() + value.slice(1)}` as any),
    desc: t(language, 'settings', `startupDesc${value.charAt(0).toUpperCase() + value.slice(1)}` as any),
  }));
  const themeOptions = THEME_VALUES.map(({ value, Icon }) => {
    const keySuffix = value
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    return {
      value,
      Icon,
      label: t(language, 'settings', `theme${keySuffix}` as any),
      desc: t(language, 'settings', `themeDesc${keySuffix}` as any),
    };
  });
  const activeStartupOption = startupScreenOptions.find((o) => o.value === startupScreen) ?? startupScreenOptions[0];

  // Cargar versión de la app
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  // Cerrar dropdown de anticipación al hacer clic fuera
  useEffect(() => {
    if (!isReminderMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!reminderMenuRef.current?.contains(e.target as Node)) setIsReminderMenuOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [isReminderMenuOpen]);

  async function handleCheckUpdate() {
    setUpdateStatus('checking');
    setReleaseInfo(null);
    try {
      const info = await checkUpdate();
      const latest = info.tag_name.replace(/^v/, '');
      if (latest === appVersion) {
        setUpdateStatus('upToDate');
      } else {
        setReleaseInfo(info);
        setUpdateStatus('available');
      }
    } catch {
      setUpdateStatus('error');
    }
  }

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isSettingsOpen) return;
      if (isStartupSelectorOpen) {
        setIsStartupSelectorOpen(false);
        return;
      }
      toggleSettings();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSettingsOpen, isStartupSelectorOpen, toggleSettings]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!isStartupSelectorOpen) return;
      if (startupSelectorRef.current?.contains(e.target as Node)) return;
      setIsStartupSelectorOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isStartupSelectorOpen]);

  // Grabar nuevo atajo
  useEffect(() => {
    if (!recordingFor) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
      if (e.key === 'Escape') { setRecordingFor(null); return; }
      setShortcut(recordingFor, e.key.toLowerCase());
      setRecordingFor(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recordingFor, setShortcut]);

  // Navegar al tab git cuando se activa isGitOpen desde el sidebar
  useEffect(() => {
    if (isSettingsOpen && isGitOpen) {
      setSettingsTab('git');
      toggleGit(); // limpiar la señal
    }
  }, [isSettingsOpen, isGitOpen, toggleGit]);

  // Navegar al tab sync cuando se activa isSyncOpen desde el sidebar
  useEffect(() => {
    if (isSettingsOpen && isSyncOpen) {
      setSettingsTab('sync');
      toggleSync(); // limpiar la señal
    }
  }, [isSettingsOpen, isSyncOpen, toggleSync]);

  // Sincronizar estado local con syncConfig al entrar al tab sync
  useEffect(() => {
    if (settingsTab !== 'sync') return;
    setSyncServerUrl(syncConfig.serverUrl);
    setSyncEmail(syncConfig.email);
    setSyncPassword('');
  }, [settingsTab, syncConfig]);

  // Actualizar "hace X min" cada 30 s (git)
  useEffect(() => {
    const interval = setInterval(() => setGitNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  void gitNow;

  // Auto-commit horario mientras la app está abierta
  useEffect(() => {
    if (gitAutoCommitRef.current) clearInterval(gitAutoCommitRef.current);
    if (gitEnabled && gitAutoCommit && basePath) {
      gitAutoCommitRef.current = setInterval(() => {
        gitCommit().catch(() => {});
      }, 60 * 60 * 1000);
    }
    return () => {
      if (gitAutoCommitRef.current) clearInterval(gitAutoCommitRef.current);
    };
  }, [gitEnabled, gitAutoCommit, basePath, gitCommit]);

  // Sincronizar estado local con gitConfig al entrar al tab git
  useEffect(() => {
    if (settingsTab !== 'git') return;
    setGitRemote(gitConfig.remote);
    setGitAutoCommit(gitConfig.autoCommitHourly);
    setGitAutoPush(gitConfig.autoPushDaily);
    setGitEnabled(gitConfig.enabled);
    setGitUserName(gitConfig.userName ?? '');
    setGitUserEmail(gitConfig.userEmail ?? '');
    setGitErrorMsg('');
    if (gitConfig.enabled && gitConfig.remote.trim()) {
      setGitFetchBusy(true);
      gitFetch().catch(() => {}).finally(() => setGitFetchBusy(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsTab]);

  // Fetch periódico cada 30 min
  useEffect(() => {
    if (!gitConfig.enabled || !gitConfig.remote.trim()) return;
    const interval = setInterval(() => {
      gitFetch().catch(() => {});
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [gitConfig.enabled, gitConfig.remote, gitFetch]);

  const handleGitSave = async () => {
    setGitBusy(true);
    setGitErrorMsg('');
    try {
      const newCfg: GitConfig = {
        enabled: gitEnabled,
        remote: gitRemote,
        autoCommitHourly: gitAutoCommit,
        autoPushDaily: gitAutoPush,
        userName: gitUserName,
        userEmail: gitUserEmail,
      };
      saveGitConfig(newCfg);
      if (gitEnabled && basePath) {
        await gitInit(gitRemote);
      }
    } catch (e) {
      setGitErrorMsg(String(e));
    } finally {
      setGitBusy(false);
    }
  };

  const handleSyncConnect = async () => {
    try {
      await syncConnect(syncServerUrl.trim(), syncEmail.trim(), syncPassword);
      setSyncPassword('');
    } catch {
      // syncErrorMsg ya queda seteado en el store
    }
  };

  const handleSyncDisconnect = () => {
    syncDisconnect();
    setSyncPassword('');
  };

  const handleGitSync = async () => {
    setGitBusy(true);
    setGitErrorMsg('');
    try {
      if (gitRemote.trim()) {
        await gitPush();
      } else {
        await gitCommit();
      }
    } catch (e) {
      setGitErrorMsg(String(e));
    } finally {
      setGitBusy(false);
    }
  };

  const handleGitPull = async () => {
    setGitBusy(true);
    setGitErrorMsg('');
    try {
      await gitPull();
    } catch (e) {
      setGitErrorMsg(String(e));
    } finally {
      setGitBusy(false);
    }
  };

  const handleGitFetch = async () => {
    setGitFetchBusy(true);
    setGitErrorMsg('');
    try {
      await gitFetch();
    } catch (e) {
      setGitErrorMsg(String(e));
    } finally {
      setGitFetchBusy(false);
    }
  };

  const gitToggleCls = (on: boolean) =>
    `relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ${
      on ? 'bg-indigo-500' : 'bg-[var(--border)]'
    }`;

  async function handleExport() {
    if (!basePath) return;
    try {
      setBackupStatus('exporting');
      setBackupMsg(t(language, 'settings', 'backupPacking'));

      const zip = new JSZip();
      await collectFiles(zip, basePath, basePath);
      const backupSettings: BackupSettings = {
        language,
        startupScreen,
        confirmDestructiveActions,
        theme,
        fontSize,
        shortcuts,
        folderTags,
        overtimeMeta,
      };
      zip.file(BACKUP_SETTINGS_PATH, JSON.stringify(backupSettings, null, 2));

      const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      // Convertir a base64 para enviar al comando Rust
      const b64 = btoa(String.fromCharCode(...data));

      const today = new Date().toISOString().slice(0, 10);
      const dest = await saveDialog({
        defaultPath: `logday-backup-${today}.zip`,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });

      if (dest) {
        await invoke('write_file_binary', { path: dest, data: b64 });
        setBackupStatus('done');
        setBackupMsg(t(language, 'settings', 'backupSaved'));
        showToast({
          kind: 'success',
          title: t(language, 'toast', 'backupExported'),
          description: dest.split('/').pop() ?? dest,
        });
      } else {
        setBackupStatus('idle');
        setBackupMsg('');
      }
    } catch (err) {
      setBackupStatus('error');
      setBackupMsg(`${t(language, 'settings', 'backupExportError')} ${String(err)}`);
      showToast({
        kind: 'error',
        title: t(language, 'toast', 'exportFailed'),
        description: String(err),
        durationMs: 4200,
      });
    }
  }

  async function handleImport() {
    if (!basePath) return;
    try {
      const picked = await openDialog({
        multiple: false,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });
      const filePath = typeof picked === 'string' ? picked : null;
      if (!filePath) return;

      setBackupStatus('importing');
      setBackupMsg(t(language, 'settings', 'backupRestoring'));

      const b64Raw: string = await invoke('read_file_binary', { path: filePath });
      const rawBytes = Uint8Array.from(atob(b64Raw), c => c.charCodeAt(0));
      const zip = await JSZip.loadAsync(rawBytes);

      const tasks: Promise<void>[] = [];
      const importedSettingsRef: { value: BackupSettings | null } = { value: null };
      zip.forEach((relativePath, file) => {
        if (file.dir) return;

        if (relativePath === BACKUP_SETTINGS_PATH) {
          tasks.push(
            file.async('string').then(async (content) => {
              importedSettingsRef.value = JSON.parse(content) as BackupSettings;
            })
          );
          return;
        }

        const task = file.async('uint8array').then(async (content) => {
          const targetPath = `${basePath}/${relativePath}`;
          // Ensure parent dir exists
          const parts = relativePath.split('/');
          if (parts.length > 1) {
            const parentRelative = parts.slice(0, -1).join('/');
            await fs.createDir(`${basePath}/${parentRelative}`);
          }
          const fileB64 = btoa(String.fromCharCode(...content));
          await invoke('write_file_binary', { path: targetPath, data: fileB64 });
        });
        tasks.push(task);
      });

      await Promise.all(tasks);
      const importedSettings = importedSettingsRef.value;

      if (importedSettings?.theme) {
        setTheme(importedSettings.theme);
      }
      if (typeof importedSettings?.fontSize === 'number') {
        setFontSize(importedSettings.fontSize);
      }
      if (importedSettings?.language) {
        await setLanguage(importedSettings.language);
      }
      if (importedSettings?.startupScreen) {
        await setStartupScreen(importedSettings.startupScreen);
      }
      if (typeof importedSettings?.confirmDestructiveActions === 'boolean') {
        await setConfirmDestructiveActions(importedSettings.confirmDestructiveActions);
      }
      if (importedSettings?.shortcuts) {
        for (const [action, key] of Object.entries(importedSettings.shortcuts) as [keyof Shortcuts, string | undefined][]) {
          if (typeof key === 'string' && key) {
            setShortcut(action, key);
          }
        }
      }
      if (importedSettings?.folderTags) {
        replaceFolderTags(importedSettings.folderTags);
      }
      if (importedSettings?.overtimeMeta) {
        replaceOvertimeMetaSnapshot(importedSettings.overtimeMeta);
      }

      await Promise.all([loadProjects(), loadNoteFolders()]);
      await Promise.all([
        loadTasks(activeProject),
        loadNotes(activeNoteFolder),
        loadDailyMonths(),
        loadOvertimeMonths(),
      ]);

      setBackupStatus('done');
      setBackupMsg(t(language, 'settings', 'backupRestored'));
      showToast({
        kind: 'success',
        title: t(language, 'toast', 'backupImported'),
        description: filePath.split('/').pop() ?? filePath,
      });
    } catch (err) {
      setBackupStatus('error');
      setBackupMsg(`${t(language, 'settings', 'backupImportError')} ${String(err)}`);
      showToast({
        kind: 'error',
        title: t(language, 'toast', 'importFailed'),
        description: String(err),
        durationMs: 4200,
      });
    }
  }

  if (!isSettingsOpen) return null;

  const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: t(language, 'settings', 'tabGeneral') },
    { id: 'work',    label: t(language, 'settings', 'tabWork') },
    { id: 'shortcuts', label: t(language, 'settings', 'tabShortcuts') },
    { id: 'data',    label: t(language, 'settings', 'tabData') },
    { id: 'git',     label: t(language, 'settings', 'tabGit') },
    { id: 'sync',    label: t(language, 'settings', 'tabSync') },
    { id: 'about',   label: t(language, 'settings', 'tabAbout') },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={toggleSettings}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden h-[90vh] max-h-[720px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t(language, 'settings', 'title')}</h2>
          <button
            onClick={toggleSettings}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex shrink-0 border-b border-[var(--border)] px-4">
          {SETTINGS_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSettingsTab(id)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                settingsTab === id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-[var(--text-hint)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-6">

          {/* ── GENERAL: Idioma · Tema · Fuente · Pantalla de inicio ── */}
          {settingsTab === 'general' && <>

          {/* Language section */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'language')}
            </p>
            <div className="flex gap-2">
              {LANGUAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLanguage(opt.value)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    language === opt.value
                      ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-400'
                      : 'border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Theme section */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'theme')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map(({ value, label, Icon, desc }) => {
                const isActive = theme === value;
                return (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition ${
                      isActive
                        ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-400'
                        : 'border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]'
                    }`}
                    title={desc}
                  >
                    <Icon size={20} />
                    <span className="text-xs font-medium">{label}</span>
                    {isActive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-center text-[10px] text-[var(--text-hint)]">
              {themeOptions.find((o) => o.value === theme)?.desc}
            </p>
          </div>

          {/* Startup screen section */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'startupScreen')}
            </p>
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-3">
              <div ref={startupSelectorRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsStartupSelectorOpen((s) => !s)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                    isStartupSelectorOpen
                      ? 'border-indigo-500/60 bg-indigo-500/10'
                      : 'border-[var(--border-card)] bg-[var(--bg-elevated)] hover:border-[var(--border-high)] hover:bg-[var(--bg-hover)]'
                  }`}
                  aria-haspopup="listbox"
                  aria-expanded={isStartupSelectorOpen}
                >
                  <span>
                    <span className="block text-xs font-medium text-[var(--text-secondary)]">
                      {activeStartupOption.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[var(--text-hint)]">
                      {activeStartupOption.desc}
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-[var(--text-hint)] transition-transform ${isStartupSelectorOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isStartupSelectorOpen && (
                  <div className="absolute left-0 right-0 z-20 mt-1.5 overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl">
                    <div role="listbox" aria-label={t(language, 'settings', 'startupOptionsAria')} className="p-1">
                      {startupScreenOptions.map(({ value, label, desc }) => {
                        const isActive = startupScreen === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onClick={() => {
                              void setStartupScreen(value);
                              setIsStartupSelectorOpen(false);
                            }}
                            className={`w-full rounded-md px-3 py-2 text-left transition ${
                              isActive
                                ? 'bg-indigo-500/10 text-indigo-400'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                            }`}
                          >
                            <span className="block text-xs font-medium">{label}</span>
                            <span className="mt-0.5 block text-[10px] text-[var(--text-hint)]">{desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] text-[var(--text-hint)]">
              {t(language, 'settings', 'startupHint')}
            </p>
          </div>

          {/* Font size section */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'fontSize')}
            </p>
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <Type size={13} />
                  <span className="text-xs">{t(language, 'settings', 'fontSizeLabel')}</span>
                </div>
                <span className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                  {fontSize}px
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFontSize(Math.max(11, fontSize - 1))}
                  disabled={fontSize <= 11}
                  className="rounded-lg border border-[var(--border-card)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus size={12} />
                </button>
                <div className="flex flex-1 gap-1">
                  {FONT_SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setFontSize(s)}
                      className={`flex-1 rounded py-1 text-[10px] font-medium transition ${
                        fontSize === s
                          ? 'bg-indigo-500/20 text-indigo-400'
                          : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setFontSize(Math.min(20, fontSize + 1))}
                  disabled={fontSize >= 20}
                  className="rounded-lg border border-[var(--border-card)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </div>

          </>}

          {/* ── WORK: Comportamiento · Notificaciones · Semana laboral · Accesibilidad ── */}
          {settingsTab === 'work' && <>

          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'behavior')}
            </p>
            <button
              onClick={() => void setConfirmDestructiveActions(!confirmDestructiveActions)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)]"
            >
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'confirmDeleteTitle')}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'confirmDeleteDesc')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${confirmDestructiveActions ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'}`}>
                  {confirmDestructiveActions ? t(language, 'settings', 'confirmDeleteEnabled') : t(language, 'settings', 'confirmDeleteDisabled')}
                </span>
                <span
                  className={`relative h-6 w-11 rounded-full transition ${confirmDestructiveActions ? 'bg-[var(--accent)]' : 'bg-[var(--border-card)]'}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${confirmDestructiveActions ? 'left-[22px]' : 'left-0.5'}`}
                  />
                </span>
              </div>
            </button>
          </div>

          {/* Notificaciones */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'notificationsSection')}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => void setNotificationsEnabled(!notificationsEnabled)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)]"
              >
                <div>
                  <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'notificationsEnabledTitle')}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'notificationsEnabledDesc')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${notificationsEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'}`}>
                    {notificationsEnabled ? t(language, 'settings', 'notificationsOn') : t(language, 'settings', 'notificationsOff')}
                  </span>
                  <span className={`relative h-6 w-11 rounded-full transition ${notificationsEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border-card)]'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${notificationsEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </span>
                </div>
              </button>
              {notificationsEnabled && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'notificationsDefaultMinutes')}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'notificationsDefaultMinutesDesc')}</p>
                  </div>
                  <div ref={reminderMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setIsReminderMenuOpen((s) => !s)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                        isReminderMenuOpen
                          ? 'border-indigo-500/60 bg-indigo-500/10 text-[var(--text-secondary)]'
                          : 'border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-body)] hover:border-[var(--border-high)]'
                      }`}
                    >
                      <span>{defaultReminderMinutes} min</span>
                      <ChevronDown size={11} className={`text-[var(--text-hint)] transition-transform ${isReminderMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isReminderMenuOpen && (
                      <div className="absolute right-0 z-50 mt-1 min-w-[7rem] overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-panel)] py-1 shadow-xl">
                        {[5, 10, 15, 30, 60, 120].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => { void setDefaultReminderMinutes(m); setIsReminderMenuOpen(false); }}
                            className={`w-full px-3 py-1.5 text-left text-xs transition ${
                              defaultReminderMinutes === m
                                ? 'bg-indigo-500/10 text-indigo-400'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                            }`}
                          >
                            {m} min
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Semana laboral */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'workWeekSection')}
            </p>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'workWeekTitle')}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'workWeekDesc')}</p>
              </div>
              <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
                {([5, 6] as (5 | 6)[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => void setWorkWeekDays(d)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      workWeekDays === d
                        ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/40'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {t(language, 'settings', d === 5 ? 'workWeek5' : 'workWeek6')}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'holidaysTitle')}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'holidaysDesc')}</p>
              </div>
              <button
                type="button"
                onClick={() => void setHolidaysAsNonWork(!holidaysAsNonWork)}
                className="flex shrink-0 items-center gap-2"
              >
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                  holidaysAsNonWork ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'
                }`}>
                  {holidaysAsNonWork
                    ? t(language, 'settings', 'holidaysEnabled')
                    : t(language, 'settings', 'holidaysDisabled')}
                </span>
                <span className={`relative h-6 w-11 rounded-full transition ${
                  holidaysAsNonWork ? 'bg-[var(--accent)]' : 'bg-[var(--border-card)]'
                }`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150 ${
                    holidaysAsNonWork ? 'left-[22px]' : 'left-0.5'
                  }`} />
                </span>
              </button>
            </div>
          </div>

          {/* Accesibilidad */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'accessibility')}
            </p>
            <button
              onClick={() => void setAnimationsEnabled(!animationsEnabled)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)]"
            >
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'animationsTitle')}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'animationsDesc')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                  animationsEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'
                }`}>
                  {animationsEnabled
                    ? t(language, 'settings', 'animationsEnabled')
                    : t(language, 'settings', 'animationsDisabled')}
                </span>
                <span className={`relative h-6 w-11 rounded-full transition ${
                  animationsEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border-card)]'
                }`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150 ${
                    animationsEnabled ? 'left-[22px]' : 'left-0.5'
                  }`} />
                </span>
              </div>
            </button>
          </div>

          </>}

          {/* ── SHORTCUTS: Atajos de teclado ── */}
          {settingsTab === 'shortcuts' && <>

          {/* Atajos de teclado */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'shortcuts')}
            </p>
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] divide-y divide-[var(--border)]">
              {(
                [
                  { key: 'newNote' as keyof Shortcuts, label: t(language, 'settings', 'shortcutNewNote') },
                  { key: 'newTask' as keyof Shortcuts, label: t(language, 'settings', 'shortcutNewTask') },
                  { key: 'search'  as keyof Shortcuts, label: t(language, 'settings', 'shortcutSearch') },
                ] as { key: keyof Shortcuts; label: string }[]
              ).map(({ key, label }) => {
                const isRecording = recordingFor === key;
                const currentKey = shortcuts[key].toUpperCase();
                return (
                  <div key={key} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Keyboard size={13} className="text-[var(--text-hint)]" />
                      {label}
                    </div>
                    <button
                      onClick={() => setRecordingFor(isRecording ? null : key)}
                      className={`min-w-[80px] rounded-lg border px-3 py-1 text-center text-xs font-mono transition ${
                        isRecording
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 animate-pulse'
                          : 'border-[var(--border-card)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-indigo-500/50 hover:text-indigo-400'
                      }`}
                    >
                      {isRecording ? t(language, 'settings', 'shortcutPress') : `⌘ ${currentKey}`}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-center text-[10px] text-[var(--text-hint)]">
              {t(language, 'settings', 'shortcutHint')}
            </p>
          </div>

          </>}

          {/* ── DATA: Almacenamiento · Backup ── */}
          {settingsTab === 'data' && <>

          {/* Storage section */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'storage')}
            </p>
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 space-y-2">
              <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'baseFolder')}</p>
              <p
                className="truncate text-xs text-[var(--text-secondary)] font-mono"
                title={basePath || t(language, 'settings', 'notConfigured')}
              >
                {basePath || t(language, 'settings', 'notConfigured')}
              </p>
              <div className="flex gap-2 pt-1 text-[10px] text-[var(--text-faint)]">
                <span>{t(language, 'settings', 'storageProjectsHint')}</span>
                <span>{t(language, 'settings', 'storageNotesHint')}</span>
              </div>
            </div>
            <button
              onClick={() => { changeBasePath(); }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            >
              <FolderOpen size={13} />
              {t(language, 'settings', 'changeFolder')}
            </button>
            <p className="mt-1.5 text-[10px] text-[var(--text-hint)] text-center">
              {t(language, 'settings', 'filesNotMoved')}
            </p>
            {basePath && isICloudPath(basePath) && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-[11px] font-semibold text-amber-400">{t(language, 'settings', 'icloudTitle')}</p>
                  <p className="mt-0.5 text-[10px] text-amber-300/80">
                    {t(language, 'settings', 'icloudDesc')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Backup section */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'backup')}
            </p>
            <div className="space-y-2">
              <button
                onClick={handleExport}
                disabled={!basePath || backupStatus === 'exporting' || backupStatus === 'importing'}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={13} className="shrink-0 text-indigo-400" />
                <div className="text-left">
                  <p className="font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'exportLabel')}</p>
                  <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'exportDesc')}</p>
                </div>
              </button>
              <button
                onClick={handleImport}
                disabled={!basePath || backupStatus === 'exporting' || backupStatus === 'importing'}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload size={13} className="shrink-0 text-emerald-400" />
                <div className="text-left">
                  <p className="font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'importLabel')}</p>
                  <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'importDesc')}</p>
                </div>
              </button>
            </div>
            {backupMsg && (
              <p className={`mt-2 text-center text-[10px] ${
                backupStatus === 'error' ? 'text-red-400' :
                backupStatus === 'done' ? 'text-emerald-400' : 'text-[var(--text-hint)]'
              }`}>
                {backupMsg}
              </p>
            )}
          </div>

          </>}

          {/* ── GIT: Control de versiones ── */}
          {settingsTab === 'git' && (() => {
            const statusIcon = {
              idle:    <Clock size={12} className="text-[var(--text-hint)]" />,
              synced:  <CheckCircle2 size={12} className="text-green-400" />,
              pending: <RefreshCw size={12} className="text-amber-400 animate-spin" />,
              error:   <AlertCircle size={12} className="text-red-400" />,
            }[gitStatus];

            const remoteStatusInfo: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
              synced:   { label: t(language, 'extras', 'remoteSynced'),   cls: 'text-green-400',  icon: <CheckCircle2 size={12} className="text-green-400" /> },
              behind:   { label: t(language, 'extras', 'remoteBehind'),   cls: 'text-blue-400',   icon: <ArrowDown size={12} className="text-blue-400" /> },
              ahead:    { label: t(language, 'extras', 'remoteAhead'),    cls: 'text-amber-400',  icon: <Upload size={12} className="text-amber-400" /> },
              diverged: { label: t(language, 'extras', 'remoteDiverged'), cls: 'text-purple-400', icon: <AlertCircle size={12} className="text-purple-400" /> },
              offline:  { label: t(language, 'extras', 'remoteOffline'),  cls: 'text-zinc-400',   icon: <CloudOff size={12} className="text-zinc-400" /> },
              unknown:  { label: t(language, 'extras', 'remoteUnknown'),  cls: 'text-zinc-400',   icon: <Clock size={12} className="text-zinc-400" /> },
            };

            return <>
            {/* Header de sección */}
            <div className="flex items-center gap-2 mb-1">
              <GitCommit size={14} className="text-indigo-400" />
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
                {t(language, 'extras', 'gitTitle')}
              </p>
            </div>

            {/* Activar/desactivar */}
            <label className="flex items-center justify-between cursor-pointer rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'extras', 'enableGit')}</p>
                <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'extras', 'gitRequired')}</p>
              </div>
              <button
                onClick={() => setGitEnabled((v) => !v)}
                className={gitToggleCls(gitEnabled)}
                role="switch"
                aria-checked={gitEnabled}
              >
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${gitEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
            </label>

            {/* Remote URL */}
            <div>
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
                {t(language, 'extras', 'remoteUrl')}
              </label>
              <input
                type="text"
                value={gitRemote}
                onChange={(e) => setGitRemote(e.target.value)}
                disabled={!gitEnabled}
                placeholder={t(language, 'extras', 'remotePlaceholder')}
                className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none disabled:opacity-40"
              />
              <p className="mt-1 text-[10px] text-[var(--text-hint)]">
                {t(language, 'extras', 'localOnlyHint')}
              </p>
            </div>

            {/* Identidad Git */}
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
                  {t(language, 'extras', 'userName')}
                </label>
                <input
                  type="text"
                  value={gitUserName}
                  onChange={(e) => setGitUserName(e.target.value)}
                  disabled={!gitEnabled}
                  placeholder={t(language, 'extras', 'userNamePlaceholder')}
                  className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none disabled:opacity-40"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
                  {t(language, 'extras', 'userEmail')}
                </label>
                <input
                  type="email"
                  value={gitUserEmail}
                  onChange={(e) => setGitUserEmail(e.target.value)}
                  disabled={!gitEnabled}
                  placeholder={t(language, 'extras', 'userEmailPlaceholder')}
                  className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none disabled:opacity-40"
                />
                <p className="mt-1 text-[10px] text-[var(--text-hint)]">
                  {t(language, 'extras', 'identityOverrideHint')}
                </p>
              </div>
            </div>

            {/* Opciones automáticas */}
            <div className="space-y-2">
              <label className="flex items-center justify-between cursor-pointer rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">{t(language, 'extras', 'autoCommitHourly')}</p>
                  <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'extras', 'whileOpen')}</p>
                </div>
                <button
                  onClick={() => setGitAutoCommit((v) => !v)}
                  disabled={!gitEnabled}
                  className={gitToggleCls(gitAutoCommit && gitEnabled)}
                  role="switch"
                  aria-checked={gitAutoCommit}
                >
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${gitAutoCommit && gitEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </button>
              </label>
              <label className="flex items-center justify-between cursor-pointer rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">{t(language, 'extras', 'pushOnSync')}</p>
                  <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'extras', 'remoteRequired')}</p>
                </div>
                <button
                  onClick={() => setGitAutoPush((v) => !v)}
                  disabled={!gitEnabled || !gitRemote.trim()}
                  className={gitToggleCls(gitAutoPush && gitEnabled && !!gitRemote.trim())}
                  role="switch"
                  aria-checked={gitAutoPush}
                >
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${gitAutoPush && gitEnabled && !!gitRemote.trim() ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </button>
              </label>
            </div>

            {/* Estado último commit + remoto */}
            {gitConfig.enabled && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2">
                  {statusIcon}
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {lastCommitTime
                      ? `${t(language, 'extras', 'lastCommitPrefix')} ${timeAgo(lastCommitTime, language)}`
                      : t(language, 'extras', 'noCommitsYet')}
                  </span>
                </div>
                {gitConfig.remote.trim() && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      {gitFetchBusy
                        ? <RefreshCw size={12} className="text-[var(--text-hint)] animate-spin" />
                        : remoteStatusInfo[gitRemoteStatus]?.icon}
                      <span className={`text-[11px] ${gitFetchBusy ? 'text-[var(--text-hint)]' : (remoteStatusInfo[gitRemoteStatus]?.cls ?? 'text-[var(--text-hint)]')}`}>
                        {gitFetchBusy ? t(language, 'extras', 'checkingRemote') : (remoteStatusInfo[gitRemoteStatus]?.label ?? '')}
                      </span>
                    </div>
                    <button
                      onClick={handleGitFetch}
                      disabled={gitFetchBusy || gitBusy}
                      className="rounded-lg p-1 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                      title={t(language, 'extras', 'refreshRemote')}
                    >
                      <RefreshCw size={11} className={gitFetchBusy ? 'animate-spin' : ''} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {gitErrorMsg && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
                <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-400" />
                <p className="flex-1 text-[11px] text-red-400 break-all">{gitErrorMsg}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(gitErrorMsg)}
                  className="shrink-0 rounded p-0.5 text-red-400/60 transition hover:text-red-400 hover:bg-red-500/20"
                  title={t(language, 'extras', 'copyError')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
              </div>
            )}

            {/* Acciones */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleGitSave}
                disabled={gitBusy}
                className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {gitBusy ? t(language, 'extras', 'saving') : t(language, 'extras', 'save')}
              </button>
              {gitConfig.enabled && (
                <button
                  onClick={handleGitSync}
                  disabled={gitBusy}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60"
                  title={gitRemote.trim() ? t(language, 'extras', 'commitPushTitle') : t(language, 'extras', 'commitLocalTitle')}
                >
                  {gitRemote.trim() ? <Upload size={13} /> : <RefreshCw size={13} />}
                  {gitRemote.trim() ? t(language, 'extras', 'push') : t(language, 'extras', 'commit')}
                </button>
              )}
              {gitConfig.enabled && gitConfig.remote.trim() && (
                <button
                  onClick={handleGitPull}
                  disabled={gitBusy}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60"
                  title={t(language, 'extras', 'pullTitle')}
                >
                  <Download size={13} />
                  {t(language, 'extras', 'pull')}
                </button>
              )}
            </div>
            </>;
          })()}

          {/* ── SYNC: conexión con servidor propio ── */}
          {settingsTab === 'sync' && (() => {
            const connected = syncConfig.enabled && syncConnectionStatus !== 'disconnected';
            const statusLabel = {
              disconnected: t(language, 'extras', 'syncDisconnected'),
              connecting: t(language, 'extras', 'syncConnecting'),
              connected: t(language, 'extras', 'syncConnected'),
              error: t(language, 'extras', 'syncError'),
            }[syncConnectionStatus];
            const statusIcon = {
              disconnected: <CloudOff size={12} className="text-[var(--text-hint)]" />,
              connecting: <RefreshCw size={12} className="text-amber-400 animate-spin" />,
              connected: <CheckCircle2 size={12} className="text-green-400" />,
              error: <AlertCircle size={12} className="text-red-400" />,
            }[syncConnectionStatus];

            return <>
            {/* Header de sección */}
            <div className="flex items-center gap-2 mb-1">
              <Upload size={14} className="text-indigo-400" />
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
                {t(language, 'extras', 'syncTitle')}
              </p>
            </div>
            <p className="text-[10px] text-[var(--text-hint)] -mt-2">
              {t(language, 'extras', 'syncOptionalHint')}
            </p>

            {connected ? (
              <>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-[var(--text-secondary)]">{syncConfig.serverUrl}</p>
                    <p className="text-[10px] text-[var(--text-hint)]">{syncConfig.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {statusIcon}
                    <span className="text-[11px] text-[var(--text-secondary)]">{statusLabel}</span>
                  </div>
                </div>
                <button
                  onClick={handleSyncDisconnect}
                  className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)]"
                >
                  {t(language, 'extras', 'syncDisconnect')}
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
                    {t(language, 'extras', 'syncServerUrl')}
                  </label>
                  <input
                    type="text"
                    value={syncServerUrl}
                    onChange={(e) => setSyncServerUrl(e.target.value)}
                    placeholder={t(language, 'extras', 'syncServerUrlPlaceholder')}
                    className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
                    {t(language, 'extras', 'syncEmail')}
                  </label>
                  <input
                    type="email"
                    value={syncEmail}
                    onChange={(e) => setSyncEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
                    {t(language, 'extras', 'syncPassword')}
                  </label>
                  <div className="relative">
                    <input
                      type={showSyncPassword ? 'text' : 'password'}
                      value={syncPassword}
                      onChange={(e) => setSyncPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSyncConnect(); }}
                      className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 pr-9 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSyncPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-2.5 text-[var(--text-hint)] transition hover:text-[var(--text-primary)]"
                      title={showSyncPassword ? t(language, 'extras', 'hidePassword') : t(language, 'extras', 'showPassword')}
                    >
                      {showSyncPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {syncErrorMsg && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
                <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-400" />
                <p className="flex-1 text-[11px] text-red-400 break-all">{syncErrorMsg}</p>
              </div>
            )}

            {!connected && (
              <div className="pt-1">
                <button
                  onClick={handleSyncConnect}
                  disabled={syncConnectionStatus === 'connecting' || !syncServerUrl.trim() || !syncEmail.trim() || !syncPassword}
                  className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                >
                  {syncConnectionStatus === 'connecting' ? t(language, 'extras', 'syncConnecting') : t(language, 'extras', 'syncConnect')}
                </button>
              </div>
            )}
            </>;
          })()}

          {/* ── ABOUT: Versión · Actualizaciones ── */}
          {settingsTab === 'about' && <>

          {/* Updates section */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'updates')}
            </p>
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'currentVersion')}</span>
                <span className="text-xs font-mono font-semibold text-[var(--text-secondary)]">v{appVersion}</span>
              </div>
              <button
                onClick={handleCheckUpdate}
                disabled={updateStatus === 'checking'}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] px-4 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={12} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                {updateStatus === 'checking'
                  ? t(language, 'settings', 'checking')
                  : t(language, 'settings', 'checkUpdates')}
              </button>
              {updateStatus === 'upToDate' && (
                <p className="text-center text-[10px] text-emerald-400">{t(language, 'settings', 'upToDate')}</p>
              )}
              {updateStatus === 'error' && (
                <p className="text-center text-[10px] text-red-400">{t(language, 'settings', 'checkError')}</p>
              )}
              {updateStatus === 'available' && releaseInfo && (
                <div className="space-y-2">
                  <p className="text-center text-[10px] text-indigo-400 font-semibold">
                    {t(language, 'settings', 'updateAvailable')}: {releaseInfo.tag_name}
                  </p>
                  {releaseInfo.body && (
                    <p className="text-[10px] text-[var(--text-hint)] line-clamp-3">{releaseInfo.body}</p>
                  )}
                  <button
                    onClick={() => fs.openUrl(releaseInfo.html_url)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs text-indigo-400 transition hover:bg-indigo-500/20"
                  >
                    <ExternalLink size={12} />
                    {t(language, 'settings', 'downloadUpdate')} {releaseInfo.tag_name}
                  </button>
                </div>
              )}
            </div>
          </div>

          </>}

        </div>
      </div>
    </div>
  );
}

