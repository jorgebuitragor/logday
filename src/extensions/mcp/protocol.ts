// JSON-RPC y métodos MCP (specs/agentes-mcp R16, R17). Recibe el cuerpo
// tal como llegó a Rust y devuelve la respuesta, o `null` para una
// notificación (Rust contesta 202 sin cuerpo).
import { ToolError, type LogdayToolDeps, type ToolDef } from './tools';

/** La primera es la que se ofrece si el cliente pide otra. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

export interface McpContext {
  tools: readonly ToolDef[];
  deps: LogdayToolDeps;
  /** "Permitir cambios" (R11, R12), leído en cada petición. */
  allowWrites: () => boolean;
  serverVersion: string;
}

type Id = string | number | null;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const result = (id: Id, value: unknown) => JSON.stringify({ jsonrpc: '2.0', id, result: value });
const failure = (id: Id, code: number, message: string) =>
  JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const toolResult = (text: string, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });

function visibleTools(ctx: McpContext): readonly ToolDef[] {
  return ctx.allowWrites() ? ctx.tools : ctx.tools.filter((t) => !t.write);
}

async function callTool(ctx: McpContext, id: Id, params: Record<string, unknown>): Promise<string> {
  const name = params.name;
  const args = params.arguments ?? {};
  if (typeof name !== 'string' || !isObject(args)) return failure(id, INVALID_PARAMS, 'Invalid tools/call params');
  const tool = ctx.tools.find((t) => t.name === name);
  if (!tool) return failure(id, INVALID_PARAMS, `Unknown tool: ${name}`);
  // R12: aunque no aparezca en la lista, un cliente podría llamarla igual.
  if (tool.write && !ctx.allowWrites()) {
    return result(id, toolResult('Changes are disabled in Logday. Turn on "Allow changes" in Settings → Extensions → AI agents (MCP).', true));
  }
  try {
    const out = await tool.run(args, ctx.deps);
    return result(id, toolResult(JSON.stringify(out, null, 2)));
  } catch (err) {
    const message = err instanceof ToolError ? err.message : `Internal error: ${err instanceof Error ? err.message : String(err)}`;
    return result(id, toolResult(message, true));
  }
}

export async function handleMcpMessage(raw: string, ctx: McpContext): Promise<string | null> {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return failure(null, PARSE_ERROR, 'Parse error');
  }
  // Los lotes (arreglos) se quitaron en la versión 2025-06-18.
  if (!isObject(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    const id = isObject(msg) && (typeof msg.id === 'string' || typeof msg.id === 'number') ? msg.id : null;
    return failure(id, INVALID_REQUEST, 'Invalid request');
  }
  // Sin id es una notificación: no lleva respuesta (incluida
  // notifications/initialized).
  if (!('id' in msg) || msg.id === undefined) return null;
  const id = msg.id as Id;
  const params = isObject(msg.params) ? msg.params : {};

  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = params.protocolVersion;
        const version = SUPPORTED_PROTOCOL_VERSIONS.find((v) => v === asked) ?? SUPPORTED_PROTOCOL_VERSIONS[0];
        return result(id, {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'logday', version: ctx.serverVersion },
          instructions:
            'Logday is the user\'s personal task manager and daily log. Dates are local calendar dates (YYYY-MM-DD). ' +
            'Write tools only appear when the user allows changes in Logday.',
        });
      }
      case 'ping':
        return result(id, {});
      case 'tools/list':
        return result(id, {
          tools: visibleTools(ctx).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: !t.write, destructiveHint: false },
          })),
        });
      case 'tools/call':
        return await callTool(ctx, id, params);
      default:
        return failure(id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
    }
  } catch (err) {
    return failure(id, INTERNAL_ERROR, err instanceof Error ? err.message : String(err));
  }
}
