import type { LucideIcon } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useExtensions } from '../../extensions/useExtensions';
import { ExtensionSlot } from '../../extensions/ExtensionSlot';
import { extensionSection } from '../../extensions/state';
import { extensionText } from '../../extensions/text';
import type { ExtensionSection } from '../../extensions/types';

export interface ExtensionSectionItem {
  id: ExtensionSection;
  Icon: LucideIcon;
  label: string;
}

/** Las secciones de las extensiones activas con vista propia, en el orden
 *  del registro (specs/extensiones R11). `useSectionItems` las suma a las
 *  fijas, en el orden del usuario (specs/navegacion-secciones NS7). */
export function useExtensionSectionItems(): ExtensionSectionItem[] {
  const language = useAppStore((s) => s.language);
  return useExtensions()
    .enabled.filter((def) => def.view)
    .map((def) => ({ id: extensionSection(def.id), Icon: def.icon, label: extensionText(language, def.id, 'name') }));
}

/** El estado de las extensiones activas que lo tienen (R26), abajo y
 *  encima de "Opciones" (en el colapsado, encima de Buscar). Se carga y se
 *  aísla como cualquier punto de extensión (R15, R16); si una no tiene
 *  nada que mostrar, devuelve `null` y no ocupa sitio. */
export function SidebarStatusSlots({ collapsed }: { collapsed: boolean }) {
  const defs = useExtensions().enabled.filter((def) => def.sidebarStatus);
  if (defs.length === 0) return null;
  return (
    <>
      {defs.map((def) => (
        <ExtensionSlot key={def.id} id={def.id} point="SidebarStatus" props={{ collapsed }} variant="inline" />
      ))}
    </>
  );
}
