// Módulo de Skills de agentes (specs/skills-de-agentes). Se carga con
// `import()` solo cuando la extensión está activa (specs/extensiones R16).
import type { ExtensionModule } from '../types';
import AgentSkillsView from './View';
import AgentSkillsSettings from './Settings';
import { useAgentSkills } from './store';

const agentSkills: ExtensionModule = {
  View: AgentSkillsView,
  Settings: AgentSkillsSettings,
  // No hay procesos propios: al desactivarla se olvida la lista leída.
  start: () => () => useAgentSkills.getState().reset(),
};

export default agentSkills;
