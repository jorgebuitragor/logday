import { describe, expect, it, vi } from 'vitest';
import { blockLanguagesKey, blockRedrawer } from './extensionBlockRedraw';

const fakeEditor = (isDestroyed = false) => ({ isDestroyed, createNodeViews: vi.fn() });

describe('blockLanguagesKey', () => {
  it('cambia al encender o apagar una extensión, o al pasar a inline', () => {
    const off = blockLanguagesKey({}, {});
    const on = blockLanguagesKey({ http: 'http-client' }, {});
    const inline = blockLanguagesKey({ http: 'http-client' }, { http: true });
    expect(new Set([off, on, inline]).size).toBe(3);
  });

  it('no depende del orden', () => {
    expect(blockLanguagesKey({ a: 'x', b: 'y' }, {})).toBe(blockLanguagesKey({ b: 'y', a: 'x' }, {}));
  });
});

describe('blockRedrawer', () => {
  it('redibuja solo cuando cambian los lenguajes', () => {
    const editor = fakeEditor();
    const redraw = blockRedrawer('http:http-client:inline');
    redraw(editor, 'http:http-client:inline');
    expect(editor.createNodeViews).not.toHaveBeenCalled();
    redraw(editor, '');
    expect(editor.createNodeViews).toHaveBeenCalledTimes(1);
    redraw(editor, '');
    expect(editor.createNodeViews).toHaveBeenCalledTimes(1);
    redraw(editor, 'http:http-client:inline');
    expect(editor.createNodeViews).toHaveBeenCalledTimes(2);
  });

  it('otro editor (otra nota) con los mismos lenguajes no redibuja', () => {
    const [first, second] = [fakeEditor(), fakeEditor()];
    const redraw = blockRedrawer('k');
    redraw(first, 'k');
    redraw(second, 'k');
    expect(first.createNodeViews).not.toHaveBeenCalled();
    expect(second.createNodeViews).not.toHaveBeenCalled();
  });

  it('sin editor o ya destruido no hace nada, y el siguiente cambio sí redibuja', () => {
    const redraw = blockRedrawer('a');
    const destroyed = fakeEditor(true);
    redraw(destroyed, 'b');
    expect(destroyed.createNodeViews).not.toHaveBeenCalled();
    expect(() => redraw(null, 'c')).not.toThrow();
    const editor = fakeEditor();
    redraw(editor, 'd');
    expect(editor.createNodeViews).toHaveBeenCalledTimes(1);
  });
});
