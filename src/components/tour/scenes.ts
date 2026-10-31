// Las 5 escenas de "Cómo funciona" (specs/onboarding OB12) y las teclas que
// nombra su texto (OB14). Sin React, para probarlas solas.
import type { Shortcuts } from '../../types/config';
import type { TourKey } from '../../lib/i18n';
import { shortcutLabel } from '../sidebar/sectionOrder';

export type TourSceneId = 'day' | 'tasks' | 'notes' | 'move' | 'data';

export interface TourScene {
  id: TourSceneId;
  title: TourKey;
  lines: TourKey[];
}

export const TOUR_SCENES: readonly TourScene[] = [
  { id: 'day', title: 's1Title', lines: ['s1a', 's1b', 's1c'] },
  { id: 'tasks', title: 's2Title', lines: ['s2a', 's2b', 's2c'] },
  { id: 'notes', title: 's3Title', lines: ['s3a', 's3b', 's3c'] },
  { id: 'move', title: 's4Title', lines: ['s4a', 's4b', 's4c'] },
  { id: 'data', title: 's5Title', lines: ['s5a', 's5b', 's5c', 's5d'] },
];

/** Las teclas de cada línea, por el nombre de su hueco (`{key}`, `{home}`…). */
export type TourKeys = Partial<Record<TourKey, Record<string, string>>>;

/** OB14: las teclas salen de la config. Las letras, de `shortcuts` (⌘ o
 *  Ctrl según el sistema); los dígitos, del orden del menú: `digits` son
 *  los de las secciones que tienen atajo, en ese orden (NS15). */
export function tourKeys(shortcuts: Shortcuts, digits: readonly string[], isMac: boolean): TourKeys {
  const letter = (key: keyof Shortcuts) => shortcutLabel(shortcuts[key].toUpperCase(), isMac);
  const keys: TourKeys = {
    s1b: { key: letter('newDaily') },
    s2c: { key: letter('newTask') },
    s3c: { key: letter('newNote') },
    s4a: { key: letter('search') },
  };
  if (digits.length > 0) {
    keys.s4b = {
      home: shortcutLabel('0', isMac),
      first: shortcutLabel(digits[0], isMac),
      last: shortcutLabel(digits[digits.length - 1], isMac),
    };
  }
  return keys;
}

/** Parte un texto en trozos de texto y huecos `{nombre}`, para dibujar las
 *  teclas como `<kbd>`. Un hueco sin valor queda como texto. */
export function splitKeys(text: string, vars: Record<string, string> | undefined): { text: string; key?: boolean }[] {
  const out: { text: string; key?: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    const value = vars?.[m[1]];
    if (value === undefined) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: value, key: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
