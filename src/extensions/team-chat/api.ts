// Comandos Rust de la extensión (src-tauri/src/extensions/team_chat.rs).
// El envío sale desde Rust (R17): el webview solo manda el proveedor y el
// texto, y la URL se lee del llavero.
import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { nowInstant } from '../../lib/localDate';
import {
  TEAM_CHAT_ID, readTeamChatSettings, sendsAsUser, toChatError,
  type ChatLastResult, type ChatProvider, type ChatSendError, type GoogleUserSettings, type TeamChatSettings,
} from './model';

/** R10: valida la URL para el proveedor, sin llamadas de red. `null` si vale. */
export async function validateWebhookUrl(provider: ChatProvider, url: string): Promise<ChatSendError | null> {
  try {
    await invoke('team_chat_validate_url', { provider, url });
    return null;
  } catch (err) {
    return toChatError(err);
  }
}

/** Envía el texto al webhook guardado. `null` si salió bien. */
export async function sendToChat(provider: ChatProvider, text: string): Promise<ChatSendError | null> {
  try {
    await invoke('team_chat_send', { provider, text });
    return null;
  } catch (err) {
    return toChatError(err);
  }
}

// ── "Como yo" en Google Chat (src-tauri/src/extensions/team_chat_google.rs) ──

/** C3, C4: abre el navegador para dar el permiso. Devuelve el correo de
 *  la cuenta, o el código de error. */
export async function connectGoogle(clientId: string): Promise<{ account: string } | { error: ChatSendError }> {
  try {
    return { account: await invoke<string>('team_chat_google_connect', { clientId }) };
  } catch (err) {
    return { error: toChatError(err) };
  }
}

/** C6: revoca el permiso y borra el token de renovación. */
export function disconnectGoogle(): Promise<void> {
  return invoke('team_chat_google_disconnect');
}

/** C8: el enlace del espacio → `spaces/<id>`, o el código de error. */
export async function parseSpaceLink(link: string): Promise<{ space: string } | { error: ChatSendError }> {
  try {
    return { space: await invoke<string>('team_chat_google_parse_space', { link }) };
  } catch (err) {
    return { error: toChatError(err) };
  }
}

async function sendAsUser(google: GoogleUserSettings | undefined, text: string): Promise<ChatSendError | null> {
  if (!google?.clientId || !google.space) return { code: 'needs_reconfig' };
  if (!google.account) return { code: 'needs_reconnect' };
  try {
    await invoke('team_chat_google_send', { clientId: google.clientId, space: google.space, text });
    return null;
  } catch (err) {
    return toChatError(err);
  }
}

/** Configuración de la extensión desde el store, y cómo cambiarla. */
export function useTeamChatSettings() {
  const { raw, update } = useAppStore(
    useShallow((s) => ({
      raw: s.extensions[TEAM_CHAT_ID]?.settings,
      update: s.updateExtensionSettings,
    })),
  );
  const settings: TeamChatSettings = readTeamChatSettings(raw);

  const save = useCallback(
    (patch: Partial<Record<keyof TeamChatSettings, unknown>>) => update(TEAM_CHAT_ID, patch),
    [update],
  );

  /** Envía y guarda el resultado como último envío (R21). */
  const send = useCallback(
    async (text: string, opts: { date?: string; test?: boolean }): Promise<ChatSendError | null> => {
      const current = readTeamChatSettings(useAppStore.getState().extensions[TEAM_CHAT_ID]?.settings);
      let error: ChatSendError | null;
      if (sendsAsUser(current)) {
        error = await sendAsUser(current.google, text);
      } else if (!current.provider || !current.hint) {
        error = { code: 'needs_reconfig' };
      } else {
        error = await sendToChat(current.provider, text);
      }
      const last: ChatLastResult = {
        sentAt: nowInstant(),
        status: error ? 'error' : 'ok',
        ...(opts.date ? { date: opts.date } : {}),
        ...(opts.test ? { test: true } : {}),
        ...(error ? { error } : {}),
      };
      await update(TEAM_CHAT_ID, { last });
      return error;
    },
    [update],
  );

  /** Cambia campos de `google` sin perder los demás (la configuración de
   *  la extensión se mezcla solo en el primer nivel). */
  const saveGoogle = useCallback(
    (patch: Partial<Record<keyof GoogleUserSettings, string | undefined>>) => {
      const current = readTeamChatSettings(useAppStore.getState().extensions[TEAM_CHAT_ID]?.settings).google ?? {};
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) next[k] = v;
      return update(TEAM_CHAT_ID, { google: next });
    },
    [update],
  );

  return { settings, save, saveGoogle, send };
}
