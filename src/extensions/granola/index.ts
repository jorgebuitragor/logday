// Módulo de "Granola". Se carga con `import()` solo cuando la extensión
// está activa (specs/extensiones R16).
import { useAppStore } from '../../store/appStore';
import type { ExtensionModule } from '../types';
import { importFromGranola } from './importer';
import { GRANOLA_ID, readGranolaSettings } from './model';
import Settings from './Settings';

const AUTO_MS = 30 * 60 * 1000;

/** N7: con "Importar solo", al abrir la app y cada 30 minutos. */
function start(): () => void {
  const tick = () => {
    const s = readGranolaSettings(useAppStore.getState().extensions[GRANOLA_ID]?.settings);
    if (s.auto && s.account) void importFromGranola().catch(() => { /* queda en settings.last */ });
  };
  const first = setTimeout(tick, 5000);
  const timer = setInterval(tick, AUTO_MS);
  return () => { clearTimeout(first); clearInterval(timer); };
}

const granola: ExtensionModule = { Settings, start };

export default granola;
