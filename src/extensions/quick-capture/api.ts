// Comandos Rust de la captura rápida (src-tauri/src/extensions/quick_capture.rs)
// y el estado del registro del atajo, que muestra el panel (C3).
import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { t } from '../../lib/i18n';
import { useAppStore } from '../../store/appStore';
import { isMacPlatform, prettyShortcut } from './model';

/** `ok`, o el código de Rust: `invalid`, `taken`, `unsupported`. */
export type RegistrationStatus = { shortcut: string; result: 'ok' | 'invalid' | 'taken' | 'unsupported' | 'unknown' } | null;

let status: RegistrationStatus = null;
const listeners = new Set<() => void>();

function setStatus(next: RegistrationStatus) {
  status = next;
  listeners.forEach((fn) => fn());
}

export function useRegistrationStatus(): RegistrationStatus {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => status,
  );
}

export function shortcutLabel(shortcut: string): string {
  const lang = useAppStore.getState().language;
  return prettyShortcut(shortcut, isMacPlatform(), t(lang, 'quickCapture', 'keySpace'));
}

/** Registra el atajo (C1) y deja la entrada de la bandeja (C4). Nunca
 *  lanza: devuelve el resultado, que también queda para el panel, salvo
 *  con `keepStatus` (al volver al atajo anterior tras un fallo). */
export async function configureShortcut(
  shortcut: string,
  opts: { keepStatus?: boolean } = {},
): Promise<NonNullable<RegistrationStatus>['result']> {
  const lang = useAppStore.getState().language;
  let result: NonNullable<RegistrationStatus>['result'] = 'ok';
  try {
    await invoke('quick_capture_configure', {
      shortcut,
      label: t(lang, 'quickCapture', 'trayLabel'),
      pretty: shortcutLabel(shortcut),
    });
  } catch (err) {
    result = err === 'invalid' || err === 'taken' || err === 'unsupported' ? err : 'unknown';
    if (result === 'unknown') console.error('[captura rápida]', err);
  }
  if (!opts.keepStatus) setStatus({ shortcut, result });
  return result;
}

export async function disableQuickCapture(): Promise<void> {
  setStatus(null);
  await invoke('quick_capture_disable').catch((err) => console.error('[captura rápida]', err));
}
