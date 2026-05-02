import { useEffect, useRef, useState } from 'react';
import { X, Monitor, Sun, Moon, FolderOpen, Minus, Plus, Download, Upload, Type, Keyboard, AlertTriangle, ChevronDown, Eye, RefreshCw, ExternalLink } from 'lucide-react';
import { Theme, Shortcuts, StartupScreen, Language, BackupSettings } from '../types';
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
    basePath, changeBasePath,
    shortcuts, setShortcut,
    folderTags, replaceFolderTags,
    overtimeMeta, replaceOvertimeMetaSnapshot,
    activeProject, activeNoteFolder,
    loadProjects, loadTasks,
    loadNoteFolders, loadNotes,
    loadDailyMonths, loadOvertimeMonths,
    showToast,
  } = useAppStore();

  const [backupStatus, setBackupStatus] = useState<'idle' | 'exporting' | 'importing' | 'done' | 'error'>('idle');
  const [backupMsg, setBackupMsg] = useState('');
  const [recordingFor, setRecordingFor] = useState<keyof Shortcuts | null>(null);
  const [isStartupSelectorOpen, setIsStartupSelectorOpen] = useState(false);
  const startupSelectorRef = useRef<HTMLDivElement | null>(null);
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'upToDate' | 'available' | 'error'>('idle');
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={toggleSettings}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
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

        {/* Content */}
        <div className="px-5 py-5 space-y-6 overflow-y-auto">

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
                  <select
                    value={defaultReminderMinutes}
                    onChange={(e) => void setDefaultReminderMinutes(Number(e.target.value))}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-xs text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  >
                    {[5, 10, 15, 30, 60, 120].map((m) => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
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
                        ? 'bg-indigo-600 text-white shadow'
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

        </div>
      </div>
    </div>
  );
}

