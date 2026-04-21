import { useEffect, useState } from 'react';
import { X, Monitor, Sun, Moon, FolderOpen, Minus, Plus, Download, Upload, Type, Keyboard, AlertTriangle } from 'lucide-react';
import { Theme, Shortcuts } from '../types';
import { useAppStore } from '../store/appStore';
import { fs } from '../lib/invoke';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import JSZip from 'jszip';

function isICloudPath(path: string): boolean {
  return (
    path.includes('/Library/Mobile Documents') ||
    path.includes('com~apple~CloudDocs') ||
    path.includes('/iCloud Drive/')
  );
}

const THEME_OPTIONS: { value: Theme; label: string; Icon: React.ElementType; desc: string }[] = [
  { value: 'system', label: 'Sistema', Icon: Monitor, desc: 'Sigue la preferencia del SO' },
  { value: 'light',  label: 'Claro',   Icon: Sun,     desc: 'Fondo blanco, texto oscuro' },
  { value: 'dark',   label: 'Oscuro',  Icon: Moon,    desc: 'Fondo negro, texto claro' },
];

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

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
    fontSize, setFontSize,
    basePath, changeBasePath,
    shortcuts, setShortcut,
  } = useAppStore();

  const [backupStatus, setBackupStatus] = useState<'idle' | 'exporting' | 'importing' | 'done' | 'error'>('idle');
  const [backupMsg, setBackupMsg] = useState('');
  const [recordingFor, setRecordingFor] = useState<keyof Shortcuts | null>(null);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSettingsOpen) toggleSettings();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSettingsOpen, toggleSettings]);

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
      setBackupMsg('Empaquetando archivos…');

      const zip = new JSZip();
      await collectFiles(zip, basePath, basePath);

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
        setBackupMsg('Respaldo guardado correctamente');
      } else {
        setBackupStatus('idle');
        setBackupMsg('');
      }
    } catch (err) {
      setBackupStatus('error');
      setBackupMsg('Error al exportar: ' + String(err));
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
      setBackupMsg('Restaurando archivos…');

      const b64Raw: string = await invoke('read_file_binary', { path: filePath });
      const rawBytes = Uint8Array.from(atob(b64Raw), c => c.charCodeAt(0));
      const zip = await JSZip.loadAsync(rawBytes);

      const tasks: Promise<void>[] = [];
      zip.forEach((relativePath, file) => {
        if (!file.dir) {
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
        }
      });

      await Promise.all(tasks);
      setBackupStatus('done');
      setBackupMsg('Datos restaurados. Reinicia la app para ver los cambios.');
    } catch (err) {
      setBackupStatus('error');
      setBackupMsg('Error al importar: ' + String(err));
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
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Opciones</h2>
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
              Almacenamiento
            </p>
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 space-y-2">
              <p className="text-[10px] text-[var(--text-hint)]">Carpeta base</p>
              <p
                className="truncate text-xs text-[var(--text-secondary)] font-mono"
                title={basePath || '(sin configurar)'}
              >
                {basePath || '(sin configurar)'}
              </p>
              <div className="flex gap-2 pt-1 text-[10px] text-[var(--text-faint)]">
                <span>↳ projects/ (tareas)</span>
                <span>↳ notes/ (notas)</span>
              </div>
            </div>
            <button
              onClick={() => { changeBasePath(); }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            >
              <FolderOpen size={13} />
              Cambiar carpeta base…
            </button>
            <p className="mt-1.5 text-[10px] text-[var(--text-hint)] text-center">
              Los archivos existentes no se mueven automáticamente
            </p>
            {basePath && isICloudPath(basePath) && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-[11px] font-semibold text-amber-400">Carpeta en iCloud Drive</p>
                  <p className="mt-0.5 text-[10px] text-amber-300/80">
                    La app puede congelarse mientras iCloud sincroniza. Recomendamos usar una carpeta local.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Theme section */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              Tema
            </p>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map(({ value, label, Icon, desc }) => {
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
              {THEME_OPTIONS.find((o) => o.value === theme)?.desc}
            </p>
          </div>

          {/* Font size section */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              Tipografía
            </p>
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <Type size={13} />
                  <span className="text-xs">Tamaño de fuente</span>
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

          {/* Atajos de teclado */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              Atajos de teclado
            </p>
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] divide-y divide-[var(--border)]">
              {(
                [
                  { key: 'newNote' as keyof Shortcuts, label: 'Nueva nota' },
                  { key: 'newTask' as keyof Shortcuts, label: 'Nueva tarea' },
                  { key: 'search'  as keyof Shortcuts, label: 'Búsqueda global' },
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
                      {isRecording ? 'Presiona una tecla…' : `⌘ ${currentKey}`}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-center text-[10px] text-[var(--text-hint)]">
              Siempre se combinan con ⌘ (Mac) o Ctrl (Windows)
            </p>
          </div>

          {/* Backup section */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
              Respaldo de datos
            </p>
            <div className="space-y-2">
              <button
                onClick={handleExport}
                disabled={!basePath || backupStatus === 'exporting' || backupStatus === 'importing'}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={13} className="shrink-0 text-indigo-400" />
                <div className="text-left">
                  <p className="font-medium text-[var(--text-secondary)]">Exportar como .zip</p>
                  <p className="text-[10px] text-[var(--text-hint)]">Guarda todos tus datos en un archivo de respaldo</p>
                </div>
              </button>
              <button
                onClick={handleImport}
                disabled={!basePath || backupStatus === 'exporting' || backupStatus === 'importing'}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload size={13} className="shrink-0 text-emerald-400" />
                <div className="text-left">
                  <p className="font-medium text-[var(--text-secondary)]">Importar desde .zip</p>
                  <p className="text-[10px] text-[var(--text-hint)]">Restaura datos desde un respaldo previo</p>
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

        </div>
      </div>
    </div>
  );
}

