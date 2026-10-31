import { useEffect, useState } from 'react';
import { X, Settings2, PanelLeft, SlidersHorizontal, Keyboard, FolderOpen, RefreshCw, GitBranch, Puzzle, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { GitSettingsTab } from './GitSettingsTab';
import { SyncSettingsTab } from './SyncSettingsTab';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { NavigationSettingsTab } from './NavigationSettingsTab';
import { WorkSettingsTab } from './WorkSettingsTab';
import { ShortcutsSettingsTab } from './ShortcutsSettingsTab';
import { DataSettingsTab } from './DataSettingsTab';
import { AboutSettingsTab } from './AboutSettingsTab';
import { ExtensionsSettingsTab } from './ExtensionsSettingsTab';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';
import { useExtensions } from '../../extensions/useExtensions';
import { ExtensionSlot } from '../../extensions/ExtensionSlot';
import { extensionText } from '../../extensions/text';
import type { ExtensionDefinition, ExtensionId } from '../../extensions/types';
import type { Language } from '../../types/common';

// `ext:<id>`: el panel de una extensión activa, con su propia entrada (R21
// de specs/extensiones).
type SettingsTab = 'general' | 'navigation' | 'work' | 'shortcuts' | 'data' | 'git' | 'sync' | 'extensions' | `ext:${ExtensionId}` | 'about';

/** Las entradas del grupo App. Navegación va segunda, junto a General
 *  (specs/navegacion-secciones NS21). */
export function appTabs(language: Language): { id: SettingsTab; label: string; icon: LucideIcon }[] {
  return [
    { id: 'general',    label: t(language, 'settings', 'tabGeneral'),    icon: Settings2 },
    { id: 'navigation', label: t(language, 'settings', 'tabNavigation'), icon: PanelLeft },
    { id: 'work',       label: t(language, 'settings', 'tabWork'),       icon: SlidersHorizontal },
    { id: 'shortcuts',  label: t(language, 'settings', 'tabShortcuts'),  icon: Keyboard },
  ];
}

export function SettingsModal() {
  const {
    isSettingsOpen, toggleSettings,
    language,
    isGitOpen, toggleGit,
    isSyncOpen, toggleSync,
    settingsExtensionRequest, clearExtensionSettingsRequest,
    sidebarSettingsRequest, clearSidebarSettingsRequest,
    extensionsCatalogRequest, clearExtensionsCatalogRequest,
  } = useAppStore();

  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const { enabled: enabledExtensions } = useExtensions();
  // En orden alfabético, como las tarjetas del catálogo.
  const extensionPages = enabledExtensions
    .filter((def) => def.settings)
    .sort((a, b) => extensionText(language, a.id, 'name').localeCompare(extensionText(language, b.id, 'name'), language));
  const openExtension = settingsTab.startsWith('ext:')
    ? extensionPages.find((def) => `ext:${def.id}` === settingsTab)
    : undefined;

  // Si se desactiva la extensión cuya página está abierta, se vuelve al
  // catálogo en vez de dejar una página vacía.
  useEffect(() => {
    if (settingsTab.startsWith('ext:') && !openExtension) setSettingsTab('extensions');
  }, [settingsTab, openExtension]);

  // Cerrar con Escape. Un menú abierto dentro (el de la pantalla de
  // inicio) se cierra primero: escucha en captura y corta el evento.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isSettingsOpen) return;
      toggleSettings();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSettingsOpen, toggleSettings]);

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

  // Abrir en la página de una extensión (`openExtensionSettings`, p. ej.
  // el botón "Opciones" del Pomodoro).
  useEffect(() => {
    if (isSettingsOpen && settingsExtensionRequest) {
      setSettingsTab(`ext:${settingsExtensionRequest}`);
      clearExtensionSettingsRequest();
    }
  }, [isSettingsOpen, settingsExtensionRequest, clearExtensionSettingsRequest]);

  // "Ordenar secciones…" del menú "Más" abre Navegación, que empieza por
  // el menú lateral (specs/navegacion-secciones NS21).
  useEffect(() => {
    if (!isSettingsOpen || !sidebarSettingsRequest) return;
    setSettingsTab('navigation');
    clearSidebarSettingsRequest();
  }, [isSettingsOpen, sidebarSettingsRequest, clearSidebarSettingsRequest]);

  // "Ver extensiones" del aviso de Inicio abre el catálogo
  // (specs/extensiones R27).
  useEffect(() => {
    if (!isSettingsOpen || !extensionsCatalogRequest) return;
    setSettingsTab('extensions');
    clearExtensionsCatalogRequest();
  }, [isSettingsOpen, extensionsCatalogRequest, clearExtensionsCatalogRequest]);

  if (!isSettingsOpen) return null;

  // Barra lateral agrupada en vez de pestañas arriba: con más secciones
  // (Extensiones y, debajo, una entrada por extensión activa) la fila de
  // pestañas ya no cabía en español. Un grupo sin `label` va sin encabezado.
  // El icono y el color más claro de las secciones las separan de los
  // encabezados, que en tema oscuro tenían casi el mismo gris.
  const NAV_GROUPS: { label?: string; items: { id: SettingsTab; label: string; icon: LucideIcon; nested?: boolean }[] }[] = [
    {
      label: t(language, 'settings', 'groupApp'),
      items: appTabs(language),
    },
    {
      label: t(language, 'settings', 'groupDataConnection'),
      items: [
        { id: 'data', label: t(language, 'settings', 'tabData'), icon: FolderOpen },
        { id: 'sync', label: t(language, 'settings', 'tabSync'), icon: RefreshCw },
        { id: 'git',  label: t(language, 'settings', 'tabGit'),  icon: GitBranch },
      ],
    },
    // Extensiones va sola, sin encabezado, y debajo una entrada por cada
    // extensión activa con panel, como los complementos de Obsidian.
    {
      items: [
        { id: 'extensions', label: t(language, 'settings', 'tabExtensions'), icon: Puzzle },
        ...extensionPages.map((def) => ({
          id: `ext:${def.id}` as const,
          label: extensionText(language, def.id, 'name'),
          icon: def.icon,
          nested: true,
        })),
      ],
    },
    // Acerca de cierra la lista, pegado al último grupo: fijo al pie de la
    // barra quedaba suelto, con un hueco grande encima.
    { items: [{ id: 'about', label: t(language, 'settings', 'tabAbout'), icon: Info }] },
  ];

  const navItem = (id: SettingsTab, label: string, Icon: LucideIcon, nested = false) => (
    <button
      key={id}
      type="button"
      onClick={() => setSettingsTab(id)}
      aria-current={settingsTab === id ? 'page' : undefined}
      title={nested ? label : undefined}
      className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2.5 text-left text-xs font-medium transition ${
        nested ? 'pl-6' : 'pl-2.5'
      } ${
        settingsTab === id
          ? 'bg-indigo-500/15 text-indigo-400'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon size={14} className="shrink-0" />
      {/* Los nombres de extensión son más largos: pasan a dos líneas en
          vez de cortarse en la ventana mínima. */}
      <span className={nested ? 'leading-snug' : 'truncate'}>{label}</span>
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
            className="flex w-[180px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-[var(--border)] bg-[var(--bg-surface)] px-2 py-4"
          >
            {NAV_GROUPS.map(({ label, items }, i) => (
              <div key={label ?? i} className="space-y-0.5">
                {label && (
                  <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]">{label}</p>
                )}
                {items.map(({ id, label: itemLabel, icon, nested }) => navItem(id, itemLabel, icon, nested))}
              </div>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto px-5 py-5 space-y-6">

            {/* ── GENERAL: Idioma · Tema · Fuente ── */}
            {settingsTab === 'general' && <GeneralSettingsTab />}

            {/* ── NAVIGATION: Menú lateral · Pantalla de inicio · Vistas de notas y tareas ── */}
            {settingsTab === 'navigation' && <NavigationSettingsTab />}

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

            {/* ── EXTENSIONS: catálogo de extensiones (specs/extensiones) ── */}
            {settingsTab === 'extensions' && (
              <ExtensionsSettingsTab onOpenSettings={(id) => setSettingsTab(`ext:${id}`)} />
            )}

            {/* ── EXT:<id>: panel de una extensión activa (R21) ── */}
            {openExtension && <ExtensionSettingsPage def={openExtension} />}

            {/* ── ABOUT: Versión · Actualizaciones ── */}
            {settingsTab === 'about' && <AboutSettingsTab />}

          </div>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}


/** Página propia del panel de una extensión: su nombre y descripción, y su
 *  `Settings` aislado en `ExtensionBoundary` (R15, R21). */
function ExtensionSettingsPage({ def }: { def: ExtensionDefinition }) {
  const language = useAppStore((s) => s.language);
  const Icon = def.icon;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{extensionText(language, def.id, 'name')}</h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-hint)]">{extensionText(language, def.id, 'description')}</p>
        </div>
      </div>
      <ExtensionSlot id={def.id} point="Settings" props={{}} />
    </div>
  );
}
