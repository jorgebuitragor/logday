// Módulo del Pomodoro (specs/pomodoro). Se carga con `import()` solo cuando
// la extensión está activa (specs/extensiones R16). `start` restaura el
// estado, lo sincroniza con Rust y escucha sus eventos; su parada lo limpia
// todo: el reloj, el contador del menú y la bandeja (PM13).
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../../store/appStore';
import type { ExtensionModule } from '../types';
import { EVT_FINISHED, EVT_TRAY_ACTION, POMODORO_ID } from './model';
import {
  activate, deactivate, handleFinish, refreshTaskInfo, skipPhase, syncNative, tick, togglePhase,
} from './store';
import HomeCard from './HomeCard';
import Settings from './Settings';
import SidebarStatus from './SidebarStatus';
import View from './View';

/** `listen` sin Tauri (el navegador) rechaza: sin eventos nativos, el fin
 *  lo detecta el reloj del frontend. */
function safeListen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  try {
    return listen<T>(event, ({ payload }) => handler(payload)).catch(() => () => {});
  } catch {
    return Promise.resolve(() => {});
  }
}

function start(): () => void {
  activate();
  const interval = window.setInterval(tick, 1000);
  // Al volver a la ventana, el reloj se pone al día enseguida (PM4).
  const onVisible = () => tick();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  const unlisteners = [
    safeListen<{ key: string }>(EVT_FINISHED, (p) => {
      if (p?.key) handleFinish(p.key, 'native');
      // Rust dejó de vigilar al disparar: se le reenvía el estado aunque
      // el fin no cambiara nada aquí (otra clave, ya terminada).
      syncNative(true);
    }),
    safeListen<string>(EVT_TRAY_ACTION, (action) => (action === 'skip' ? skipPhase() : togglePhase())),
  ];
  const unsubscribe = useAppStore.subscribe((s, prev) => {
    // Los textos de la bandeja y la notificación van en el idioma activo y
    // con las opciones actuales; `syncNative` no repite lo ya enviado.
    if (
      s.language !== prev.language
      || s.notificationsEnabled !== prev.notificationsEnabled
      || s.extensions[POMODORO_ID]?.settings !== prev.extensions[POMODORO_ID]?.settings
    ) syncNative();
    if (s.tasks !== prev.tasks) void refreshTaskInfo();
  });
  return () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    unsubscribe();
    for (const p of unlisteners) void p.then((fn) => fn());
    deactivate();
  };
}

const pomodoro: ExtensionModule = { View, Settings, SidebarStatus, HomeCard, start };

export default pomodoro;
