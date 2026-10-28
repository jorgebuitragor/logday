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

export function createExtensionActions({ getConfig, getDefinition, setEnabled, now }: ActionDeps) {
  return {
    /** Activa, salvo que haga falta aceptar el aviso: entonces no cambia
     *  nada y la UI lo muestra. */
    requestEnable: async (id: ExtensionId): Promise<EnableResult> => {
      const def = getDefinition(id);
      if (!def) return 'unknown';
      if (needsConsent(def, getConfig()[id])) return 'needs-consent';
      await setEnabled(id, true);
      return 'enabled';
    },
    /** El usuario aceptó el aviso: se guarda la fecha y se activa. */
    acceptConsent: async (id: ExtensionId): Promise<void> => {
      if (!getDefinition(id)) return;
      await setEnabled(id, true, now());
    },
    /** La configuración se conserva; el ciclo de vida para sus procesos (R7). */
    disable: (id: ExtensionId): Promise<void> => setEnabled(id, false),
  };
}
