// Las escenas de "Cómo funciona" (specs/onboarding OB12, OB15): las usan el
// paso 4 de la bienvenida y el modal de Acerca de. Dibuja la escena actual
// (título, texto y puntos); los botones para moverse son de quien la usa.
import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { interpolate } from '../../lib/interpolate';
import { useSectionItems, IS_MAC } from '../sidebar/sections';
import { KeyedText } from './KeyedText';
import { TOUR_SCENES, tourKeys, type TourKeys } from './scenes';

/** OB14: las teclas del texto, con la config y el orden del menú actuales. */
export function useTourKeys(): TourKeys {
  const shortcuts = useAppStore((s) => s.shortcuts);
  const { items } = useSectionItems();
  const digits = items.flatMap((i) => (i.shortcut ? [i.shortcut] : [])).sort();
  return tourKeys(shortcuts, digits, IS_MAC);
}

export function TourScenes({ scene }: { scene: number }) {
  const language = useAppStore((s) => s.language);
  const keys = useTourKeys();
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const current = TOUR_SCENES[scene] ?? TOUR_SCENES[0];
  const total = TOUR_SCENES.length;

  // OB17: el foco va al título de la escena al mostrarla.
  useEffect(() => {
    titleRef.current?.focus();
  }, [scene]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 ref={titleRef} tabIndex={-1} className="text-sm font-semibold text-[var(--text-primary)] outline-none">
          {t(language, 'tour', current.title)}
        </h2>
        <span aria-hidden="true" className="shrink-0 text-[10px] text-[var(--text-hint)]">
          {interpolate(t(language, 'tour', 'sceneCount'), { n: scene + 1, total })}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {current.lines.map((line) => (
          <li key={line} className="flex gap-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--text-hint)]" />
            <span><KeyedText text={t(language, 'tour', line)} keys={keys[line]} /></span>
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="mt-4 flex justify-center gap-1.5">
        {TOUR_SCENES.map((s, i) => (
          <span key={s.id} className={`h-1.5 w-1.5 rounded-full ${i === scene ? 'bg-[var(--accent)]' : 'bg-[var(--border-high)]'}`} />
        ))}
      </div>
    </div>
  );
}
