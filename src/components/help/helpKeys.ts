// Las teclas que nombran las ayudas de Tareas, Dailys y la general
// (specs/ayuda-contextual AY13, AY26): las letras salen de `shortcuts`, con ⌘
// o Ctrl según el sistema, como las del recorrido (`tourKeys`). Sin React,
// para probarlas solas.
import type { Shortcuts } from '../../types/config';
import type { HelpKey } from '../../lib/i18n';
import { shortcutLabel } from '../sidebar/sectionOrder';

/** Las teclas de cada texto, por el nombre de su hueco (`{newTask}`…). */
export type HelpKeys = Partial<Record<HelpKey, Record<string, string>>>;

/** ⌘ en macOS y Ctrl en Windows y Linux. */
export const modKey = (isMac: boolean) => (isMac ? '⌘' : 'Ctrl');

const letter = (shortcuts: Shortcuts, key: keyof Shortcuts, isMac: boolean) =>
  shortcutLabel(shortcuts[key].toUpperCase(), isMac);

export function tasksHelpKeys(shortcuts: Shortcuts, isMac: boolean): HelpKeys {
  return {
    // Las de la lista son fijas (TaskList.tsx, atajos de una tecla).
    tasks2: { up: '↑', down: '↓', enter: 'Enter', x: 'x', t: 't', m: 'm', w: 'w' },
    tasks3: { mod: modKey(isMac) },
    tasks5: { newTask: letter(shortcuts, 'newTask', isMac) },
  };
}

export function dailysHelpKeys(shortcuts: Shortcuts, isMac: boolean): HelpKeys {
  return {
    dailys1: { newDaily: letter(shortcuts, 'newDaily', isMac) },
    dailys5: { absence: letter(shortcuts, 'markAbsence', isMac) },
  };
}

/** AY27: "⌘/" en macOS y "Ctrl+/" fuera. */
export const helpShortcutLabel = (isMac: boolean) => shortcutLabel('/', isMac);

/** La ayuda general: ⌘0…⌘9 de las secciones (NS15), Buscar, crear y ⌘/. */
export function generalHelpKeys(shortcuts: Shortcuts, isMac: boolean): HelpKeys {
  return {
    general1: { home: shortcutLabel('0', isMac), first: shortcutLabel('1', isMac), last: shortcutLabel('9', isMac) },
    general2: { search: letter(shortcuts, 'search', isMac) },
    general4: {
      newTask: letter(shortcuts, 'newTask', isMac),
      newNote: letter(shortcuts, 'newNote', isMac),
      newDaily: letter(shortcuts, 'newDaily', isMac),
    },
    general5: { help: helpShortcutLabel(isMac) },
  };
}
