// Configuración, token y comandos de registro de la extensión MCP
// (specs/agentes-mcp). Sin React ni Tauri, para probarlo con vitest.

export const MCP_ID = 'mcp' as const;
export const TOKEN_SECRET_KEY = 'token';
export const DEFAULT_PORT = 47321;

export interface McpSettings {
  port: number;
  /** R12: apagado por defecto. */
  allowWrites: boolean;
  /** Pista del token guardado (de `ext_secret_set`), nunca el token. */
  hint?: string;
}

export function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535;
}

/** Lee la configuración guardada; lo que no valga toma el valor por defecto. */
export function readMcpSettings(raw: Record<string, unknown> | undefined): McpSettings {
  const port = raw?.port;
  return {
    port: isValidPort(port) ? port : DEFAULT_PORT,
    allowWrites: raw?.allowWrites === true,
    ...(typeof raw?.hint === 'string' && raw.hint ? { hint: raw.hint } : {}),
  };
}

/** R6: 32 bytes aleatorios en hex. */
export function generateToken(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  return Array.from(random(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const mcpUrl = (port: number) => `http://127.0.0.1:${port}/mcp`;

/** R7: lo que se copia para registrar el servidor en cada agente. */
export function setupCommands(port: number, token: string) {
  const url = mcpUrl(port);
  return {
    claudeCode: `claude mcp add --transport http logday ${url} --header "Authorization: Bearer ${token}"`,
    codex: `[mcp_servers.logday]\nurl = "${url}"\nhttp_headers = { Authorization = "Bearer ${token}" }`,
  };
}

export type McpServerStatus =
  | { state: 'stopped' }
  | { state: 'starting' }
  | { state: 'no_token' }
  | { state: 'listening'; port: number }
  | { state: 'port_in_use'; port: number }
  | { state: 'error'; message: string };

/** Errores de `mcp_server_start` → estado del panel (R3, R19). */
export function statusFromStartError(err: unknown, port: number): McpServerStatus {
  const code = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err);
  if (code === 'secret_not_found') return { state: 'no_token' };
  if (code === 'port_in_use') return { state: 'port_in_use', port };
  return { state: 'error', message: code };
}
