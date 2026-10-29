// Carga diferida de los módulos de extensión (R16) y ciclo de vida de sus
// procesos propios (R7). Sin React: la usan `useExtensionLifecycle` y
// `ExtensionSlot`, y las pruebas con un registro falso.
import { getExtension } from './registry';
import type { ExtensionDefinition, ExtensionId, ExtensionModule } from './types';

export interface ExtensionRuntime {
  /** Carga el módulo (una vez; si falla, se reintenta en la siguiente). */
  load: (id: ExtensionId) => Promise<ExtensionModule>;
  /** Deja corriendo exactamente las extensiones de `ids`: arranca las
   *  nuevas y para las que ya no están. */
  sync: (ids: Iterable<ExtensionId>) => Promise<void>;
  stop: (id: ExtensionId) => void;
  stopAll: () => void;
  isRunning: (id: ExtensionId) => boolean;
}

function logError(id: ExtensionId, err: unknown) {
  console.error(`[extensión ${id}]`, err);
}

export function createExtensionRuntime(
  getDef: (id: ExtensionId) => ExtensionDefinition | undefined,
): ExtensionRuntime {
  const modules = new Map<ExtensionId, Promise<ExtensionModule>>();
  // Las que deberían estar corriendo, y la función que para cada una.
  const wanted = new Set<ExtensionId>();
  const stops = new Map<ExtensionId, () => void>();

  const load = (id: ExtensionId): Promise<ExtensionModule> => {
    const cached = modules.get(id);
    if (cached) return cached;
    const def = getDef(id);
    if (!def) return Promise.reject(new Error(`Extensión desconocida: ${id}`));
    const promise = def.load();
    modules.set(id, promise);
    promise.catch(() => {
      if (modules.get(id) === promise) modules.delete(id);
    });
    return promise;
  };

  const start = async (id: ExtensionId): Promise<void> => {
    if (wanted.has(id)) return;
    wanted.add(id);
    let mod: ExtensionModule;
    try {
      mod = await load(id);
    } catch (err) {
      logError(id, err);
      return;
    }
    // Pudo desactivarse mientras cargaba.
    if (!wanted.has(id) || stops.has(id) || !mod.start) return;
    try {
      stops.set(id, mod.start());
    } catch (err) {
      logError(id, err);
    }
  };

  const stop = (id: ExtensionId) => {
    wanted.delete(id);
    const fn = stops.get(id);
    stops.delete(id);
    if (!fn) return;
    try {
      fn();
    } catch (err) {
      logError(id, err);
    }
  };

  return {
    load,
    sync: async (ids) => {
      const next = new Set(ids);
      for (const id of [...wanted]) if (!next.has(id)) stop(id);
      await Promise.all([...next].map(start));
    },
    stop,
    stopAll: () => {
      for (const id of [...wanted]) stop(id);
    },
    isRunning: (id) => stops.has(id),
  };
}

export const extensionRuntime = createExtensionRuntime(getExtension);
