// Entornos sin salir de la pantalla, el ojo de los secretos y el diálogo de
// los valores de un cURL (specs/cliente-http HT71, HT76, HT77): se dibujan
// con react-dom/server (sin DOM), y el ojo se prueba con el comando de Rust
// simulado. Lo que importa: el valor revelado solo llega a quien lo pidió y
// no se guarda en ningún sitio. La interacción se revisa en el navegador.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sectionKeys, t } from '../../lib/i18n';
import type { HttpEnvironment, HttpVariable } from './core/environments';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  extensions: {} as Record<string, { enabled: boolean; settings?: Record<string, unknown> }>,
  confirmDestructiveActions: true,
  basePath: '/datos',
  noteFolders: [] as string[],
  notes: [],
  updateExtensionSettings: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    app.extensions[id] = { ...app.extensions[id], settings: { ...app.extensions[id]?.settings, ...patch } };
  }),
  openExtensionSettings: () => {},
  showToast: vi.fn(() => ''),
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore, notesDir: () => '', noteFolderDir: () => '', readNoteFromPath: async () => null };
});

// El puente con Rust: `http_client_reveal_secret` devuelve el valor del
// llavero simulado.
const tauri = vi.hoisted(() => ({
  calls: [] as { cmd: string; args: unknown }[],
  keychain: { v_ab12cd34: 's3cr3t-valor' } as Record<string, string>,
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: { key?: string }) => {
    tauri.calls.push({ cmd, args });
    if (cmd === 'http_client_reveal_secret') {
      const v = tauri.keychain[args.key ?? ''];
      if (v === undefined) throw 'secret_not_found';
      return v;
    }
    return null;
  },
}));

const store = await import('./store');
const { makeTr } = await import('./core/text');
const { revealHttpSecret } = await import('./core/api');
const { EnvironmentPanel, SecretShown, makeRevealer, REVEAL_MS } = await import('./ui/EnvironmentPanel');
const { EnvironmentsScreen } = await import('./ui/Environments');
const { CurlSecretsPanel } = await import('./ui/CurlSecretsDialog');
const { RequestForm } = await import('./ui/RequestForm');
const { default: HttpClientView } = await import('./ui/View');

store.httpApi.getInitialState = store.httpApi.getState;

const tr = makeTr('es');
const text = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const TOKEN: HttpVariable & { secret: true } = { name: 'token', secret: true, key: 'v_ab12cd34', hint: '…lor' };
const STAGING: HttpEnvironment = {
  id: 'e_00000001', name: 'Staging', protected: false, insecureTls: false, extraHosts: [],
  vars: [{ name: 'baseUrl', secret: false, value: 'https://staging.example.com' }, TOKEN],
};
const PROD: HttpEnvironment = { ...STAGING, id: 'e_00000002', name: 'Producción', protected: true };

const setSettings = (settings: Record<string, unknown>) => {
  app.extensions = { 'http-client': { enabled: true, settings } };
};

