import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { Language } from '../../types/common';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';

// Hoja de atajos y de la sintaxis de la captura rápida (tecla `?` en la
// lista). Antes solo había una pista de 3 atajos al pie de la lista y la
// sintaxis #/@/fecha solo se veía con el campo enfocado.
//
// El contenido es una tabla por idioma y no claves sueltas de i18n: son
// pares tecla/descripción que solo tienen sentido juntos.

type Row = [keys: string, what: string];
type Section = { title: string; rows: Row[] };

const SHEET: Record<Language, Section[]> = {
  es: [
    {
      title: 'Lista',
      rows: [
        ['↑ ↓  ·  j k', 'Moverse entre tareas'],
        ['Enter', 'Abrir la tarea'],
        ['x  ·  Espacio', 'Completar o reabrir'],
        ['t  ·  m  ·  w', 'Vence hoy, mañana o en una semana'],
        ['0', 'Quitar la fecha'],
        ['d', 'Elegir la fecha en un calendario'],
        ['n', 'Ir a la captura rápida'],
        ['⌘ clic  ·  ⇧ clic', 'Seleccionar varias (los atajos actúan sobre todas)'],
        ['Esc', 'Soltar la selección o cerrar el panel'],
        ['?', 'Esta hoja'],
      ],
    },
    {
      title: 'Captura rápida',
      rows: [
        ['#proyecto', 'Proyecto (sugiere los que existen)'],
        ['@tag', 'Tag (sugiere los que existen)'],
        ['… mañana', 'Fecha al final: hoy, mañana, pasado mañana, viernes, 15/11'],
        ['2026-11-15', 'Fecha completa, en cualquier lugar'],
        ['Tab', 'Completar la sugerencia'],
        ['⌘ Enter', 'Pasar a la ventana con todos los campos'],
      ],
    },
    {
      title: 'Otras vistas',
      rows: [
        ['Arrastrar', 'Calendario: mover una tarea a otro día'],
        ['Arrastrar', 'Kanban: cambiar el estado'],
        ['Clic derecho', 'Menú de la tarea: fecha, estado, proyecto, duplicar'],
      ],
    },
  ],
  en: [
    {
      title: 'List',
      rows: [
        ['↑ ↓  ·  j k', 'Move between tasks'],
        ['Enter', 'Open the task'],
        ['x  ·  Space', 'Complete or reopen'],
        ['t  ·  m  ·  w', 'Due today, tomorrow or in a week'],
        ['0', 'Remove the date'],
        ['d', 'Pick the date on a calendar'],
        ['n', 'Go to quick add'],
        ['⌘ click  ·  ⇧ click', 'Select several (shortcuts apply to all)'],
        ['Esc', 'Clear the selection or close the panel'],
        ['?', 'This sheet'],
      ],
    },
    {
      title: 'Quick add',
      rows: [
        ['#project', 'Project (suggests existing ones)'],
        ['@tag', 'Tag (suggests existing ones)'],
        ['… tomorrow', 'Date at the end: today, tomorrow, friday, 15/11'],
        ['2026-11-15', 'Full date, anywhere'],
        ['Tab', 'Complete the suggestion'],
        ['⌘ Enter', 'Open the window with all fields'],
      ],
    },
    {
      title: 'Other views',
      rows: [
        ['Drag', 'Calendar: move a task to another day'],
        ['Drag', 'Kanban: change the status'],
        ['Right click', 'Task menu: date, status, project, duplicate'],
      ],
    },
  ],
};

const TITLE: Record<Language, string> = { es: 'Atajos y captura rápida', en: 'Shortcuts and quick add' };
const CLOSE: Record<Language, string> = { es: 'Cerrar', en: 'Close' };

export function TaskShortcutsSheet({ onClose }: { onClose: () => void }) {
  const language = useAppStore((s) => s.language);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <ModalOverlay onClose={onClose} className="animate-fade-in">
      <ModalPanel className="modal-spring-in w-[560px] max-w-[92vw] rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div role="dialog" aria-modal="true" aria-label={TITLE[language]}>
          <div className="mb-4 flex items-center gap-2">
            <Keyboard size={15} className="text-indigo-400" />
            <h2 className="flex-1 text-sm font-semibold text-[var(--text-primary)]">{TITLE[language]}</h2>
            <button onClick={onClose} aria-label={CLOSE[language]} className="rounded-lg p-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto">
            {SHEET[language].map((section) => (
              <section key={section.title}>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-hint)]">{section.title}</h3>
                <dl className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-4 gap-y-1.5 text-xs">
                  {section.rows.map(([keys, what], i) => (
                    <div key={i} className="contents">
                      <dt className="font-mono text-[11px] text-indigo-400">{keys}</dt>
                      <dd className="text-[var(--text-secondary)]">{what}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
