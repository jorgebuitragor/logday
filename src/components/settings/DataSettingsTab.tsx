import { useState } from 'react';
import { FolderOpen, Download, Upload, AlertTriangle, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { Shortcuts, BackupSettings } from '../../types/config';
import { t } from '../../lib/i18n';
import { fs } from '../../lib/invoke';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import JSZip from 'jszip';
import ToggleSwitch from '../shared/ToggleSwitch';
import { TrashModal } from './TrashModal';

const BACKUP_SETTINGS_PATH = '__logday/settings.json';

function isICloudPath(path: string): boolean {
  return (
    path.includes('/Library/Mobile Documents') ||
    path.includes('com~apple~CloudDocs') ||
    path.includes('/iCloud Drive/')
  );
}

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

export function DataSettingsTab() {
  const {
    language,
    basePath, changeBasePath,
    theme, setTheme,
    customThemes, replaceCustomThemes,
    startupScreen, setStartupScreen,
    fontSize, setFontSize,
    confirmDestructiveActions, setConfirmDestructiveActions,
    setLanguage,
    shortcuts, setShortcut,
    folderTags, replaceFolderTags,
    overtimeMeta, replaceOvertimeMetaSnapshot,
    activeProject, activeNoteFolder,
    loadProjects, loadTasks,
    loadNoteFolders, loadNotes,
    loadDailyMonths, loadOvertimeMonths,
    showToast,
    trashAutoPurgeEnabled, setTrashAutoPurgeEnabled,
  } = useAppStore();

  const [backupStatus, setBackupStatus] = useState<'idle' | 'exporting' | 'importing' | 'done' | 'error'>('idle');
  const [backupMsg, setBackupMsg] = useState('');
  const [showTrashModal, setShowTrashModal] = useState(false);

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
        customThemes,
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

      if (importedSettings?.customThemes) {
        replaceCustomThemes(importedSettings.customThemes);
      }
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

  return <>

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

  {/* Trash section */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'trashSection')}
    </p>
    <div
      onClick={() => void setTrashAutoPurgeEnabled(!trashAutoPurgeEnabled)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)] cursor-pointer"
    >
      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'trashAutoPurgeTitle')}</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'trashAutoPurgeDesc')}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${trashAutoPurgeEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'}`}>
          {trashAutoPurgeEnabled ? t(language, 'settings', 'trashAutoPurgeEnabled') : t(language, 'settings', 'trashAutoPurgeDisabled')}
        </span>
        <ToggleSwitch checked={trashAutoPurgeEnabled} onChange={setTrashAutoPurgeEnabled} size="lg" />
      </div>
    </div>
    <button
      onClick={() => setShowTrashModal(true)}
      disabled={!basePath}
      className="mt-2 flex w-full items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Trash2 size={13} className="shrink-0 text-red-400" />
      <div className="text-left">
        <p className="font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'trashViewButton')}</p>
        <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'trashViewDesc')}</p>
      </div>
    </button>
  </div>

  {showTrashModal && <TrashModal onClose={() => setShowTrashModal(false)} />}

  </>;
}
