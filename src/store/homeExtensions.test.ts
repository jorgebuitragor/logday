// Lo de Inicio de specs/extensiones R27 con el store real: "Ver extensiones"
// abre Opciones en el catálogo y "Ocultar este aviso" se guarda en
// config.json (local). Los comandos de Tauri se cambian por un disco en
// memoria, como en onboarding.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, String(v)); },
    removeItem: (k: string) => { storage.delete(k); },
    clear: () => storage.clear(),
  };
  Object.assign(globalThis, {
    localStorage,
    window: Object.assign(globalThis, { addEventListener: () => {}, removeEventListener: () => {} }),
  });
  return {
    storage,
    dirs: new Set<string>(),
    files: new Map<string, string>(),
    picked: null as string | null,
    failCreate: false,
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: Record<string, string>) => {
    switch (cmd) {
      case 'create_dir_recursive':
        if (env.failCreate) throw new Error('EACCES');
        env.dirs.add(args.dir);
        return;
      case 'path_exists':
        return env.dirs.has(args.path) || env.files.has(args.path);
      case 'write_file':
        env.files.set(args.path, args.content);
        return;
      case 'read_file':
        if (!env.files.has(args.path)) throw new Error('ENOENT');
        return env.files.get(args.path);
      case 'list_dir':
        return [];
      default:
        return null;
    }
  },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: async () => env.picked, save: async () => null }));
vi.mock('@tauri-apps/plugin-websocket', () => ({ default: { connect: async () => ({}) } }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: async () => null }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '0.0.0' }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: async () => {} }));

const { useAppStore } = await import('./appStore');
const initial = useAppStore.getState();

beforeEach(() => {
  env.dirs.clear();
  env.files.clear();
  env.picked = null;
  env.failCreate = false;
  useAppStore.setState(initial, true);
  useAppStore.setState({ configDir: '/cfg' });
});

const savedConfig = () => JSON.parse(env.files.get('/cfg/config.json') ?? 'null');

describe('Inicio y extensiones (R27)', () => {
  it('openExtensionsCatalog abre Opciones con la señal del catálogo', () => {
    useAppStore.getState().openExtensionsCatalog();
    expect(useAppStore.getState()).toMatchObject({ isSettingsOpen: true, extensionsCatalogRequest: true });
    useAppStore.getState().clearExtensionsCatalogRequest();
    expect(useAppStore.getState().extensionsCatalogRequest).toBe(false);
    expect(useAppStore.getState().isSettingsOpen).toBe(true);
  });

  it('el aviso empieza visible y la config de siempre no lleva la clave', async () => {
    expect(useAppStore.getState().homeExtensionsHintDismissed).toBe(false);
    useAppStore.setState({ basePath: '/datos' });
    await useAppStore.getState().setHelpButtonsEnabled(true);
    expect(savedConfig()).not.toHaveProperty('homeExtensionsHintDismissed');
  });

  it('"Ocultar este aviso" lo recuerda en config.json', async () => {
    useAppStore.setState({ basePath: '/datos' });
    await useAppStore.getState().dismissHomeExtensionsHint();
    expect(useAppStore.getState().homeExtensionsHintDismissed).toBe(true);
    expect(savedConfig()).toMatchObject({ basePath: '/datos', homeExtensionsHintDismissed: true });
    // Otro cambio de opciones no lo pierde.
    await useAppStore.getState().setHelpButtonsEnabled(false);
    expect(savedConfig()).toMatchObject({ homeExtensionsHintDismissed: true, helpButtonsEnabled: false });
  });
});
