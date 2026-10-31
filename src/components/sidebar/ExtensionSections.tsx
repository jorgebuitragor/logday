import { useShallow } from 'zustand/react/shallow';
import type { LucideIcon } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useExtensions } from '../../extensions/useExtensions';
import { extensionSection } from '../../extensions/state';
import { extensionText } from '../../extensions/text';
import type { ExtensionSection } from '../../extensions/types';

export interface ExtensionSectionItem {
  id: ExtensionSection;
  Icon: LucideIcon;
  label: string;
}

/** Las secciones de las extensiones activas con vista propia, en el orden
 *  del registro (specs/extensiones R11). El menú expandido las pone en la
 *  misma fila que las secciones fijas, después de ellas. */
export function useExtensionSectionItems(): ExtensionSectionItem[] {
  const language = useAppStore((s) => s.language);
  return useExtensions()
    .enabled.filter((def) => def.view)
    .map((def) => ({ id: extensionSection(def.id), Icon: def.icon, label: extensionText(language, def.id, 'name') }));
}

/** Las mismas secciones en el menú colapsado: debajo de los íconos de las
 *  fijas, tras una separadora. Sin ninguna, no se dibuja nada. */
export function CollapsedExtensionSections() {
  const { activeSection, setSection } = useAppStore(
    useShallow((s) => ({ activeSection: s.activeSection, setSection: s.setSection })),
  );
  const items = useExtensionSectionItems();
  if (items.length === 0) return null;
  return (
    <>
      <div className="my-1 h-px w-6 bg-[var(--border)]" />
      {items.map(({ id, Icon, label }) => {
        const isActive = activeSection === id;
        return (
          <button
            key={id}
            onClick={() => void setSection(id)}
            title={label}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={`rounded-lg p-2 transition ${
              isActive
                ? 'text-indigo-400 bg-indigo-500/10'
                : 'text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </>
  );
}
