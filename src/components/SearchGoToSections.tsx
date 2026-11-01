// "Ir a <sección>" en Buscar (specs/navegacion-secciones NS19): las
// secciones cuyo nombre contiene lo escrito, sin acentos ni mayúsculas,
// incluidas Inicio y las que están en "Más".
import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';
import { interpolate } from '../lib/interpolate';
import { matchesSectionQuery, shortcutLabel } from './sidebar/sectionOrder';
import { IS_MAC, useSectionItems, type SectionItem } from './sidebar/sections';

export function useSectionHits(query: string): SectionItem[] {
  const { home, items } = useSectionItems();
  return useMemo(() => [home, ...items].filter((item) => matchesSectionQuery(item.label, query)), [home, items, query]);
}

export function SearchGoToSections({ hits, onGo }: { hits: SectionItem[]; onGo: (id: SectionItem['id']) => void }) {
  const language = useAppStore((s) => s.language);
  if (hits.length === 0) return null;
  return (
    <>
      <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
        {t(language, 'sectionNav', 'goToGroup')}
      </p>
      <ul className="space-y-0.5">
        {hits.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => onGo(item.id)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <item.Icon size={13} className="shrink-0 text-indigo-400" />
              <span className="flex-1 truncate text-sm text-[var(--text-body)]">
                {interpolate(t(language, 'sectionNav', 'goTo'), { name: item.label })}
              </span>
              {item.shortcut && (
                <span className="text-[10px] text-[var(--text-hint)]">{shortcutLabel(item.shortcut, IS_MAC)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
