import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS } from '../../types/config';
import { sectionKeys, t } from '../../lib/i18n';
import { splitKeys, TOUR_SCENES, tourKeys } from './scenes';

describe('las escenas (OB12)', () => {
  it('son 5, con 2 a 4 líneas cada una, y sus textos existen en es y en', () => {
    expect(TOUR_SCENES).toHaveLength(5);
    for (const scene of TOUR_SCENES) {
      expect(scene.lines.length).toBeGreaterThanOrEqual(2);
      expect(scene.lines.length).toBeLessThanOrEqual(4);
      for (const key of [scene.title, ...scene.lines]) {
        expect(sectionKeys('es', 'tour')).toContain(key);
        expect(sectionKeys('en', 'tour')).toContain(key);
      }
    }
  });
});

describe('las teclas (OB14)', () => {
  it('salen de shortcuts, con ⌘ en macOS y Ctrl en los demás', () => {
    const mac = tourKeys(DEFAULT_SHORTCUTS, ['1', '2', '3', '4'], true);
    expect(mac.s1b).toEqual({ key: '⌘D' });
    expect(mac.s2c).toEqual({ key: '⌘T' });
    expect(mac.s3c).toEqual({ key: '⌘N' });
    expect(mac.s4a).toEqual({ key: '⌘F' });
    expect(mac.s4b).toEqual({ home: '⌘0', first: '⌘1', last: '⌘4' });
    const win = tourKeys({ ...DEFAULT_SHORTCUTS, newTask: 'k' }, ['1', '2', '3', '4', '5', '6'], false);
    expect(win.s2c).toEqual({ key: 'Ctrl+K' });
    expect(win.s4b).toEqual({ home: 'Ctrl+0', first: 'Ctrl+1', last: 'Ctrl+6' });
  });

  it('cada hueco de los textos tiene su tecla', () => {
    const keys = tourKeys(DEFAULT_SHORTCUTS, ['1', '2', '3', '4'], true);
    for (const lang of ['es', 'en'] as const) {
      for (const scene of TOUR_SCENES) {
        for (const line of scene.lines) {
          const parts = splitKeys(t(lang, 'tour', line), keys[line]);
          expect(parts.map((p) => p.text).join('')).not.toMatch(/\{\w+\}/);
        }
      }
    }
  });

  it('splitKeys separa texto y teclas, y deja un hueco sin valor como texto', () => {
    expect(splitKeys('{key} crea una nota.', { key: '⌘N' })).toEqual([{ text: '⌘N', key: true }, { text: ' crea una nota.' }]);
    expect(splitKeys('a {x} b', {})).toEqual([{ text: 'a {x} b' }]);
  });
});
