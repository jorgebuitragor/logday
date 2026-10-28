// Comandos Rust de la extensión (src-tauri/src/extensions/team_chat.rs).
// El envío sale desde Rust (R17): el webview solo manda el proveedor y el
// texto, y la URL se lee del llavero.
import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { nowInstant } from '../../lib/localDate';
import {
  TEAM_CHAT_ID, readTeamChatSettings, toChatError,
  type ChatLastResult, type ChatProvider, type ChatSendError, type TeamChatSettings,
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
      if (!current.provider || !current.hint) return { code: 'needs_reconfig' };
      const error = await sendToChat(current.provider, text);
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

  return { settings, save, send };
}
