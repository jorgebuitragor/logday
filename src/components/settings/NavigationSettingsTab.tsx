// Opciones → Navegación (specs/navegacion-secciones NS21): cómo se recorre
// la app. El menú lateral, la pantalla de inicio y las vistas con que abren
// Notas y Tareas; antes estaban repartidos entre General y Preferencias.
import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, FolderTree, Layout, List, Rows3, type LucideIcon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { TASK_VIEW_MODES } from '../../lib/viewDefaults';
import type { StartupScreen } from '../../types/config';
import { useExtensions } from '../../extensions/useExtensions';
import { extensionSection } from '../../extensions/state';
import { extensionText } from '../../extensions/text';
import { SidebarSettings } from './SidebarSettings';
import { ViewPreview, type ViewPreviewKind } from './ViewPreviews';

const STARTUP_SCREEN_VALUES: StartupScreen[] = ['dashboard', 'dailys', 'tasks', 'notes', 'overtime'];

const SECTION_TITLE = 'mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]';

export function NavigationSettingsTab() {
  return <>
    <SidebarSettings />
    <StartupScreenSettings />
    <NotesViewSettings />
    <TasksViewSettings />
  </>;
}

/** El selector de la pantalla de inicio, con su menú desplegable. */
function StartupScreenSettings() {
  const { language, startupScreen, setStartupScreen } = useAppStore(
    useShallow((s) => ({ language: s.language, startupScreen: s.startupScreen, setStartupScreen: s.setStartupScreen })),
  );
  const enabledExtensions = useExtensions().enabled;
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Mientras el menú está abierto, Esc lo cierra a él y no a Opciones: se
  // escucha en captura para llegar antes que el `keydown` de SettingsModal.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setIsOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [isOpen]);

  const options: { value: StartupScreen; label: string; desc: string }[] = [
    ...STARTUP_SCREEN_VALUES.map((value) => ({
      value,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      label: t(language, 'settings', `startup${value.charAt(0).toUpperCase() + value.slice(1)}` as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      desc: t(language, 'settings', `startupDesc${value.charAt(0).toUpperCase() + value.slice(1)}` as any),
    })),
    // Las vistas de las extensiones activas también pueden ser la pantalla
    // de inicio (specs/extensiones R13).
    ...enabledExtensions.filter((def) => def.view).map((def) => ({
      value: extensionSection(def.id) as StartupScreen,
      label: extensionText(language, def.id, 'name'),
      desc: extensionText(language, def.id, 'description'),
    })),
  ];
  const active = options.find((o) => o.value === startupScreen) ?? options[0];

  return (
    <div>
      <p className={SECTION_TITLE}>{t(language, 'settings', 'startupScreen')}</p>
      {/* El selector va directo, sin otra tarjeta alrededor (Jorge, 31 oct 2026). */}
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((s) => !s)}
          className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
            isOpen
              ? 'border-indigo-500/60 bg-indigo-500/10'
              : 'border-[var(--border-card)] bg-[var(--bg-surface)] hover:border-[var(--border-high)] hover:bg-[var(--bg-hover)]'
          }`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span>
            <span className="block text-xs font-medium text-[var(--text-secondary)]">{active.label}</span>
            <span className="mt-0.5 block text-[10px] text-[var(--text-hint)]">{active.desc}</span>
          </span>
          <ChevronDown size={14} className={`text-[var(--text-hint)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute left-0 right-0 z-20 mt-1.5 overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl">
            <div role="listbox" aria-label={t(language, 'settings', 'startupOptionsAria')} className="p-1">
              {options.map(({ value, label, desc }) => {
                const isActive = startupScreen === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      void setStartupScreen(value);
                      setIsOpen(false);
                    }}
                    className={`w-full rounded-md px-3 py-2 text-left transition ${
                      isActive ? 'bg-indigo-500/10 text-indigo-400' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
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
      <p className="mt-2 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'startupHint')}</p>
    </div>
  );
}

/** Botones de una vista por defecto, el mismo control para Notas y Tareas. */
interface ViewOption<V extends string> {
  value: V;
  label: string;
  desc: string;
  Icon: LucideIcon;
  preview: ViewPreviewKind;
}

/** Una tarjeta por vista, con su miniatura, ícono, nombre y una línea que
 *  dice cómo es (antes solo el nombre, y no se entendía a qué se refería). */
function ViewChoice<V extends string>({ title, hint, value, options, onChange }: {
  title: string;
  hint: string;
  value: V;
  options: readonly ViewOption<V>[];
  onChange: (value: V) => void;
}) {
  return (
    <div role="group" aria-label={title}>
      <p className="mb-1 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">{title}</p>
      <p className="mb-3 text-[11px] text-[var(--text-hint)]">{hint}</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt.value)}
              className={`flex flex-col gap-2 rounded-xl border p-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                selected
                  ? 'border-indigo-500/60 bg-indigo-500/10'
                  : 'border-[var(--border-card)] bg-[var(--bg-surface)] hover:border-[var(--border-high)]'
              }`}
            >
              <ViewPreview kind={opt.preview} active={selected} />
              <span className={`flex items-center gap-1.5 text-xs font-medium ${selected ? 'text-indigo-400' : 'text-[var(--text-secondary)]'}`}>
                <opt.Icon size={13} aria-hidden="true" className="shrink-0" />
                {opt.label}
              </span>
              <span className="text-[10px] leading-snug text-[var(--text-hint)]">{opt.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NotesViewSettings() {
  const { language, notesViewDefault, setNotesViewDefault } = useAppStore(
    useShallow((s) => ({ language: s.language, notesViewDefault: s.notesViewDefault, setNotesViewDefault: s.setNotesViewDefault })),
  );
  return (
    <ViewChoice
      title={t(language, 'settings', 'notesViewDefault')}
      hint={t(language, 'settings', 'notesViewDefaultHint')}
      value={notesViewDefault}
      options={[
        { value: 'list', label: t(language, 'settings', 'notesViewOptionList'), desc: t(language, 'settings', 'notesViewOptionListDesc'), Icon: Rows3, preview: 'notes-list' },
        { value: 'tree', label: t(language, 'settings', 'notesViewOptionTree'), desc: t(language, 'settings', 'notesViewOptionTreeDesc'), Icon: FolderTree, preview: 'notes-tree' },
      ]}
      onChange={setNotesViewDefault}
    />
  );
}

/** NS22: con qué vista abre Tareas al iniciar la app. */
function TasksViewSettings() {
  const { language, tasksViewDefault, setTasksViewDefault } = useAppStore(
    useShallow((s) => ({ language: s.language, tasksViewDefault: s.tasksViewDefault, setTasksViewDefault: s.setTasksViewDefault })),
  );
  // Los mismos nombres e íconos que las vistas del menú lateral.
  const meta = {
    list: { label: t(language, 'sidebar', 'viewList'), desc: t(language, 'settings', 'tasksViewListDesc'), Icon: List, preview: 'tasks-list' },
    kanban: { label: t(language, 'sidebar', 'viewKanban'), desc: t(language, 'settings', 'tasksViewKanbanDesc'), Icon: Layout, preview: 'tasks-kanban' },
    calendar: { label: t(language, 'sidebar', 'viewCalendar'), desc: t(language, 'settings', 'tasksViewCalendarDesc'), Icon: Calendar, preview: 'tasks-calendar' },
  } as const;
  return (
    <ViewChoice
      title={t(language, 'settings', 'tasksViewDefault')}
      hint={t(language, 'settings', 'tasksViewDefaultHint')}
      value={tasksViewDefault}
      options={TASK_VIEW_MODES.map((value) => ({ value, ...meta[value] }))}
      onChange={setTasksViewDefault}
    />
  );
}
