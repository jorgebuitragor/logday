// Las ayudas de Tareas, Dailys y Horas extra (specs/ayuda-contextual AY17–AY19,
// design "Textos"). Cada una es un HelpButton con sus textos de la sección
// `help`; las teclas salen de la config.
import { useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { t, type HelpKey } from '../../lib/i18n';
import { KeyedText } from '../tour/KeyedText';
import { IS_MAC } from '../sidebar/sections';
import { HelpButton, HelpSection } from '../shared/HelpButton';
import { dailysHelpKeys, tasksHelpKeys, type HelpKeys } from './helpKeys';

/** Escenas de TourModal (components/tour/scenes.ts). */
const SCENE_DAY = 0;
const SCENE_TASKS = 1;

export const TASKS_HELP_ITEMS: HelpKey[] = ['tasks1', 'tasks2', 'tasks3', 'tasks4', 'tasks5'];
export const DAILYS_HELP_ITEMS: HelpKey[] = ['dailys1', 'dailys2', 'dailys3', 'dailys4', 'dailys5'];
export const OVERTIME_HELP_ITEMS: HelpKey[] = ['overtime1', 'overtime2', 'overtime3', 'overtime4'];

/** El contenido de una ayuda de la sección `help`: sus puntos, con las
 *  teclas como `<kbd>`. */
export function ScreenHelpBody({ items, keys = {} }: { items: HelpKey[]; keys?: HelpKeys }) {
  const language = useAppStore((s) => s.language);
  return <HelpSection items={items.map((key) => <KeyedText key={key} text={t(language, 'help', key)} keys={keys[key]} />)} />;
}

/** La misma ayuda en Lista, Kanban y Calendario. "Ver todos los atajos"
 *  abre la hoja de atajos de la vista. */
export function TasksHelp({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const language = useAppStore((s) => s.language);
  const shortcuts = useAppStore((s) => s.shortcuts);
  const keys = useMemo(() => tasksHelpKeys(shortcuts, IS_MAC), [shortcuts]);
  return (
    <HelpButton
      screen={t(language, 'help', 'tasksScreen')}
      title={t(language, 'help', 'tasksTitle')}
      tourScene={SCENE_TASKS}
      actions={[{ label: t(language, 'help', 'seeAllShortcuts'), onClick: onShowShortcuts }]}
    >
      <ScreenHelpBody items={TASKS_HELP_ITEMS} keys={keys} />
    </HelpButton>
  );
}

export function DailysHelp() {
  const language = useAppStore((s) => s.language);
  const shortcuts = useAppStore((s) => s.shortcuts);
  const keys = useMemo(() => dailysHelpKeys(shortcuts, IS_MAC), [shortcuts]);
  return (
    <HelpButton screen={t(language, 'dailys', 'title')} title={t(language, 'help', 'dailysTitle')} tourScene={SCENE_DAY}>
      <ScreenHelpBody items={DAILYS_HELP_ITEMS} keys={keys} />
    </HelpButton>
  );
}

export function OvertimeHelp() {
  const language = useAppStore((s) => s.language);
  return (
    <HelpButton screen={t(language, 'sectionNav', 'overtime')} title={t(language, 'help', 'overtimeTitle')} tourScene={SCENE_DAY}>
      <ScreenHelpBody items={OVERTIME_HELP_ITEMS} />
    </HelpButton>
  );
}
