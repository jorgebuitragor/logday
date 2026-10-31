import { Bot, CalendarDays, ClipboardList, Globe, Hourglass, MessagesSquare, NotebookPen, PenTool, Webhook, Wrench, Zap } from 'lucide-react';
import type { ExtensionDefinition, ExtensionId } from './types';
import { httpClientSecretKeys } from './http-client/secretKeys';

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
    id: 'openproject',
    category: 'integration',
    icon: ClipboardList,
    apps: ['desktop'],
    // Solo trae de OpenProject (specs/openproject): no envía datos de
    // Logday, así que no lleva el aviso de R6. Va en Desktop porque el
    // OpenProject de la empresa solo se alcanza desde la red interna.
    secretKeys: ['url', 'token'],
    settings: true,
    load: () => import('./openproject').then((m) => m.default),
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
  {
    id: 'quick-capture',
    category: 'tool',
    icon: Zap,
    apps: ['desktop'],
    // C19: no envía nada fuera del equipo, así que no lleva el aviso de R6.
    settings: true,
    load: () => import('./quick-capture').then((m) => m.default),
  },
  {
    id: 'devtools',
    category: 'tool',
    icon: Wrench,
    apps: ['desktop'],
    // D11: todo corre en el equipo, así que no lleva el aviso de R6.
    view: true,
    // D17: la página con el orden y la visibilidad de las herramientas.
    settings: true,
    load: () => import('./devtools').then((m) => m.default),
  },
  {
    id: 'pomodoro',
    category: 'tool',
    // Reloj de arena, no `Timer`: `Timer` ya es Horas extra (design §1).
    icon: Hourglass,
    apps: ['desktop'],
    // PM14: no envía nada fuera del equipo, así que no lleva el aviso de R6.
    view: true,
    settings: true,
    // PM10: el contador del menú lateral.
    sidebarStatus: true,
    load: () => import('./pomodoro').then((m) => m.default),
  },
  {
    id: 'http-client',
    category: 'tool',
    // `Globe`: no lo usa otra extensión; `Send` queda para el botón Enviar.
    icon: Globe,
    apps: ['desktop'],
    // HT2: envía lo que el usuario escribe a la URL que escribe, y solo
    // cuando pulsa Enviar. Es la excepción de R17: el host lo pone él.
    sendsDataExternally: { to: 'URLs del usuario' },
    // HT33: su pantalla, con las peticiones de todas las notas y el
    // formulario (Jorge, 31 oct 2026: antes era una herramienta de DevTools).
    view: true,
    settings: true,
    // HT4: el código se edita en la nota; la extensión pone la barra y la
    // respuesta (specs/cliente-http, design A3).
    noteBlock: { language: 'http', inline: true, template: 'GET https://example.com\nAccept: */*\n' },
    // HT22: una clave del llavero por variable secreta.
    dynamicSecretKeys: httpClientSecretKeys,
    load: () => import('./http-client').then((m) => m.default),
  },
];

const BY_ID = new Map(EXTENSIONS.map((def) => [def.id, def]));

export function getExtension(id: string): ExtensionDefinition | undefined {
  return BY_ID.get(id as ExtensionId);
}
