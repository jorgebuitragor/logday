import { afterEach, describe, expect, it, vi } from 'vitest';
import { Puzzle } from 'lucide-react';
import { createExtensionRuntime } from './runtime';
import type { ExtensionDefinition, ExtensionId, ExtensionModule } from './types';

const A = 'team-chat' as ExtensionId;

function fakeDef(load: () => Promise<ExtensionModule>): ExtensionDefinition {
  return { id: A, category: 'integration', icon: Puzzle, apps: ['desktop'], load };
}

afterEach(() => vi.restoreAllMocks());

describe('carga diferida (R16)', () => {
  it('no carga el código hasta que se pide, y lo carga una sola vez', async () => {
    const load = vi.fn(async () => ({}));
    const rt = createExtensionRuntime(() => fakeDef(load));
    expect(load).not.toHaveBeenCalled();
    await rt.load(A);
    await rt.load(A);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('una carga fallida se reintenta la siguiente vez', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('chunk'))
      .mockResolvedValueOnce({});
    const rt = createExtensionRuntime(() => fakeDef(load));
    await expect(rt.load(A)).rejects.toThrow('chunk');
    await expect(rt.load(A)).resolves.toEqual({});
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('una extensión desconocida rechaza sin romper', async () => {
    const rt = createExtensionRuntime(() => undefined);
    await expect(rt.load(A)).rejects.toThrow();
  });
});

describe('procesos propios (R7)', () => {
  it('arranca al activarse y para al desactivarse', async () => {
    const stop = vi.fn();
    const start = vi.fn(() => stop);
    const rt = createExtensionRuntime(() => fakeDef(async () => ({ start })));

    await rt.sync([A]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(rt.isRunning(A)).toBe(true);

    // Seguir activa no la vuelve a arrancar.
    await rt.sync([A]);
    expect(start).toHaveBeenCalledTimes(1);

    await rt.sync([]);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(rt.isRunning(A)).toBe(false);
  });

  it('si se desactiva mientras carga, no arranca', async () => {
    const start = vi.fn(() => () => {});
    let resolve!: (m: ExtensionModule) => void;
    const rt = createExtensionRuntime(() => fakeDef(() => new Promise((r) => { resolve = r; })));

    const pending = rt.sync([A]);
    rt.stop(A);
    resolve({ start });
    await pending;
    expect(start).not.toHaveBeenCalled();
  });

  it('stopAll para todo (al cerrar la app)', async () => {
    const stop = vi.fn();
    const rt = createExtensionRuntime(() => fakeDef(async () => ({ start: () => stop })));
    await rt.sync([A]);
    rt.stopAll();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('un error al arrancar o al parar no se propaga (R15)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rt = createExtensionRuntime(() => fakeDef(async () => ({ start: () => { throw new Error('boom'); } })));
    await expect(rt.sync([A])).resolves.toBeUndefined();
    expect(rt.isRunning(A)).toBe(false);

    const rt2 = createExtensionRuntime(() => fakeDef(async () => ({ start: () => () => { throw new Error('stop'); } })));
    await rt2.sync([A]);
    expect(() => rt2.stop(A)).not.toThrow();
    expect(log).toHaveBeenCalled();
  });

  it('una carga fallida no se propaga', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rt = createExtensionRuntime(() => fakeDef(async () => { throw new Error('chunk'); }));
    await expect(rt.sync([A])).resolves.toBeUndefined();
  });
});
