import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { GitSettingsTab } from './GitSettingsTab';
import { SyncSettingsTab } from './SyncSettingsTab';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { WorkSettingsTab } from './WorkSettingsTab';
import { ShortcutsSettingsTab } from './ShortcutsSettingsTab';
import { DataSettingsTab } from './DataSettingsTab';
import { AboutSettingsTab } from './AboutSettingsTab';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';

type SettingsTab = 'general' | 'work' | 'shortcuts' | 'data' | 'git' | 'sync' | 'about';

export function SettingsModal() {
  const {
    isSettingsOpen, toggleSettings,
    language,
    isGitOpen, toggleGit,
    isSyncOpen, toggleSync,
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

  // Navegar al tab sync cuando se activa isSyncOpen desde el sidebar
  useEffect(() => {
    if (isSettingsOpen && isSyncOpen) {
      setSettingsTab('sync');
      toggleSync(); // limpiar la señal
    }
  }, [isSettingsOpen, isSyncOpen, toggleSync]);

  if (!isSettingsOpen) return null;

  // Barra lateral agrupada en vez de pestañas arriba: con más secciones
  // (Extensiones y, debajo, una entrada por extensión activa) la fila de
  // pestañas ya no cabía en español. Un grupo sin `label` va sin encabezado.
  const NAV_GROUPS: { label?: string; items: { id: SettingsTab; label: string }[] }[] = [
    {
      label: t(language, 'settings', 'groupApp'),
      items: [
        { id: 'general',   label: t(language, 'settings', 'tabGeneral') },
        { id: 'work',      label: t(language, 'settings', 'tabWork') },
        { id: 'shortcuts', label: t(language, 'settings', 'tabShortcuts') },
      ],
    },
    {
      label: t(language, 'settings', 'groupDataConnection'),
      items: [
        { id: 'data', label: t(language, 'settings', 'tabData') },
        { id: 'sync', label: t(language, 'settings', 'tabSync') },
        { id: 'git',  label: t(language, 'settings', 'tabGit') },
      ],
    },
  ];

  const navItem = (id: SettingsTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setSettingsTab(id)}
      aria-current={settingsTab === id ? 'page' : undefined}
      className={`w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition ${
        settingsTab === id
          ? 'bg-indigo-500/15 text-indigo-400'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <ModalOverlay onClose={toggleSettings} className="px-4">
      <ModalPanel className="w-full max-w-3xl rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden h-[90vh] max-h-[720px] flex flex-col">
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

        <div className="flex flex-1 min-h-0">
          {/* Navegación lateral */}
          <nav
            aria-label={t(language, 'settings', 'navLabel')}
            className="flex w-[180px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--border)] bg-[var(--bg-surface)] px-2 py-4"
          >
            {NAV_GROUPS.map(({ label, items }, i) => (
              <div key={label ?? i} className="space-y-0.5">
                {label && (
                  <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">{label}</p>
                )}
                {items.map(({ id, label: itemLabel }) => navItem(id, itemLabel))}
              </div>
            ))}
            {/* Acerca de va siempre al final de la barra */}
            <div className="mt-auto">
              {navItem('about', t(language, 'settings', 'tabAbout'))}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto px-5 py-5 space-y-6">

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

            {/* ── SYNC: conexión con servidor propio ── */}
            {settingsTab === 'sync' && <SyncSettingsTab />}

            {/* ── ABOUT: Versión · Actualizaciones ── */}
            {settingsTab === 'about' && <AboutSettingsTab />}

          </div>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}