beforeEach(() => {
  store.resetAll();
  tauri.calls = [];
  app.language = 'es';
  app.updateExtensionSettings.mockClear();
  setSettings({ environments: [STAGING, PROD], activeEnvId: STAGING.id });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('el ojo de un secreto (HT77)', () => {
  it('oculto: la pista, con "Mostrar" y "Copiar"; revelado: el valor y "Ocultar"', () => {
    const hidden = renderToStaticMarkup(<SecretShown v={TOKEN} tr={tr} revealed={null} onToggle={() => {}} onCopy={() => {}} onChange={() => {}} />);
    expect(text(hidden)).toContain('••••…lor');
    expect(hidden).not.toContain('s3cr3t');
    expect(hidden).toContain('aria-label="Mostrar el valor de token"');
    expect(hidden).toContain('aria-pressed="false"');
    expect(hidden).toContain('aria-label="Copiar el valor de token"');
    const shown = renderToStaticMarkup(<SecretShown v={TOKEN} tr={tr} revealed="s3cr3t-valor" onToggle={() => {}} onCopy={() => {}} onChange={() => {}} />);
    expect(text(shown)).toContain('s3cr3t-valor');
    expect(shown).toContain('aria-label="Ocultar el valor de token"');
    expect(shown).toContain('aria-pressed="true"');
  });

  it('el comando de Rust es http_client_reveal_secret, con la clave y nada más', async () => {
    expect(await revealHttpSecret('v_ab12cd34')).toBe('s3cr3t-valor');
    expect(tauri.calls).toEqual([{ cmd: 'http_client_reveal_secret', args: { key: 'v_ab12cd34' } }]);
  });

  it('lo revelado se oculta solo a los 30 s, y con "Ocultar"', async () => {
    vi.useFakeTimers();
    const seen: (string | null)[] = [];
    const r = makeRevealer({ read: revealHttpSecret, onChange: (v) => seen.push(v) });
    await r.show('v_ab12cd34');
    expect(seen).toEqual(['s3cr3t-valor']);
    vi.advanceTimersByTime(REVEAL_MS - 1);
    expect(seen).toEqual(['s3cr3t-valor']);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['s3cr3t-valor', null]);
    await r.show('v_ab12cd34');
    r.hide();
    expect(seen[seen.length - 1]).toBeNull();
    vi.advanceTimersByTime(REVEAL_MS);
    expect(seen.filter((v) => v === null)).toHaveLength(2);
  });

  it('si se oculta (o se cierra el panel) antes de que llegue el valor, no se muestra', async () => {
    const seen: (string | null)[] = [];
    const r = makeRevealer({ read: revealHttpSecret, onChange: (v) => seen.push(v) });
    const pending = r.show('v_ab12cd34');
    r.dispose();
    await pending;
    expect(seen).toEqual([]);
  });

  it('el valor revelado no se guarda: ni en los ajustes, ni en el store, ni en localStorage', async () => {
    const storage = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    try {
      let shown: string | null = null;
      const r = makeRevealer({ read: revealHttpSecret, onChange: (v) => { shown = v; } });
      await r.show('v_ab12cd34');
      expect(shown).toBe('s3cr3t-valor');
      expect(app.updateExtensionSettings).not.toHaveBeenCalled();
      expect(JSON.stringify(app.extensions)).not.toContain('s3cr3t');
      expect(JSON.stringify(store.httpApi.getState())).not.toContain('s3cr3t');
      expect(storage.setItem).not.toHaveBeenCalled();
      r.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('un error del llavero llega como rechazo (el panel lo dice con un toast)', async () => {
    const r = makeRevealer({ read: revealHttpSecret, onChange: () => {} });
    await expect(r.show('v_ffffffff')).rejects.toBe('secret_not_found');
  });
});

describe('el panel Entornos de la pantalla (HT76)', () => {
  it('el formulario tiene "Entornos" junto al selector, si la pantalla lo da', () => {
    const html = renderToStaticMarkup(<RequestForm tr={tr} mac loadedError={null} onOpenNote={() => {}} onSaved={() => {}} onOpenEnvironments={() => {}} />);
    expect(text(html)).toContain('Entornos');
    expect(text(html)).toContain('Staging');
    // Sin él (como en las pruebas de antes), no está.
    const plain = renderToStaticMarkup(<RequestForm tr={tr} mac loadedError={null} onOpenNote={() => {}} onSaved={() => {}} />);
    expect(plain).not.toContain('Entornos</button>');
  });

  it('con los entornos apagados, ni selector ni botón (HT72)', () => {
    setSettings({ environments: [STAGING], activeEnvId: STAGING.id, useEnvironments: false });
    const html = text(renderToStaticMarkup(<RequestForm tr={tr} mac loadedError={null} onOpenNote={() => {}} onSaved={() => {}} onOpenEnvironments={() => {}} />));
    expect(html).not.toContain('Staging');
    expect(html).not.toContain('Entornos');
  });

  it('la pantalla abre con el formulario; el panel no está hasta pedirlo', () => {
    const html = renderToStaticMarkup(<HttpClientView />);
    expect(html).toContain('id="http-view-title"');
    expect(html).not.toContain('id="http-envs-title"');
  });

  it('el panel: volver, el entorno activo, una pestaña por entorno, variables y el secreto oculto', () => {
    const html = renderToStaticMarkup(<EnvironmentsScreen tr={tr} initialEnvId={PROD.id} onClose={() => {}} />);
    const t = text(html);
    expect(t).toContain('Volver a la petición');
    expect(html).toContain('aria-label="Entorno activo: Staging"');
    expect(html).toContain('role="tablist"');
    // Abre con el entorno pedido: Producción, que no es el activo.
    expect(html).toMatch(/aria-selected="true"[^>]*>(?:(?!<\/button>).)*Producción/);
    expect(t).toContain('Usar este entorno');
    expect(t).toContain('••••…lor');
    expect(html).toContain('aria-label="Mostrar el valor de token"');
    expect(html).not.toContain('s3cr3t');
    expect(t).toContain('Hosts de confianza para los secretos');
    expect(t).toContain('Duplicar');
    expect(t).toContain('Eliminar');
    expect(t).toContain('Pedir confirmación antes de enviar POST, PUT, PATCH o DELETE');
  });

  it('el entorno activo dice que lo es, sin el botón', () => {
    const html = text(renderToStaticMarkup(
      <EnvironmentPanel env={STAGING} tr={tr} active onDelete={() => {}} onDeleteVar={() => {}} onUnsecret={() => {}} />,
    ));
    expect(html).toContain('Entorno activo');
    expect(html).not.toContain('Usar este entorno');
  });
});

describe('el diálogo de los valores de un cURL (HT71)', () => {
  const panel = (language: 'es' | 'en', names: string[]) =>
    renderToStaticMarkup(
      <CurlSecretsPanel tr={makeTr(language)} names={names} remember={false} onRemember={() => {}} onChoose={() => {}} titleId="t" bodyId="b" />,
    );

  it('los nombres de las variables (nunca los valores), los dos botones y "Recordar"', () => {
    const html = panel('es', ['token', 'cookie']);
    const t = text(html);
    expect(t).toContain('Este cURL trae valores sensibles');
    expect(t).toContain('Tiene 2 valores que no conviene dejar escritos en la nota');
    expect(t).toContain('{{token}}');
    expect(t).toContain('{{cookie}}');
    expect(t).toContain('Cambiar por variables');
    expect(t).toContain('Dejar los valores');
    expect(t).toContain('Recordar mi elección');
    expect(t).toContain('Esc pega el texto sin convertirlo.');
    expect(html).toContain('type="checkbox"');
    // "Cambiar por variables" es el principal (el último, con el acento).
    expect(html.lastIndexOf('Cambiar por variables')).toBeGreaterThan(html.lastIndexOf('Dejar los valores'));
    expect(html).toMatch(/bg-\[var\(--accent-solid\)\][^>]*>Cambiar por variables/);
  });

  it('uno solo, en singular; y en inglés', () => {
    expect(text(panel('es', ['token']))).toContain('Tiene un valor que no conviene dejar escrito en la nota');
    const en = text(panel('en', ['token']));
    expect(en).toContain('This cURL has sensitive values');
    expect(en).toContain('Replace with variables');
    expect(en).toContain('Keep the values');
  });
});

describe('textos (HT70–HT77)', () => {
  const KEYS = [
    'curlAskTitle', 'curlAskBody', 'curlAskListAria', 'curlAskHelp', 'curlAskRemember', 'curlAskKeep', 'curlAskVariables', 'curlAskEsc',
    'curlPasteTitle', 'curlPasteLabel', 'curlPasteAsk', 'curlPasteVariables', 'curlPasteKeep', 'curlPasteHelp', 'useEnvironments',
    'useEnvironmentsHelp', 'envsOff', 'securityTitle', 'confirmUntrustedToggle', 'confirmUntrustedHelp', 'maskResponseToggle',
    'maskResponseHelp', 'varUnresolved', 'url.unresolved', 'varSentAsIs', 'varSecretShowAria', 'varSecretHideAria', 'varSecretCopyAria',
    'varSecretCopied', 'varSecretReadError', 'varSecretRevealedNote', 'envIsActive', 'envMakeActive', 'envPanelOpen', 'envPanelBack',
    'defineInEnvironments',
  ];

  it('es y en con las mismas claves, y sin voseo', () => {
    for (const lang of ['es', 'en'] as const) for (const k of KEYS) expect(sectionKeys(lang, 'httpClient')).toContain(k);
    const voseo = /\b(querés|podés|tenés|guardá|pegá|abrí|usá|elegí|recordá|dejá|cambiá)\b/i;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const k of KEYS) expect(voseo.test(t('es', 'httpClient', k as any))).toBe(false);
  });
});
