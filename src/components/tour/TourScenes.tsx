// Las escenas de "Cómo funciona" (specs/onboarding OB12, OB13, OB15): las
// usan el paso 4 de la bienvenida y el modal de Acerca de. Dibuja la escena
// actual (miniatura, título, texto y puntos); los botones para moverse son
// de quien la usa. Solo está montada la escena actual.
import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { interpolate } from '../../lib/interpolate';
import type { Language } from '../../types/common';
import type { Shortcuts } from '../../types/config';
import { shortcutLabel } from '../sidebar/sectionOrder';
import { homeItem, useSectionItems, IS_MAC, type SectionItem } from '../sidebar/sections';
import { ICON_BTN } from '../shared/controlClasses';
import { KeyedText } from './KeyedText';
import { frameRows } from './MiniFrame';
import { SceneMiniature, type MiniatureText } from './Miniatures';
import { TOUR_SCENES, tourKeys } from './scenes';

function shortcutDigits(items: readonly SectionItem[]): string[] {
  return items.flatMap((i) => (i.shortcut ? [i.shortcut] : [])).sort();
}

/** Lo que escriben las miniaturas, con las mismas teclas y nombres que la app. */
export function miniatureText(language: Language, shortcuts: Shortcuts, items: readonly SectionItem[], isMac: boolean): MiniatureText {
  const tasks = items.find((i) => i.id === 'tasks');
  const tasksLabel = tasks?.label ?? t(language, 'sidebar', 'tasks');
  return {
    newDaily: shortcutLabel(shortcuts.newDaily.toUpperCase(), isMac),
    search: shortcutLabel(shortcuts.search.toUpperCase(), isMac),
    tasksKey: shortcutLabel(tasks?.shortcut, isMac),
    query: tasksLabel.slice(0, 3).toLowerCase(),
    goToTasks: interpolate(t(language, 'sectionNav', 'goTo'), { name: tasksLabel }),
    sync: t(language, 'settings', 'tabSync'),
    git: t(language, 'settings', 'tabGit'),
    extensions: t(language, 'settings', 'tabExtensions'),
    optional: t(language, 'tour', 'optional'),
  };
}

export function TourScenes({ scene }: { scene: number }) {
  const { language, shortcuts, sidebarStyle, animationsEnabled } = useAppStore(
    useShallow((s) => ({ language: s.language, shortcuts: s.shortcuts, sidebarStyle: s.sidebarStyle, animationsEnabled: s.animationsEnabled })),
  );
  const { items } = useSectionItems();
  // OB14: las teclas salen de la config y del orden del menú actuales.
  const keys = tourKeys(shortcuts, shortcutDigits(items), IS_MAC);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  // "Ver de nuevo" vuelve a montar la miniatura para que empiece de cero.
  const [run, setRun] = useState(0);
  const current = TOUR_SCENES[scene] ?? TOUR_SCENES[0];
  const total = TOUR_SCENES.length;

  // OB17: el foco va al título de la escena al mostrarla.
  useEffect(() => {
    titleRef.current?.focus();
  }, [scene]);

  return (
    <div>
      <div className="relative h-44">
        <SceneMiniature
          key={`${current.id}:${run}`}
          id={current.id}
          variant={sidebarStyle}
          rows={frameRows(homeItem(language), items)}
          text={miniatureText(language, shortcuts, items, IS_MAC)}
        />
        {/* Sin animaciones no hay nada que repetir: con las de la app
            apagadas no se dibuja, y con prefers-reduced-motion lo oculta
            App.css (.obd-replay). */}
        {animationsEnabled && (
          <button
            type="button"
            onClick={() => setRun((n) => n + 1)}
            title={t(language, 'tour', 'replay')}
            aria-label={t(language, 'tour', 'replay')}
            className={`obd-replay absolute right-1.5 top-1.5 bg-[var(--bg-elevated)] ${ICON_BTN}`}
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3">
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
