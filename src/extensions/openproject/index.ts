// Módulo de "OpenProject". Se carga con `import()` solo cuando la
// extensión está activa (specs/extensiones R16).
import { useAppStore } from '../../store/appStore';
import type { ExtensionModule } from '../types';
import { importFromOpenProject } from './importer';
import { OPENPROJECT_ID, readOpenProjectSettings } from './model';
import Settings from './Settings';

const AUTO_MS = 30 * 60 * 1000;

/** P7: con "Importar solo", al abrir la app y cada 30 minutos. */
function start(): () => void {
  const tick = () => {
    const s = readOpenProjectSettings(useAppStore.getState().extensions[OPENPROJECT_ID]?.settings);
    if (s.auto && s.account) void importFromOpenProject().catch(() => { /* queda en settings.last */ });
  };
  const first = setTimeout(tick, 5000);
  const timer = setInterval(tick, AUTO_MS);
  return () => { clearTimeout(first); clearInterval(timer); };
}

const openproject: ExtensionModule = { Settings, start };

export default openproject;
