// Store chico de la extensión (como el del Pomodoro): la lista que se leyó
// de disco, la skill elegida y el estado de carga. Lo que se recuerda entre
// sesiones (filtros) va en `extensions['agent-skills'].settings`.
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { errorCode, listSkills, type FolderInfo } from './api';
import { toItem, type SkillItem } from './model';

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
  reload: () => Promise<void>;
  reset: () => void;
}

const INITIAL = { items: [], folders: [], loading: false, error: null, loaded: false, selectedKey: null, editingKey: null };

// Una lectura a la vez: si llega otra mientras tanto, se usa la última.
let generation = 0;

export const agentSkillsApi = createStore<AgentSkillsStore>((set, get) => ({
  ...INITIAL,
  // Elegir otra skill sale del editor (la vista pregunta antes si hay
  // cambios sin guardar).
  select: (key) => set((s) => ({ selectedKey: key, editingKey: s.editingKey === key ? s.editingKey : null })),
  setEditing: (key) => set({ editingKey: key }),
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
    set(INITIAL);
  },
}));

/** Como un store de `create`, pero con la api aparte para que las pruebas
 *  con react-dom/server puedan leer el estado actual (como el Pomodoro). */
export const useAgentSkills = Object.assign(
  <T,>(select: (s: AgentSkillsStore) => T): T => useStore(agentSkillsApi, select),
  agentSkillsApi,
);
