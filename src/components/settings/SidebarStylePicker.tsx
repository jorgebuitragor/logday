// El selector del estilo de las secciones del menú (specs/navegacion-secciones
// NS1, NS20, design §6.1): dos tarjetas con miniatura animada. Va aparte de
// `SidebarSettings` porque lo usan Opciones → Navegación y la bienvenida.
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import type { SidebarStyle } from '../sidebar/sectionOrder';
import { SidebarStylePreview } from './SidebarStylePreview';

const STYLES: { value: SidebarStyle; name: 'icons' | 'list'; desc: 'iconsDesc' | 'listDesc' }[] = [
  { value: 'icons', name: 'icons', desc: 'iconsDesc' },
  { value: 'list', name: 'list', desc: 'listDesc' },
];

export function SidebarStylePicker() {
  const { language, sidebarStyle, setSidebarStyle } = useAppStore(
    useShallow((s) => ({ language: s.language, sidebarStyle: s.sidebarStyle, setSidebarStyle: s.setSidebarStyle })),
  );

  // La miniatura de la que se elige corre una vez (NS20); la clave la
  // vuelve a montar para que la animación empiece de cero.
  const [played, setPlayed] = useState<{ style: SidebarStyle; n: number } | null>(null);
  const choose = (style: SidebarStyle) => {
    setPlayed((p) => ({ style, n: (p?.n ?? 0) + 1 }));
    void setSidebarStyle(style);
  };

  // Radios nativos dentro de las tarjetas, para tener las flechas, el
  // anuncio y el foco del navegador (design §6.1).
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-[var(--text-secondary)]">{t(language, 'sectionNav', 'style')}</legend>
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
                <span className={`text-xs font-medium ${selected ? 'text-indigo-400' : 'text-[var(--text-secondary)]'}`}>
                  {t(language, 'sectionNav', name)}
                </span>
                <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${selected ? 'bg-indigo-400' : 'bg-transparent'}`} />
              </span>
              <span className="text-[10px] leading-snug text-[var(--text-hint)]">{t(language, 'sectionNav', desc)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
