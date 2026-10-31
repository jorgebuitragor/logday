// Opciones → General → Menú lateral (specs/navegacion-secciones NS1, NS9,
// NS20, design §6): el estilo de las secciones y su orden y visibilidad.
import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t, type SectionNavKey } from '../../lib/i18n';
import { interpolate } from '../../lib/interpolate';
import { ICON_BTN, SECONDARY_CLS } from '../shared/controlClasses';
import { Toggle } from '../shared/FormControls';
import type { SidebarStyle } from '../sidebar/sectionOrder';
import { useSectionActions, useSectionItems } from '../sidebar/sections';
import { SidebarStylePreview } from './SidebarStylePreview';

/** El bloque, para llevarlo a la vista desde "Ordenar secciones…". */
export const SIDEBAR_SETTINGS_ID = 'settings-sidebar';

const STYLES: { value: SidebarStyle; name: 'icons' | 'list'; desc: 'iconsDesc' | 'listDesc' }[] = [
  { value: 'icons', name: 'icons', desc: 'iconsDesc' },
  { value: 'list', name: 'list', desc: 'listDesc' },
];

/** El índice de la fila sobre la que está el puntero al arrastrar. */
function rowIndexAt(list: HTMLElement | null, clientY: number): number | null {
  if (!list) return null;
  const rows = [...list.querySelectorAll<HTMLElement>('[data-section-row]')];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return rows.length - 1;
}

export function SidebarSettings() {
  const { language, sidebarStyle, setSidebarStyle } = useAppStore(
    useShallow((s) => ({ language: s.language, sidebarStyle: s.sidebarStyle, setSidebarStyle: s.setSidebarStyle })),
  );
  const { items } = useSectionItems();
  const actions = useSectionActions(items);
  const tr = (key: SectionNavKey, vars?: Record<string, string | number>) =>
    interpolate(t(language, 'sectionNav', key), vars);

  // La miniatura de la que se elige corre una vez (NS20); la clave la
  // vuelve a montar para que la animación empiece de cero.
  const [played, setPlayed] = useState<{ style: SidebarStyle; n: number } | null>(null);
  const choose = (style: SidebarStyle) => {
    setPlayed((p) => ({ style, n: (p?.n ?? 0) + 1 }));
    void setSidebarStyle(style);
  };

  const [announcement, setAnnouncement] = useState('');
  const total = items.length;
  const move = (index: number, delta: -1 | 1) => {
    const item = items[index];
    actions.move(item.id, delta);
    setAnnouncement(tr('moved', { name: item.label, n: index + 1 + delta, total }));
  };

  // Arrastrar con el puntero, sin librería: al soltar, la sección va a la
  // fila sobre la que quedó.
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ id: string; from: number; over: number } | null>(null);
  const onGripDown = (e: React.PointerEvent<HTMLElement>, index: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: items[index].id, from: index, over: index });
  };
  const onGripMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const over = rowIndexAt(listRef.current, e.clientY);
    if (over !== null && over !== drag.over) setDrag({ ...drag, over });
  };
  const onGripUp = () => {
    if (!drag) return;
    const item = items[drag.from];
    if (item && drag.over !== drag.from) {
      actions.moveTo(item.id, drag.over);
      setAnnouncement(tr('moved', { name: item.label, n: drag.over + 1, total }));
    }
    setDrag(null);
  };

  return (
    <div id={SIDEBAR_SETTINGS_ID} className="scroll-mt-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
        {t(language, 'settings', 'sidebarSection')}
      </p>

      {/* Estilo: radios nativos dentro de las tarjetas, para tener las
          flechas, el anuncio y el foco del navegador (design §6.1). */}
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-[var(--text-secondary)]">{tr('style')}</legend>
        <div className="grid grid-cols-2 gap-3">
          {STYLES.map(({ value, name, desc }) => {
            const selected = sidebarStyle === value;
            return (
              <label
                key={value}
                className={`sbp-card flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${
                  selected
                    ? 'border-indigo-500/60 bg-indigo-500/10'
                    : 'border-[var(--border-card)] bg-[var(--bg-surface)] hover:border-[var(--border-high)]'
                }`}
              >
                <input
                  type="radio"
                  name="sidebar-style"
                  value={value}
                  checked={selected}
                  onChange={() => choose(value)}
                  className="sr-only"
                />
                <SidebarStylePreview
                  key={played?.style === value ? played.n : 0}
                  variant={value}
                  play={played?.style === value}
                />
                <span className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-medium ${selected ? 'text-indigo-400' : 'text-[var(--text-secondary)]'}`}>{tr(name)}</span>
                  <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${selected ? 'bg-indigo-400' : 'bg-transparent'}`} />
                </span>
                <span className="text-[10px] leading-snug text-[var(--text-hint)]">{tr(desc)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Secciones del menú (NS9, design §6.2). */}
      <div className="mt-5">
        <p className="text-xs font-medium text-[var(--text-secondary)]">{tr('sections')}</p>
        <p className="mb-2 mt-0.5 text-[10px] text-[var(--text-hint)]">{tr('sectionsDesc')}</p>
        <ul
          ref={listRef}
          className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] divide-y divide-[var(--border)]"
        >
          {items.map((item, index) => {
            const isDragged = drag?.id === item.id;
            const isTarget = drag !== null && !isDragged && drag.over === index;
            return (
              <li
                key={item.id}
                data-section-row
                className={`flex min-h-9 items-center gap-2 px-2 py-1 text-xs ${isDragged ? 'opacity-50' : ''} ${
                  isTarget ? (drag.over < drag.from ? 'shadow-[inset_0_2px_0_var(--accent)]' : 'shadow-[inset_0_-2px_0_var(--accent)]') : ''
                }`}
              >
                <span
                  title={tr('drag', { name: item.label })}
                  aria-hidden
                  onPointerDown={(e) => onGripDown(e, index)}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onPointerCancel={() => setDrag(null)}
                  className="flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-[var(--text-hint)] active:cursor-grabbing"
                >
                  <GripVertical size={14} />
                </span>
                <item.Icon size={14} className="shrink-0 text-[var(--text-muted)]" />
                <span className={`min-w-0 flex-1 truncate ${item.hidden ? 'text-[var(--text-hint)]' : 'text-[var(--text-secondary)]'}`}>{item.label}</span>
                <button
                  type="button"
                  className={ICON_BTN}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={tr('moveUpNamed', { name: item.label })}
                  title={tr('moveUp')}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className={ICON_BTN}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
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
