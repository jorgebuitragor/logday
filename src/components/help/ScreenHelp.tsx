// La ayuda de cada sección (specs/ayuda-contextual AY17–AY20, AY25, AY26,
// design "Textos"): la que abre el botón "Ayuda" del menú lateral. Tareas,
// Dailys, Horas extra y la general salen de la sección `help`; DevTools y
// Pomodoro, de sus extensiones, que se cargan solo al abrirla (R16). Las
// teclas salen de la config.
import { lazy, Suspense, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t, type HelpKey } from '../../lib/i18n';
import { KeyedText } from '../tour/KeyedText';
import { IS_MAC, useSectionItems } from '../sidebar/sections';
import { HelpSection, type HelpContent } from '../shared/HelpPopover';
import { requestTaskShortcuts } from '../tasks/taskShortcutsRequest';
import { dailysHelpKeys, generalHelpKeys, tasksHelpKeys, type HelpKeys } from './helpKeys';
import { helpTopicFor } from './helpTopics';

const DevtoolsHelp = lazy(() => import('../../extensions/devtools/ui/Help'));
const PomodoroHelp = lazy(() => import('../../extensions/pomodoro/Help'));

/** Escenas de TourModal (components/tour/scenes.ts). */
const SCENE_DAY = 0;
const SCENE_TASKS = 1;

export const TASKS_HELP_ITEMS: HelpKey[] = ['tasks1', 'tasks2', 'tasks3', 'tasks4', 'tasks5'];
export const DAILYS_HELP_ITEMS: HelpKey[] = ['dailys1', 'dailys2', 'dailys3', 'dailys4', 'dailys5'];
export const OVERTIME_HELP_ITEMS: HelpKey[] = ['overtime1', 'overtime2', 'overtime3', 'overtime4'];
export const GENERAL_HELP_ITEMS: HelpKey[] = ['general1', 'general2', 'general3', 'general4', 'general5'];

/** El contenido de una ayuda de la sección `help`: sus puntos, con las
 *  teclas como `<kbd>`. */
export function ScreenHelpBody({ items, keys = {} }: { items: HelpKey[]; keys?: HelpKeys }) {
  const language = useAppStore((s) => s.language);
  return <HelpSection items={items.map((key) => <KeyedText key={key} text={t(language, 'help', key)} keys={keys[key]} />)} />;
}

/** La ayuda de la sección activa. */
export function useSectionHelp(): HelpContent {
  const { language, activeSection, shortcuts } = useAppStore(
    useShallow((s) => ({ language: s.language, activeSection: s.activeSection, shortcuts: s.shortcuts })),
  );
  const { home, items } = useSectionItems();
  const topic = helpTopicFor(activeSection);
  return useMemo((): HelpContent => {
    const h = (key: HelpKey) => t(language, 'help', key);
    switch (topic) {
      case 'tasks':
        // La misma en Lista, Kanban y Calendario. "Ver todos los atajos"
        // abre la hoja de la vista activa.
        return {
          screen: h('tasksScreen'),
          title: h('tasksTitle'),
          tourScene: SCENE_TASKS,
          actions: [{ label: h('seeAllShortcuts'), onClick: () => requestTaskShortcuts() }],
          body: <ScreenHelpBody items={TASKS_HELP_ITEMS} keys={tasksHelpKeys(shortcuts, IS_MAC)} />,
        };
      case 'dailys':
        return {
          screen: t(language, 'dailys', 'title'),
          title: h('dailysTitle'),
          tourScene: SCENE_DAY,
          body: <ScreenHelpBody items={DAILYS_HELP_ITEMS} keys={dailysHelpKeys(shortcuts, IS_MAC)} />,
        };
      case 'overtime':
        return {
          screen: t(language, 'sectionNav', 'overtime'),
          title: h('overtimeTitle'),
          tourScene: SCENE_DAY,
          body: <ScreenHelpBody items={OVERTIME_HELP_ITEMS} />,
        };
      case 'devtools':
        return {
          screen: t(language, 'extensions', 'devtools.name'),
          title: t(language, 'devtools', 'help.title'),
          body: <Suspense fallback={null}><DevtoolsHelp /></Suspense>,
        };
      case 'pomodoro':
        return {
          screen: t(language, 'pomodoro', 'title'),
          title: t(language, 'pomodoro', 'helpTitle'),
          body: <Suspense fallback={null}><PomodoroHelp /></Suspense>,
        };
      default:
        // Inicio, Notas y las extensiones sin ayuda propia: la general, con
        // el nombre de la sección en el botón ("Ayuda: Notas").
        return {
          screen: activeSection === home.id ? home.label : items.find((i) => i.id === activeSection)?.label ?? home.label,
          title: h('generalTitle'),
          tourScene: SCENE_DAY,
          body: <ScreenHelpBody items={GENERAL_HELP_ITEMS} keys={generalHelpKeys(shortcuts, IS_MAC)} />,
        };
    }
  }, [topic, language, shortcuts, activeSection, home, items]);
}
