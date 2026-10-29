// Módulo de "OpenProject". Se carga con `import()` solo cuando la
// extensión está activa (specs/extensiones R16).
import { useAppStore } from '../../store/appStore';
import { onAppEvent } from '../../lib/appEvents';
import type { ExtensionModule } from '../types';
import { importFromOpenProject } from './importer';
import { OPENPROJECT_ID, readOpenProjectSettings } from './model';
import { flushPending, onTaskUpdated } from './pusher';
import Settings from './Settings';

const AUTO_MS = 30 * 60 * 1000;

/** P7: con "Importar solo", al abrir la app y cada 30 minutos. P12: también
 *  escucha los cambios de tareas para enviarlos, y reintenta lo pendiente. */
function start(): () => void {
  const tick = () => {
    const s = readOpenProjectSettings(useAppStore.getState().extensions[OPENPROJECT_ID]?.settings);
    if (!s.account) return;
    if (s.writeBack && Object.keys(s.pending).length) void flushPending().catch(() => { /* queda en settings.lastPush */ });
    if (s.auto) void importFromOpenProject().catch(() => { /* queda en settings.last */ });
  };
  const first = setTimeout(tick, 5000);
  const timer = setInterval(tick, AUTO_MS);
  const off = onAppEvent((e) => {
    if (e.type === 'task.updated') void onTaskUpdated(e.prev, e.next).catch(() => { /* queda en settings.lastPush */ });
  });
  return () => { clearTimeout(first); clearInterval(timer); off(); };
}

const openproject: ExtensionModule = { Settings, start };

export default openproject;
