import { Bot, MessagesSquare } from 'lucide-react';
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
    secretKeys: ['webhook'],
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
];

const BY_ID = new Map(EXTENSIONS.map((def) => [def.id, def]));

export function getExtension(id: string): ExtensionDefinition | undefined {
  return BY_ID.get(id as ExtensionId);
}
