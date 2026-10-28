// Trae los eventos del mes visible y los pone en el Calendario (G4, G7).
// Aparte de index.ts para que el panel lo use sin importar el módulo entero.
import { create } from 'zustand';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { nowInstant } from '../../lib/localDate';
import { useExternalEvents } from '../externalEvents';
import { fetchCalendarEvents, toCalendarError } from './api';
import { GOOGLE_CALENDAR_ID, parseGoogleEvent, rangeToInstants, readCalendarSettings, type SyncStatus } from './model';

const REFRESH_MS = 10 * 60 * 1000;

export const useCalendarSync = create<{ status: SyncStatus }>(() => ({ status: { state: 'idle' } }));
const setStatus = (status: SyncStatus) => useCalendarSync.setState({ status });

const currentSettings = () => readCalendarSettings(useAppStore.getState().extensions[GOOGLE_CALENDAR_ID]?.settings);

let running = false;
// Solo cuenta la respuesta de la última petición: si el usuario cambia de
// mes rápido, una respuesta vieja no pisa la nueva.
let generation = 0;

export async function refreshGoogleCalendar(): Promise<void> {
  if (!running) return;
  const { clientId, account } = currentSettings();
  const range = useExternalEvents.getState().range;
  if (!clientId || !account) {
    useExternalEvents.getState().clearSource(GOOGLE_CALENDAR_ID);
    setStatus({ state: 'idle' });
    return;
  }
  if (!range) return;
  const mine = ++generation;
  setStatus({ state: 'loading' });
  try {
    const { timeMin, timeMax } = rangeToInstants(range);
    const raw = await fetchCalendarEvents(clientId, timeMin, timeMax);
    if (mine !== generation || !running) return;
    const untitled = t(useAppStore.getState().language, 'googleCalendar', 'untitled');
    const events = raw.flatMap((e) => parseGoogleEvent(e, untitled));
    useExternalEvents.getState().setSource(GOOGLE_CALENDAR_ID, events);
    setStatus({ state: 'ok', at: nowInstant(), count: events.length });
  } catch (err) {
    // G7: se quedan los últimos eventos; el panel muestra el error.
    if (mine === generation) setStatus({ state: 'error', ...toCalendarError(err) });
  }
}

export function startGoogleCalendar(): () => void {
  running = true;
  const unsubRange = useExternalEvents.subscribe((s, prev) => {
    if (s.range !== prev.range) void refreshGoogleCalendar();
  });
  // Al conectar o desconectar desde el panel.
  const unsubSettings = useAppStore.subscribe((s, prev) => {
    const a = s.extensions[GOOGLE_CALENDAR_ID]?.settings;
    const b = prev.extensions[GOOGLE_CALENDAR_ID]?.settings;
    if (a?.account !== b?.account || a?.clientId !== b?.clientId) void refreshGoogleCalendar();
  });
  const timer = setInterval(() => void refreshGoogleCalendar(), REFRESH_MS);
  void refreshGoogleCalendar();
  return () => {
    running = false;
    generation++;
    clearInterval(timer);
    unsubRange();
    unsubSettings();
    useExternalEvents.getState().clearSource(GOOGLE_CALENDAR_ID);
    setStatus({ state: 'idle' });
  };
}
