import { describe, expect, it } from 'vitest';
import { byteSize, parseScene, sceneToCode } from './scene';

describe('escena de Excalidraw en la nota', () => {
  it('vacío y roto no rompen la nota (X3)', () => {
    expect(parseScene('')).toEqual({ scene: { elements: [], appState: {}, files: {} }, ok: true });
    expect(parseScene('{no es json')).toMatchObject({ ok: false, scene: { elements: [] } });
  });

  it('lee elementos sin los borrados, appState y archivos', () => {
    const code = JSON.stringify({ type: 'excalidraw', elements: [{ id: 'a' }, { id: 'b', isDeleted: true }], appState: { viewBackgroundColor: '#fff' }, files: { f: {} } });
    const { scene, ok } = parseScene(code);
    expect(ok).toBe(true);
    expect(scene.elements).toEqual([{ id: 'a' }]);
    expect(scene.appState).toEqual({ viewBackgroundColor: '#fff' });
    expect(Object.keys(scene.files)).toEqual(['f']);
  });

  it('se guarda en una sola línea, sin ``` que cierre la cerca', () => {
    const out = sceneToCode(JSON.stringify({ elements: [{ id: 'a', text: 'línea 1\n```\nlínea 2' }] }, null, 2));
    expect(out).not.toContain('\n');
    expect(JSON.parse(out).elements[0].text).toBe('línea 1\n```\nlínea 2');
  });

  it('mide en bytes, no en caracteres', () => {
    expect(byteSize('ñ')).toBe(2);
  });
});
