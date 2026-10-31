// El menú de secciones (specs/navegacion-secciones NS1-NS18): la Barra de
// íconos, la Lista con nombres y el colapsado salen de aquí, con la misma
// lista (`useSectionItems`), el mismo teclado, "Más" y clic derecho.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { interpolate } from '../../lib/interpolate';
import type { AnchorRect } from '../../lib/menuPosition';
import { FOCUS_RING } from '../shared/controlClasses';
import {
  ICON_GAP_PX, iconCapacity, listCapacity, nextRovingIndex, separatorIndex, shortcutLabel, splitSections,
} from './sectionOrder';
import { IS_MAC, LogoMark, useSectionActions, useSectionItems, type SectionItem } from './sections';
import {
  NavTooltip, SectionContextMenu, SectionMoreMenu, moreMenuAnchor, useNavTooltip, type SectionCtx,
} from './SectionMenus';

export type SectionNavVariant = 'icons' | 'list';

interface SectionNavProps {
  variant: SectionNavVariant;
  /** El menú colapsado: la columna de íconos sola (NS4). */
  collapsed?: boolean;
  /** Lo que va debajo de las secciones en la columna, dentro de su scroll
   *  (las vistas de Tareas en el colapsado). */
  after?: ReactNode;
  /** Solo para las pruebas: cuántos lugares hay, sin medir. */
  initialCapacity?: number;
}

const MORE_KEY = '__more__';

const ICON_BTN_BASE = `relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${FOCUS_RING}`;
const ICON_ACTIVE = 'bg-indigo-500/15 text-indigo-400';
const ICON_IDLE = 'text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]';
const ROW_BASE = `group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition ${FOCUS_RING}`;
const ROW_ACTIVE = 'bg-indigo-500/15 font-medium text-indigo-400';
const ROW_IDLE = 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]';

