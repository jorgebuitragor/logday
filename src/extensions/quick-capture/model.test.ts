import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHORTCUT, INBOX_PROJECT, prettyShortcut, readCaptureSettings, shortcutFromKeyEvent, splitCapture,
} from './model';

const key = (code: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods,
});

describe('readCaptureSettings', () => {
  it('usa los valores por defecto de Jorge (atajo propuesto y la raíz)', () => {
    expect(readCaptureSettings(undefined)).toEqual({
      shortcut: DEFAULT_SHORTCUT, kind: 'task', project: INBOX_PROJECT, folder: '',
    });
  });

  it('respeta lo guardado y descarta valores raros', () => {
    expect(readCaptureSettings({ shortcut: 'Alt+KeyL', kind: 'note', project: 'Trabajo', folder: 'Ideas' }))
      .toEqual({ shortcut: 'Alt+KeyL', kind: 'note', project: 'Trabajo', folder: 'Ideas' });
    expect(readCaptureSettings({ shortcut: 3, kind: 'otro', project: '' }).kind).toBe('task');
    expect(readCaptureSettings({ shortcut: '' }).shortcut).toBe(DEFAULT_SHORTCUT);
  });
});

describe('splitCapture (C9, C14)', () => {
  it('la primera línea es el título y el resto el contenido', () => {
    expect(splitCapture('  Llamar a Ana  \nsobre el informe\n\n- ver cifras\n')).toEqual({
      title: 'Llamar a Ana',
      content: 'sobre el informe\n\n- ver cifras',
    });
  });

  it('salta líneas vacías al inicio y normaliza CRLF', () => {
    expect(splitCapture('\n\r\nTítulo\r\nCuerpo')).toEqual({ title: 'Título', content: 'Cuerpo' });
  });

  it('sin título no hay nada que guardar', () => {
    expect(splitCapture('')).toBeNull();
    expect(splitCapture('   ')).toBeNull();
  });

  it('un #123 en el título queda tal cual (sin sintaxis rápida)', () => {
    expect(splitCapture('Revisar issue #123')?.title).toBe('Revisar issue #123');
  });
});

describe('shortcutFromKeyEvent (C2)', () => {
  it('arma el atajo con la tecla física', () => {
    expect(shortcutFromKeyEvent(key('Space', { metaKey: true, shiftKey: true }), true)).toBe('Command+Shift+Space');
    expect(shortcutFromKeyEvent(key('KeyL', { ctrlKey: true, altKey: true }), false)).toBe('Control+Alt+KeyL');
    expect(shortcutFromKeyEvent(key('KeyK', { metaKey: true }), false)).toBe('Super+KeyK');
  });

  it('espera mientras solo hay modificadores, y pide al menos uno', () => {
    expect(shortcutFromKeyEvent(key('ShiftLeft', { shiftKey: true }), true)).toBeNull();
    expect(shortcutFromKeyEvent(key('MetaRight', { metaKey: true }), true)).toBeNull();
    expect(shortcutFromKeyEvent(key('KeyA'), true)).toBeNull();
  });
});

describe('prettyShortcut', () => {
  it('en macOS con símbolos, como en el sistema', () => {
    expect(prettyShortcut(DEFAULT_SHORTCUT, true, 'Espacio')).toBe('⌘⇧Espacio');
    expect(prettyShortcut('Control+Alt+KeyL', true, 'Space')).toBe('⌃⌥L');
  });

  it('en Windows y Linux con nombres', () => {
    expect(prettyShortcut(DEFAULT_SHORTCUT, false, 'Espacio')).toBe('Ctrl+Shift+Espacio');
    expect(prettyShortcut('Super+Digit1', false, 'Space')).toBe('Super+1');
    expect(prettyShortcut('Alt+ArrowUp', false, 'Space')).toBe('Alt+↑');
  });
});
