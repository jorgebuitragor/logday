import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';
import { GitSettingsTab } from './GitSettingsTab';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { WorkSettingsTab } from './WorkSettingsTab';
import { ShortcutsSettingsTab } from './ShortcutsSettingsTab';
import { DataSettingsTab } from './DataSettingsTab';
import { AboutSettingsTab } from './AboutSettingsTab';

type SettingsTab = 'general' | 'work' | 'shortcuts' | 'data' | 'git' | 'about';

export function SettingsModal() {
  const {
    isSettingsOpen, toggleSettings,
    language,
    isGitOpen, toggleGit,
  } = useAppStore();

  const [isStartupSelectorOpen, setIsStartupSelectorOpen] = useState(false);
  const startupSelectorRef = useRef<HTMLDivElement | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');

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

  // Navegar al tab git cuando se activa isGitOpen desde el sidebar
  useEffect(() => {
    if (isSettingsOpen && isGitOpen) {
      setSettingsTab('git');
      toggleGit(); // limpiar la señal
    }
  }, [isSettingsOpen, isGitOpen, toggleGit]);

  if (!isSettingsOpen) return null;

  const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: t(language, 'settings', 'tabGeneral') },
    { id: 'work',    label: t(language, 'settings', 'tabWork') },
    { id: 'shortcuts', label: t(language, 'settings', 'tabShortcuts') },
    { id: 'data',    label: t(language, 'settings', 'tabData') },
    { id: 'git',     label: t(language, 'settings', 'tabGit') },
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
          {settingsTab === 'general' && (
            <GeneralSettingsTab
              isStartupSelectorOpen={isStartupSelectorOpen}
              setIsStartupSelectorOpen={setIsStartupSelectorOpen}
              startupSelectorRef={startupSelectorRef}
            />
          )}

          {/* ── WORK: Comportamiento · Notificaciones · Semana laboral · Accesibilidad ── */}
          {settingsTab === 'work' && <WorkSettingsTab />}

          {/* ── SHORTCUTS: Atajos de teclado ── */}
          {settingsTab === 'shortcuts' && <ShortcutsSettingsTab />}

          {/* ── DATA: Almacenamiento · Backup ── */}
          {settingsTab === 'data' && <DataSettingsTab />}

          {/* ── GIT: Control de versiones ── */}
          <GitSettingsTab active={settingsTab === 'git'} />

          {/* ── ABOUT: Versión · Actualizaciones ── */}
          {settingsTab === 'about' && <AboutSettingsTab />}

        </div>
      </div>
    </div>
  );
}

