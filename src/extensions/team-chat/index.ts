// Módulo de "Chat del equipo" (team-chat). Se carga con `import()` solo
// cuando la extensión está activa (specs/extensiones R16).
import type { ExtensionModule } from '../types';
import Settings from './Settings';
import SendToChatButton from './SendToChatButton';

// Sin `start`: el envío programado (fase 4 de daily-al-chat) todavía no
// existe, así que no hay procesos propios que parar.
const teamChat: ExtensionModule = {
  Settings,
  dailyActions: SendToChatButton,
};

export default teamChat;
