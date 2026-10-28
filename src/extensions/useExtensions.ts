import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { nowInstant } from '../lib/localDate';
import { EXTENSIONS, getExtension } from './registry';
import { extensionRuntime } from './runtime';
import { enabledExtensions, isExtensionEnabled } from './state';
import { createExtensionActions } from './actions';
import type { ExtensionId } from './types';

/** Extensiones de Desktop, cuáles están activas y cómo activarlas. */
export function useExtensions() {
  const { extensions, setExtensionEnabled } = useAppStore(
    useShallow((s) => ({ extensions: s.extensions, setExtensionEnabled: s.setExtensionEnabled })),
  );
  const actions = useMemo(
    () => createExtensionActions({
      getConfig: () => useAppStore.getState().extensions,
      getDefinition: getExtension,
      setEnabled: setExtensionEnabled,
      now: nowInstant,
    }),
    [setExtensionEnabled],
  );
  const enabled = useMemo(() => enabledExtensions(extensions, EXTENSIONS), [extensions]);
  return {
    all: EXTENSIONS,
    enabled,
    prefs: (id: ExtensionId) => extensions[id],
    isEnabled: (id: ExtensionId) => isExtensionEnabled(extensions, id),
    ...actions,
  };
}

/** Arranca y para los procesos propios de las extensiones según estén
 *  activas (R7). Se monta una vez, en App. */
export function useExtensionLifecycle() {
  const extensions = useAppStore((s) => s.extensions);
  const key = enabledExtensions(extensions, EXTENSIONS).map((d) => d.id).join(',');
  useEffect(() => {
    const ids = (key ? key.split(',') : []) as ExtensionId[];
    void extensionRuntime.sync(ids);
  }, [key]);
  useEffect(() => () => extensionRuntime.stopAll(), []);
}
