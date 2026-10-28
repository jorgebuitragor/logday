import { afterEach, describe, expect, it, vi } from 'vitest';
import tauriConf from '../../src-tauri/tauri.conf.json';
import pkg from '../../package.json';
import { APP_COPYRIGHT, APP_LICENSE_SPDX, appUpdatedAt, fetchRelease, recordAppUpdatedAt } from './releases';

afterEach(() => vi.unstubAllGlobals());

describe('datos de la app', () => {
  it('copyright y licencia coinciden con tauri.conf.json y package.json', () => {
    expect(APP_COPYRIGHT).toBe(tauriConf.bundle.copyright);
    expect(APP_LICENSE_SPDX).toBe(pkg.license);
  });
});

describe('fetchRelease', () => {
  const stubFetch = (res: Partial<Response> | Error) =>
    vi.stubGlobal('fetch', vi.fn(async () => { if (res instanceof Error) throw res; return res; }));

  it('trae las notas y la fecha de publicación', async () => {
    stubFetch({ ok: true, status: 200, json: async () => ({ body: '## Novedades', published_at: '2026-10-28T12:33:11Z' }) });
    expect(await fetchRelease('1.0.8')).toEqual({ body: '## Novedades', publishedAt: '2026-10-28T12:33:11Z' });
  });

  it('sin notas, sin release y sin red', async () => {
    stubFetch({ ok: true, status: 200, json: async () => ({ body: '  ' }) });
    expect(await fetchRelease('1.0.8')).toEqual({ body: null });
    stubFetch({ ok: false, status: 404 });
    expect(await fetchRelease('9.9.9')).toBeNull();
    stubFetch({ ok: false, status: 403 });
    expect(await fetchRelease('1.0.8')).toBeUndefined();
    stubFetch(new Error('offline'));
    expect(await fetchRelease('1.0.8')).toBeUndefined();
  });
});

describe('fecha de actualización en este equipo', () => {
  it('se guarda por versión', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    });
    expect(appUpdatedAt('1.0.8')).toBeUndefined();
    recordAppUpdatedAt('1.0.8', '2026-10-28T15:00:00.000Z');
    expect(appUpdatedAt('1.0.8')).toBe('2026-10-28T15:00:00.000Z');
    // De otra versión no vale: esa fecha es de cuando se instaló la anterior.
    expect(appUpdatedAt('1.0.9')).toBeUndefined();
  });
});
