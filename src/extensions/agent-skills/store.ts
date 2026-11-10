// Store chico de la extensión (como el del Pomodoro): la lista que se leyó
// de disco, la skill elegida y el estado de carga. Lo que se recuerda entre
// sesiones (filtros) va en `extensions['agent-skills'].settings`.
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { discardStaged, errorCode, fetchRepo, listInstalled, listSkills, type FolderInfo, type InstalledInfo, type RepoCatalog } from './api';
import { toItem, type SkillItem } from './model';
import type { LinkedRepo } from './repos';

/** El catálogo abierto de un repo (fase 3). */
export interface CatalogState {
  loading: boolean;
  catalog: RepoCatalog | null;
  error: string | null;
  checkedAt: number | null;
}

export type ViewTab = 'installed' | 'repos';

interface AgentSkillsStore {
  items: SkillItem[];
  folders: FolderInfo[];
  loading: boolean;
  /** Código del último error al leer la lista. */
  error: string | null;
  loaded: boolean;
  selectedKey: string | null;
  /** La skill cuyo SKILL.md se está editando (fase 2). */
  editingKey: string | null;
  select: (key: string | null) => void;
  setEditing: (key: string | null) => void;
  tab: ViewTab;
  setTab: (tab: ViewTab) => void;
  /** Fase 3: el repo elegido, sus catálogos y lo instalado desde repos. */
  selectedRepoId: string | null;
  selectRepo: (id: string | null) => void;
  catalogs: Record<string, CatalogState>;
  installed: InstalledInfo[];
  loadInstalled: () => Promise<void>;
  /** Abre o vuelve a revisar un repo (SK22: solo cuando se pide). */
  fetchCatalog: (repo: LinkedRepo) => Promise<void>;
  dropCatalog: (id: string) => void;
  reload: () => Promise<void>;
  reset: () => void;
}

const INITIAL = {
  items: [],
  folders: [],
  loading: false,
  error: null,
  loaded: false,
  selectedKey: null,
  editingKey: null,
  tab: 'installed' as ViewTab,
  selectedRepoId: null,
  catalogs: {} as Record<string, CatalogState>,
  installed: [] as InstalledInfo[],
};

/** Lo preparado de un catálogo vive en disco hasta que se reemplaza o se
 *  cierra: se borra para no dejar zips descomprimidos (Rust además limpia
 *  lo de más de 24 h). */
function discard(c: CatalogState | undefined) {
  if (c?.catalog) void discardStaged(c.catalog.bundle.id).catch(() => undefined);
}

// Una lectura a la vez: si llega otra mientras tanto, se usa la última.
let generation = 0;

export const agentSkillsApi = createStore<AgentSkillsStore>((set, get) => ({
  ...INITIAL,
  // Elegir otra skill sale del editor (la vista pregunta antes si hay
  // cambios sin guardar).
  select: (key) => set((s) => ({ selectedKey: key, editingKey: s.editingKey === key ? s.editingKey : null })),
  setEditing: (key) => set({ editingKey: key }),
  setTab: (tab) => set({ tab }),
  selectRepo: (id) => set({ selectedRepoId: id }),
  loadInstalled: async () => {
    try {
      set({ installed: await listInstalled() });
    } catch {
      // Sin registro, todo sale como "No instalada": no impide usar el catálogo.
    }
  },
  fetchCatalog: async (repo) => {
    const prev = get().catalogs[repo.id];
    set({ catalogs: { ...get().catalogs, [repo.id]: { loading: true, catalog: prev?.catalog ?? null, error: null, checkedAt: prev?.checkedAt ?? null } } });
    try {
      const [catalog] = await Promise.all([fetchRepo(repo), get().loadInstalled()]);
      discard(prev);
      set({ catalogs: { ...get().catalogs, [repo.id]: { loading: false, catalog, error: null, checkedAt: Date.now() } } });
    } catch (err) {
      set({ catalogs: { ...get().catalogs, [repo.id]: { loading: false, catalog: prev?.catalog ?? null, error: errorCode(err), checkedAt: prev?.checkedAt ?? null } } });
    }
  },
  dropCatalog: (id) => {
    discard(get().catalogs[id]);
    const rest = { ...get().catalogs };
    delete rest[id];
    set({ catalogs: rest });
  },
  reload: async () => {
    const mine = ++generation;
    set({ loading: true });
    try {
      const res = await listSkills();
      if (mine !== generation) return;
      const items = res.skills.map(toItem);
      const selected = get().selectedKey;
      set({
        items,
        folders: res.folders,
        loading: false,
        loaded: true,
        error: null,
        // Si la elegida ya no está (se borró por fuera), no queda nada elegido.
        selectedKey: selected && items.some((it) => it.key === selected) ? selected : null,
        editingKey: get().editingKey && items.some((it) => it.key === get().editingKey) ? get().editingKey : null,
      });
    } catch (err) {
      if (mine !== generation) return;
      set({ loading: false, loaded: true, error: errorCode(err) });
    }
  },
  reset: () => {
    generation++;
    for (const c of Object.values(get().catalogs)) discard(c);
    set(INITIAL);
  },
}));

/** Como un store de `create`, pero con la api aparte para que las pruebas
 *  con react-dom/server puedan leer el estado actual (como el Pomodoro). */
export const useAgentSkills = Object.assign(
  <T,>(select: (s: AgentSkillsStore) => T): T => useStore(agentSkillsApi, select),
  agentSkillsApi,
);
