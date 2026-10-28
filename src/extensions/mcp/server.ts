// Ciclo de vida del servidor MCP y su estado para el panel
// (specs/agentes-mcp R1–R4, R19). Aparte de index.ts para que el panel lo
// use sin importar el módulo entero.
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { useAppStore } from '../../store/appStore';
import { handleMcpMessage } from './protocol';
import { LOGDAY_TOOLS } from './tools';
import { storeToolDeps } from './storeTools';
import { MCP_ID, readMcpSettings, statusFromStartError, type McpServerStatus } from './model';

/** Estado del servidor para el panel (R19). */
export const useMcpStatus = create<{ status: McpServerStatus }>(() => ({ status: { state: 'stopped' } }));
const setStatus = (status: McpServerStatus) => useMcpStatus.setState({ status });

const currentSettings = () => readMcpSettings(useAppStore.getState().extensions[MCP_ID]?.settings);

let running = false;
let serverVersion = '';

/** Abre el servidor con la configuración actual, o lo cierra si no hay
 *  token. Lo usa el panel al cambiar el puerto o el token (R4). */
export async function restartMcpServer(): Promise<void> {
  if (!running) return;
  const { port, hint } = currentSettings();
  if (!hint) {
    await invoke('mcp_server_stop');
    setStatus({ state: 'no_token' });
    return;
  }
  try {
    await invoke('mcp_server_start', { port });
    setStatus({ state: 'listening', port });
  } catch (err) {
    setStatus(statusFromStartError(err, port));
  }
}

export function startMcpServer(): () => void {
  running = true;
  void getVersion().then((v) => { serverVersion = v; }).catch(() => {});
  const ctx = {
    tools: LOGDAY_TOOLS,
    deps: storeToolDeps,
    // Se lee en cada petición: cambiar el interruptor no reinicia nada.
    allowWrites: () => currentSettings().allowWrites,
    get serverVersion() { return serverVersion; },
  };
  const unlisten = listen<{ id: number; body: string }>('mcp://request', async ({ payload }) => {
    let body: string | null;
    try {
      body = await handleMcpMessage(payload.body, ctx);
    } catch (err) {
      body = JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: String(err) } });
    }
    await invoke('mcp_reply', { id: payload.id, body });
  });
  // Se escucha antes de abrir el puerto, para no perder la primera petición.
  void unlisten.then(() => restartMcpServer());

  return () => {
    running = false;
    void unlisten.then((fn) => fn());
    void invoke('mcp_server_stop');
    setStatus({ state: 'stopped' });
  };
}