export function SectionNav({ variant, collapsed = false, after, initialCapacity = Infinity }: SectionNavProps) {
  const { language, activeSection, setSection, openSidebarSettings } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      activeSection: s.activeSection,
      setSection: s.setSection,
      openSidebarSettings: s.openSidebarSettings,
    })),
  );
  const { home, items } = useSectionItems();
  const actions = useSectionActions(items);
  const isColumn = variant === 'icons' || collapsed;
  const visible = items.filter((i) => !i.hidden);
  const wantsSeparator = separatorIndex(visible.map((i) => i.isExtension)) > 0;

  // ── Lo que cabe (NS12) ──
  const [capacity, setCapacity] = useState(initialCapacity);
  const navRef = useRef<HTMLElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measure = () => {
      if (isColumn) {
        const region = regionRef.current;
        if (!region) return;
        const afterH = afterRef.current ? afterRef.current.offsetHeight + ICON_GAP_PX : 0;
        setCapacity(iconCapacity(region.clientHeight - afterH, wantsSeparator));
      } else {
        const menu = navRef.current?.parentElement;
        if (menu) setCapacity(listCapacity(menu.clientHeight, wantsSeparator));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    const targets = isColumn ? [regionRef.current, afterRef.current] : [navRef.current?.parentElement];
    for (const el of targets) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [isColumn, wantsSeparator, Boolean(after)]); // eslint-disable-line react-hooks/exhaustive-deps

  const { shown, more } = splitSections(items, capacity);
  const sep = separatorIndex(shown.map((i) => i.isExtension));
  const activeInMore = more.find((i) => i.id === activeSection);

  // ── Roving tabindex (NS14) ──
  const keys = [home.id, ...shown.map((i) => i.id), ...(more.length ? [MORE_KEY] : [])];
  const defaultKey = activeInMore ? MORE_KEY : keys.includes(activeSection) ? activeSection : home.id;
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const rovingKey = focusKey && keys.includes(focusKey) ? focusKey : defaultKey;
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const tooltip = useNavTooltip(isColumn);

  const onNavKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') tooltip.hide();
    const key = (e.target as HTMLElement).closest<HTMLElement>('[data-nav-key]')?.dataset.navKey;
    if (!key) return;
    const next = nextRovingIndex(e.key, keys.indexOf(key), keys.length);
    if (next === null) return;
    // ↓ en "Más", que es el último, abre su menú (NS18).
    if (key === MORE_KEY && e.key === 'ArrowDown') return;
    e.preventDefault();
    setFocusKey(keys[next]);
    btnRefs.current[keys[next]]?.focus();
  };

  // ── "Más" (NS12, NS13, NS18) ──
  const [moreAnchor, setMoreAnchor] = useState<AnchorRect | null>(null);
  const openMore = () => {
    const el = btnRefs.current[MORE_KEY];
    if (!el) return;
    tooltip.hide();
    setMoreAnchor(moreMenuAnchor(el.getBoundingClientRect(), variant === 'list' && !collapsed ? 'list' : 'icons'));
  };
  const closeMore = (returnFocus: boolean) => {
    setMoreAnchor(null);
    if (returnFocus) btnRefs.current[MORE_KEY]?.focus();
  };
  // Si "Más" desaparece (ya cabe todo), se cierra su menú.
  useEffect(() => {
    if (more.length === 0 && moreAnchor) setMoreAnchor(null);
  }, [more.length, moreAnchor]);

  // ── Clic derecho (NS10) ──
  const [ctx, setCtx] = useState<SectionCtx | null>(null);
  const openCtx = (e: React.MouseEvent, item: SectionItem) => {
    e.preventDefault();
    e.stopPropagation();
    tooltip.hide();
    const group = items.filter((i) => i.hidden === item.hidden);
    const idx = group.findIndex((i) => i.id === item.id);
    setCtx({ item, x: e.clientX, y: e.clientY, canUp: idx > 0, canDown: idx < group.length - 1 });
  };

  const go = (id: SectionItem['id']) => {
    setFocusKey(id === home.id || shown.some((i) => i.id === id) ? id : MORE_KEY);
    void setSection(id);
  };

  const refFor = (key: string) => (el: HTMLButtonElement | null) => { btnRefs.current[key] = el; };
  const navProps = (key: string) => ({
    'data-nav-key': key,
    tabIndex: rovingKey === key ? 0 : -1,
    onFocus: () => setFocusKey(key),
  });

  // Un botón de la columna o una fila de la Lista.
  const renderItem = (item: SectionItem, isHome = false) => {
    const isActive = activeSection === item.id;
    const tipBind = tooltip.bind(item);
    const nav = navProps(item.id);
    const common = {
      ref: refFor(item.id),
      type: 'button' as const,
      ...nav,
      'aria-current': isActive ? ('page' as const) : undefined,
      onClick: () => go(item.id),
      onContextMenu: isHome ? undefined : (e: React.MouseEvent) => openCtx(e, item),
    };
    if (isColumn) {
      return (
        <button
          key={item.id}
          {...common}
          {...tipBind}
          onFocus={(e) => { nav.onFocus(); tipBind.onFocus?.(e); }}
          aria-label={item.label}
          className={`${ICON_BTN_BASE} ${isActive ? ICON_ACTIVE : ICON_IDLE}`}
        >
          {isActive && <span aria-hidden className={`absolute ${collapsed ? '-left-1.5' : '-left-1'} h-5 w-0.5 rounded-r bg-[var(--accent)]`} />}
          {isHome ? <LogoMark size={18} /> : <item.Icon size={18} />}
        </button>
      );
    }
    return (
      <button key={item.id} {...common} className={`${ROW_BASE} ${isActive ? ROW_ACTIVE : ROW_IDLE}`}>
        <item.Icon size={14} className="shrink-0" />
        <span className="min-w-0 truncate">{item.label}</span>
        {item.shortcut && (
          <span className="ml-auto pl-2 text-[10px] font-normal text-[var(--text-hint)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {shortcutLabel(item.shortcut, IS_MAC)}
          </span>
        )}
      </button>
    );
  };

  const separator = (key: string) => (
    <div key={key} aria-hidden className={isColumn ? 'my-1 h-px w-6 shrink-0 bg-[var(--border)]' : 'mx-2 my-1 h-px bg-[var(--border)]'} />
  );

  const moreLabel = activeInMore
    ? interpolate(t(language, 'sectionNav', 'moreActive'), { name: activeInMore.label })
    : t(language, 'sectionNav', 'moreLabel');
  const moreTip = isColumn ? tooltip.bind({ id: MORE_KEY, label: moreLabel }) : {};
  const moreNav = navProps(MORE_KEY);
  const moreButton = more.length > 0 && (
    <button
      ref={refFor(MORE_KEY)}
      type="button"
      {...moreNav}
      {...moreTip}
      onFocus={(e) => { moreNav.onFocus(); moreTip.onFocus?.(e); }}
      aria-haspopup="menu"
      aria-expanded={moreAnchor !== null}
      aria-label={isColumn ? moreLabel : `${interpolate(t(language, 'sectionNav', 'moreCount'), { n: more.length })}${activeInMore ? `: ${activeInMore.label}` : ''}`}
      // Que el clic que lo cierra no lo vuelva a abrir (el menú se cierra
      // con cualquier clic fuera de él).
      onMouseDown={(e) => { if (moreAnchor) e.stopPropagation(); }}
      onClick={() => (moreAnchor ? closeMore(false) : openMore())}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' && !moreAnchor) {
          e.preventDefault();
          openMore();
        }
      }}
      className={
        isColumn
          ? `${ICON_BTN_BASE} ${activeInMore ? ICON_ACTIVE : ICON_IDLE}`
          : `${ROW_BASE} ${activeInMore ? ROW_ACTIVE : ROW_IDLE}`
      }
    >
      {isColumn && activeInMore && <span aria-hidden className={`absolute ${collapsed ? '-left-1.5' : '-left-1'} h-5 w-0.5 rounded-r bg-[var(--accent)]`} />}
      <MoreHorizontal size={isColumn ? 18 : 14} className="shrink-0" />
      {!isColumn && <span className="truncate">{interpolate(t(language, 'sectionNav', 'moreCount'), { n: more.length })}</span>}
    </button>
  );

  const sectionButtons = shown.map((item, i) => (
    <Fragment key={item.id}>
      {i === sep && separator(`sep-${item.id}`)}
      {renderItem(item)}
    </Fragment>
  ));

  const floating = (
    <>
      <NavTooltip tip={tooltip.tip} />
      <SectionMoreMenu
        anchor={moreAnchor}
        items={more}
        activeSection={activeSection}
        language={language}
        onSelect={(id) => { closeMore(false); go(id); }}
        onClose={closeMore}
        onItemContextMenu={openCtx}
        onArrange={() => { closeMore(false); openSidebarSettings(); }}
      />
      <SectionContextMenu
        ctx={ctx}
        language={language}
        onClose={() => setCtx(null)}
        onToggleHidden={(item) => actions.setHidden(item.id, !item.hidden)}
        onMove={(item, delta) => actions.move(item.id, delta, items.filter((i) => i.hidden === item.hidden).map((i) => i.id))}
      />
    </>
  );

  if (isColumn) {
    return (
      <nav
        ref={navRef}
        aria-label={t(language, 'sectionNav', 'nav')}
        onKeyDown={onNavKeyDown}
        className="flex min-h-0 w-full flex-1 flex-col items-center"
      >
        <div className={collapsed ? 'flex w-full shrink-0 justify-center' : 'flex h-11 w-full shrink-0 items-center justify-center border-b border-[var(--border)]'}>
          {renderItem(home, true)}
        </div>
        <div
          ref={regionRef}
          className="mt-2 flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none]"
        >
          {sectionButtons}
          {moreButton}
          {after && <div ref={afterRef} className="flex w-full shrink-0 flex-col items-center gap-1">{after}</div>}
        </div>
        {floating}
      </nav>
    );
  }

  return (
    <nav
      ref={navRef}
      aria-label={t(language, 'sectionNav', 'nav')}
      onKeyDown={onNavKeyDown}
      className="shrink-0 space-y-0.5 overflow-hidden border-b border-[var(--border)] px-2 py-2"
      style={{ maxHeight: '40%' }}
    >
      {renderItem(home, true)}
      {sectionButtons}
      {moreButton}
      {floating}
    </nav>
  );
}
