import { Bot, CalendarDays, MessagesSquare, NotebookPen, PenTool, Webhook } from 'lucide-react';
import type { ExtensionDefinition, ExtensionId } from './types';

/** Extensiones que implementa Desktop (R4). Solo metadatos: el código de
 *  cada una se carga con `import()` cuando se activa (R16). Los textos
 *  van en `i18n.ts`, sección `extensions`, claves `<id>.*`. */
export const EXTENSIONS: readonly ExtensionDefinition[] = [
  {
    id: 'team-chat',
    category: 'integration',
    icon: MessagesSquare,
    apps: ['desktop'],
    sendsDataExternally: { to: 'Google Chat, Slack, Microsoft Teams' },
    // "Quitar configuración" borra también lo de "como yo" (specs/chat-como-usuario).
    secretKeys: ['webhook', 'google_client_secret', 'google_refresh'],
    settings: true,
    load: () => import('./team-chat').then((m) => m.default),
  },
  {
    id: 'mcp',
    category: 'integration',
    icon: Bot,
    apps: ['desktop'],
    // Lo que lee el agente llega al proveedor de su modelo (specs/agentes-mcp).
    sendsDataExternally: { to: 'Claude Code, Codex' },
    secretKeys: ['token'],
    settings: true,
    load: () => import('./mcp').then((m) => m.default),
  },
  {
    id: 'google-calendar',
    category: 'integration',
    icon: CalendarDays,
    apps: ['desktop'],
    // Solo lee de Google (specs/google-calendar): no envía datos de Logday,
    // así que no lleva el aviso de R6; el permiso se da al conectar.
    secretKeys: ['google_client_secret', 'google_refresh'],
    settings: true,
    load: () => import('./google-calendar').then((m) => m.default),
  },
  {
    id: 'outgoing-webhook',
    category: 'integration',
    icon: Webhook,
    apps: ['desktop'],
    // W11: manda datos de Logday a un servicio que elige el usuario.
    sendsDataExternally: { to: 'n8n / webhook' },
    secretKeys: ['url', 'secret'],
    settings: true,
    load: () => import('./outgoing-webhook').then((m) => m.default),
  },
  {
    id: 'granola',
    category: 'integration',
    icon: NotebookPen,
    apps: ['desktop'],
    // Solo trae de Granola (specs/granola): no envía datos de Logday, así
    // que no lleva el aviso de R6; el permiso se da al conectar.
    secretKeys: ['refresh', 'client'],
    settings: true,
    load: () => import('./granola').then((m) => m.default),
  },
  {
    id: 'excalidraw',
    category: 'tool',
    icon: PenTool,
    apps: ['desktop'],
    // R24: sus dibujos van en bloques ```excalidraw dentro de las notas.
    noteBlock: { language: 'excalidraw' },
    load: () => import('./excalidraw').then((m) => m.default),
  },
];

const BY_ID = new Map(EXTENSIONS.map((def) => [def.id, def]));

export function getExtension(id: string): ExtensionDefinition | undefined {
  return BY_ID.get(id as ExtensionId);
}
