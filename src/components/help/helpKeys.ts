// Las teclas que nombran las ayudas de Tareas y Dailys (specs/ayuda-contextual
// AY13): las letras salen de `shortcuts`, con ⌘ o Ctrl según el sistema, como
// las del recorrido (`tourKeys`). Sin React, para probarlas solas.
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
