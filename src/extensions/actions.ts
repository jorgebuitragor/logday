// Activar con aviso (R6) y desactivar, sin React ni store, para probarlo
// solo. `useExtensions` lo conecta con el store.
import { needsConsent } from './state';
import type { ExtensionDefinition, ExtensionId, ExtensionsConfig } from './types';

export type EnableResult = 'enabled' | 'needs-consent' | 'unknown';

interface ActionDeps {
  getConfig: () => ExtensionsConfig;
  getDefinition: (id: ExtensionId) => ExtensionDefinition | undefined;
  setEnabled: (id: ExtensionId, enabled: boolean, consentAt?: string) => Promise<void>;
  now: () => string;
}

export interface UndoTargets {
  /** Reactivada: vuelve a abrir su apartado de Opciones. */
  reopen: (id: ExtensionId) => void;
  /** El aviso de R6 se borró entretanto ("Quitar configuración"): no se
   *  salta, se manda al catálogo, que lo pide. */
  needsConsent: (id: ExtensionId) => void;
}

export function createExtensionActions({ getConfig, getDefinition, setEnabled, now }: ActionDeps) {
  /** Activa, salvo que haga falta aceptar el aviso: entonces no cambia
   *  nada y la UI lo muestra. */
  const requestEnable = async (id: ExtensionId): Promise<EnableResult> => {
    const def = getDefinition(id);
    if (!def) return 'unknown';
    if (needsConsent(def, getConfig()[id])) return 'needs-consent';
    await setEnabled(id, true);
    return 'enabled';
  };
  /** La configuración se conserva; el ciclo de vida para sus procesos (R7). */
  const disable = (id: ExtensionId): Promise<void> => setEnabled(id, false);
  return {
    requestEnable,
    /** El usuario aceptó el aviso: se guarda la fecha y se activa. */
    acceptConsent: async (id: ExtensionId): Promise<void> => {
      if (!getDefinition(id)) return;
      await setEnabled(id, true, now());
    },
    disable,
    /** Desactivar desde su apartado de Opciones (R28) y devolver el
     *  "Deshacer" del aviso. Reactiva con `requestEnable`, así que no
     *  vuelve a pedir un aviso ya aceptado, pero tampoco salta uno que se
     *  borró después. */
    disableWithUndo: async (id: ExtensionId, targets: UndoTargets): Promise<() => Promise<EnableResult>> => {
      await disable(id);
      return async () => {
        const result = await requestEnable(id);
        if (result === 'enabled') targets.reopen(id);
        else if (result === 'needs-consent') targets.needsConsent(id);
        return result;
      };
    },
  };
}
