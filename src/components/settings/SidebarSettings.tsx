// Opciones → Navegación → Menú lateral (specs/navegacion-secciones NS1, NS9,
// NS20, design §6): el estilo de las secciones y su orden y visibilidad.
import { useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t, type SectionNavKey } from '../../lib/i18n';
import { interpolate } from '../../lib/interpolate';
import { ICON_BTN, SECONDARY_CLS, SOFT_DISABLED } from '../shared/controlClasses';
import { useRowDrag } from '../shared/useRowDrag';
import { Toggle } from '../shared/FormControls';
import { useSectionActions, useSectionItems } from '../sidebar/sections';
import { SidebarStylePicker } from './SidebarStylePicker';

export function SidebarSettings() {
  const language = useAppStore((s) => s.language);
  const { items } = useSectionItems();
  const actions = useSectionActions(items);
  const tr = (key: SectionNavKey, vars?: Record<string, string | number>) =>
    interpolate(t(language, 'sectionNav', key), vars);

  const [announcement, setAnnouncement] = useState('');
  const total = items.length;
  const move = (index: number, delta: -1 | 1) => {
    const item = items[index];
    actions.move(item.id, delta);
    setAnnouncement(tr('moved', { name: item.label, n: index + 1 + delta, total }));
  };

  // Arrastrar con el puntero, sin librería: al soltar, la sección va a la
  // fila sobre la que quedó.
  const { listRef, gripProps, rowClass } = useRowDrag<HTMLUListElement>('[data-section-row]', (id, to) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    actions.moveTo(item.id, to);
    setAnnouncement(tr('moved', { name: item.label, n: to + 1, total }));
  });

  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
        {t(language, 'settings', 'sidebarSection')}
      </p>

      <SidebarStylePicker />

      {/* Secciones del menú (NS9, design §6.2). */}
      <div className="mt-5">
        <p className="text-xs font-medium text-[var(--text-secondary)]">{tr('sections')}</p>
        <p className="mb-2 mt-0.5 text-[10px] text-[var(--text-hint)]">{tr('sectionsDesc')}</p>
        <ul
          ref={listRef}
          className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] divide-y divide-[var(--border)]"
        >
          {items.map((item, index) => {
            const first = index === 0;
            const last = index === items.length - 1;
            return (
              <li
                key={item.id}
                data-section-row
                className={`flex min-h-9 items-center gap-2 px-2 py-1 text-xs ${rowClass(index, item.id)}`}
              >
                <span
                  title={tr('drag', { name: item.label })}
                  aria-hidden
                  {...gripProps(index, item.id)}
                  className="flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-[var(--text-hint)] active:cursor-grabbing"
                >
                  <GripVertical size={14} />
                </span>
                <item.Icon size={14} className="shrink-0 text-[var(--text-muted)]" />
                <span className={`min-w-0 flex-1 truncate ${item.hidden ? 'text-[var(--text-hint)]' : 'text-[var(--text-secondary)]'}`}>{item.label}</span>
                {/* aria-disabled y no disabled: el botón que se mueve al
                    extremo conserva el foco (design §G.3 de specs/devtools). */}
                <button
                  type="button"
                  className={`${ICON_BTN} ${SOFT_DISABLED}`}
                  aria-disabled={first || undefined}
                  onClick={() => !first && move(index, -1)}
                  aria-label={tr('moveUpNamed', { name: item.label })}
                  title={tr('moveUp')}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className={`${ICON_BTN} ${SOFT_DISABLED}`}
                  aria-disabled={last || undefined}
                  onClick={() => !last && move(index, 1)}
                  aria-label={tr('moveDownNamed', { name: item.label })}
                  title={tr('moveDown')}
                >
                  <ChevronDown size={14} />
                </button>
                <span className="ml-1 shrink-0">
                  <Toggle
                    label={tr('show')}
                    srSuffix={item.label}
                    checked={!item.hidden}
                    onChange={(show) => {
                      actions.setHidden(item.id, !show);
                      setAnnouncement(tr(show ? 'shownNow' : 'hiddenNow', { name: item.label }));
                    }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className={SECONDARY_CLS}
            onClick={() => {
              actions.reset();
              setAnnouncement(tr('resetDone'));
            }}
          >
            <RotateCcw size={12} />
            {tr('reset')}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">{announcement}</p>
      </div>
    </div>
  );
}
