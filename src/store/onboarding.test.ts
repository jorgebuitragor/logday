// pickBaseFolder y completeOnboarding con el store real (specs/onboarding
// OB3, OB6–OB9, OB16): los comandos de Tauri se cambian por un disco en
// memoria y el diálogo por una respuesta fija.
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

describe('pickBaseFolder (OB3, OB6–OB8)', () => {
  it('cancelar devuelve null y no cambia nada', async () => {
    expect(await useAppStore.getState().pickBaseFolder()).toBeNull();
    expect(useAppStore.getState().isConfigured).toBe(false);
    expect(useAppStore.getState().basePath).toBeNull();
  });

  it('elegir no termina la bienvenida ni escribe nada', async () => {
    env.picked = '/Users/ana/Documents/Logday';
    expect(await useAppStore.getState().pickBaseFolder()).toEqual({ path: '/Users/ana/Documents/Logday', isICloud: false, hasData: false });
    const s = useAppStore.getState();
    expect(s.isConfigured).toBe(false);
    expect(s.basePath).toBeNull();
    expect(env.dirs.size).toBe(0);
    expect(env.files.size).toBe(0);
  });

  it('detecta iCloud y una carpeta con datos de Logday', async () => {
    env.picked = '/Users/ana/Library/Mobile Documents/com~apple~CloudDocs/Logday';
    env.dirs.add(`${env.picked}/notes`);
    expect(await useAppStore.getState().pickBaseFolder()).toMatchObject({ isICloud: true, hasData: true });
  });
});

describe('completeOnboarding (OB3, OB9, OB16)', () => {
  it('crea las carpetas, guarda lo elegido y abre en la pantalla de inicio', async () => {
    const s = useAppStore.getState();
    await s.setLanguage('en');
    await s.setSidebarStyle('list');
    await s.setStartupScreen('notes');
    // Antes de terminar, persistConfig no escribe (no hay basePath).
    expect(env.files.has('/cfg/config.json')).toBe(false);

    await useAppStore.getState().completeOnboarding('/datos');

    expect([...env.dirs]).toEqual(expect.arrayContaining(['/datos/projects/inbox', '/datos/notes', '/datos/dailys']));
    expect(savedConfig()).toMatchObject({ basePath: '/datos', language: 'en', sidebarStyle: 'list', startupScreen: 'notes' });
    const after = useAppStore.getState();
    expect(after.isConfigured).toBe(true);
    expect(after.basePath).toBe('/datos');
    expect(after.activeSection).toBe('notes');
    // El idioma también queda en localStorage, como antes.
    expect(env.storage.get('language')).toBe('en');
  });

  it('"Omitir" con los valores por defecto: Inicio y la Barra de íconos', async () => {
    await useAppStore.getState().completeOnboarding('/datos');
    expect(savedConfig()).toMatchObject({ startupScreen: 'dashboard', sidebarStyle: 'list' });
    expect(useAppStore.getState().activeSection).toBe('dashboard');
  });

  it('si no puede crear las carpetas, lanza y la bienvenida sigue abierta (OB9)', async () => {
    env.failCreate = true;
    await expect(useAppStore.getState().completeOnboarding('/sin-permiso')).rejects.toThrow('EACCES');
    const s = useAppStore.getState();
    expect(s.isConfigured).toBe(false);
    expect(s.basePath).toBeNull();
    expect(env.files.has('/cfg/config.json')).toBe(false);
  });

  it('se puede reintentar después del error', async () => {
    env.failCreate = true;
    await expect(useAppStore.getState().completeOnboarding('/datos')).rejects.toThrow();
    env.failCreate = false;
    await useAppStore.getState().completeOnboarding('/datos');
    expect(useAppStore.getState().isConfigured).toBe(true);
  });
});
