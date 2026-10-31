// Opciones → Navegación (specs/navegacion-secciones NS21): cómo se recorre
// la app. El menú lateral, la pantalla de inicio y las vistas con que abren
// Notas y Tareas; antes estaban repartidos entre General y Preferencias.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { TASK_VIEW_MODES } from '../../lib/viewDefaults';
import type { StartupScreen } from '../../types/config';
import { useExtensions } from '../../extensions/useExtensions';
import { extensionSection } from '../../extensions/state';
import { extensionText } from '../../extensions/text';
import { SidebarSettings } from './SidebarSettings';

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
function ViewChoice<V extends string>({ title, hint, value, options, onChange }: {
  title: string;
  hint: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (value: V) => void;
}) {
  return (
    <div role="group" aria-label={title}>
      <p className="mb-1 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">{title}</p>
      <p className="mb-3 text-[11px] text-[var(--text-hint)]">{hint}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition ${
              value === opt.value
                ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-400'
                : 'border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
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
        { value: 'list', label: t(language, 'settings', 'notesViewOptionList') },
        { value: 'tree', label: t(language, 'settings', 'notesViewOptionTree') },
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
  // Los mismos nombres que las vistas del menú lateral.
  const labels = {
    list: t(language, 'sidebar', 'viewList'),
    kanban: t(language, 'sidebar', 'viewKanban'),
    calendar: t(language, 'sidebar', 'viewCalendar'),
  } as const;
  return (
    <ViewChoice
      title={t(language, 'settings', 'tasksViewDefault')}
      hint={t(language, 'settings', 'tasksViewDefaultHint')}
      value={tasksViewDefault}
      options={TASK_VIEW_MODES.map((value) => ({ value, label: labels[value] }))}
      onChange={setTasksViewDefault}
    />
  );
}
