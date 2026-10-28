// Módulo de "Agentes de IA (MCP)". Se carga con `import()` solo cuando la
// extensión está activa (specs/extensiones R16).
import type { ExtensionModule } from '../types';
import { startMcpServer } from './server';
import Settings from './Settings';

const mcp: ExtensionModule = { Settings, start: startMcpServer };

export default mcp;
