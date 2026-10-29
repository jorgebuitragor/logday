// Secretos de las extensiones en el llavero del SO (R10). El webview solo
// escribe y borra: no hay un `get`, quien usa el secreto es el comando
// Rust de cada extensión (src-tauri/src/extensions/).
import { invoke } from '@tauri-apps/api/core';
import type { ExtensionId } from './types';

/** Guarda el secreto y devuelve su pista (host y últimos 4 caracteres). */
export function setExtensionSecret(id: ExtensionId, key: string, value: string): Promise<string> {
  return invoke('ext_secret_set', { id, key, value });
}

export function clearExtensionSecret(id: ExtensionId, key: string): Promise<void> {
  return invoke('ext_secret_clear', { id, key });
}

/** La pista del secreto guardado, o `null` si no hay ninguno. */
export function getExtensionSecretHint(id: ExtensionId, key: string): Promise<string | null> {
  return invoke('ext_secret_hint', { id, key });
}
