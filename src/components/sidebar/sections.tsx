// Una sola lista de secciones del menú (specs/navegacion-secciones, design
// Arquitectura): de aquí salen la Barra de íconos, la Lista, el colapsado,
// "Más", los atajos ⌘0…⌘9, "Ir a…" en Buscar y la lista de Opciones.
import { useMemo } from 'react';
import { CalendarDays, CheckSquare, House, Notebook, Timer } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import type { ActiveSection } from '../../types/config';
import type { Language } from '../../types/common';
import { useExtensionSectionItems } from './ExtensionSections';
import {
  resolveSections, shortcutFor, shortcutOrder, moveSection, moveSectionTo, setSectionHidden, CORE_SECTION_IDS,
} from './sectionOrder';

export type SectionIcon = React.ComponentType<{ size?: number; className?: string }>;

export interface SectionItem {
  id: ActiveSection;
  Icon: SectionIcon;
  label: string;
  /** El dígito de ⌘<n>, si tiene (NS15). */
  shortcut?: string;
  /** Oculta en "Más" (NS11). */
  hidden: boolean;
  isExtension: boolean;
}

/** El logo de Logday, que en la Barra de íconos es el botón de Inicio (NS6). */
export function LogoMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="64" height="64" rx="15" fill="var(--accent)" />
      <path d="M19 13.5h19L47 21.5V48.5a2 2 0 0 1-2 2H19a2 2 0 0 1-2-2V15.5a2 2 0 0 1 2-2z" fill="#ffffff" />
      <path d="M38 13.5L47 21.5h-9z" fill="var(--accent)" fillOpacity={0.24} />
      <path d="M20 36h4l3-8.5 4.5 13L44 25" fill="none" stroke="var(--accent)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CORE_ICONS: Record<(typeof CORE_SECTION_IDS)[number], SectionIcon> = {
  dailys: CalendarDays,
  tasks: CheckSquare,
  notes: Notebook,
  overtime: Timer,
};

/** El nombre de una sección fija. Horas extra, con su nombre largo (NS8). */
function coreLabel(language: Language, id: (typeof CORE_SECTION_IDS)[number]): string {
  return id === 'overtime' ? t(language, 'sectionNav', 'overtime') : t(language, 'sidebar', id);
}

export function homeItem(language: Language): SectionItem {
  // En la Lista, "Más" y Buscar, Inicio usa una casa; en la Barra de íconos,
  // el logo (NS6).
  return { id: 'dashboard', Icon: House, label: t(language, 'sectionNav', 'home'), shortcut: '0', hidden: false, isExtension: false };
}

/** Las secciones (sin Inicio), en el orden del usuario y con su atajo. */
export function useSectionItems(): { home: SectionItem; items: SectionItem[] } {
  const { language, saved } = useAppStore(useShallow((s) => ({ language: s.language, saved: s.sidebarSections })));
  const extensionItems = useExtensionSectionItems();
  const extKey = extensionItems.map((e) => `${e.id}:${e.label}`).join('|');
  return useMemo(() => {
    const byId = new Map<string, Omit<SectionItem, 'hidden' | 'shortcut'>>();
    for (const id of CORE_SECTION_IDS) byId.set(id, { id, Icon: CORE_ICONS[id], label: coreLabel(language, id), isExtension: false });
    for (const ext of extensionItems) byId.set(ext.id, { id: ext.id, Icon: ext.Icon, label: ext.label, isExtension: true });
    const resolved = resolveSections(saved, [...byId.keys()]);
    const order = shortcutOrder(resolved);
    const items = resolved.map((s) => ({
      ...byId.get(s.id)!,
      hidden: s.hidden,
      shortcut: shortcutFor(order.indexOf(s.id)),
    }));
    return { home: homeItem(language), items };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, saved, extKey]);
}

/** Mover, ocultar y restablecer (NS9, NS10). Leen lo guardado al
 *  llamarlas, no al dibujar, para no pisar un cambio reciente. Las
 *  disponibles van en el orden efectivo: para `sectionOrder` es lo mismo
 *  que el orden por defecto, porque las que faltan se agregan al final. */
export function useSectionActions(items: readonly SectionItem[]) {
  const setSidebarSections = useAppStore((s) => s.setSidebarSections);
  const ids = items.map((i) => i.id);
  const saved = () => useAppStore.getState().sidebarSections;
  return {
    setHidden: (id: string, hidden: boolean) => void setSidebarSections(setSectionHidden(saved(), ids, id, hidden)),
    move: (id: string, delta: -1 | 1, among?: readonly string[]) => void setSidebarSections(moveSection(saved(), ids, id, delta, among)),
    moveTo: (id: string, index: number) => void setSidebarSections(moveSectionTo(saved(), ids, id, index)),
    reset: () => void setSidebarSections(undefined),
  };
}

/** Si la app corre en macOS, para mostrar ⌘ o Ctrl. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
