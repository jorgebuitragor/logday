// Trae los eventos del mes visible y los pone en el Calendario (G4, G7), y
// los de hoy para la tarjeta de Inicio (G12). Aparte de index.ts para que
// el panel lo use sin importar el módulo entero.
import { create } from 'zustand';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { localISODate, nowInstant } from '../../lib/localDate';
import { useExternalEvents, type ExternalEvent } from '../externalEvents';
import { fetchCalendarEvents, toCalendarError, type CalendarCommandError } from './api';
import { GOOGLE_CALENDAR_ID, dayRange, parseGoogleEvent, rangeToInstants, readCalendarSettings, type SyncStatus } from './model';

export const REFRESH_MS = 10 * 60 * 1000;

export const useCalendarSync = create<{ status: SyncStatus }>(() => ({ status: { state: 'idle' } }));
const setStatus = (status: SyncStatus) => useCalendarSync.setState({ status });

/** Lo que trajo `refreshToday`: en memoria, como los del Calendario (G9),
 *  para que al volver a Inicio no se vea "cargando" otra vez. */
export interface HomeTodayState {
  /** El día de `events` (YYYY-MM-DD). */
  day: string | null;
  events: ExternalEvent[] | null;
  loading: boolean;
  /** El último error; `events` conserva lo de antes (G7). */
  error: CalendarCommandError | null;
}

const EMPTY_TODAY: HomeTodayState = { day: null, events: null, loading: false, error: null };
export const useHomeToday = create<HomeTodayState>(() => EMPTY_TODAY);
let todayGeneration = 0;

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
    if (a?.account !== b?.account || a?.clientId !== b?.clientId) {
      // Lo de hoy en Inicio era de la cuenta anterior.
      todayGeneration++;
      useHomeToday.setState(EMPTY_TODAY);
      void refreshGoogleCalendar();
    }
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
    useHomeToday.setState(EMPTY_TODAY);
    todayGeneration++;
    setStatus({ state: 'idle' });
  };
}

/** Los eventos de hoy para la tarjeta de Inicio (specs/extensiones R27),
 *  cuando el Calendario no tiene a la vista un rango con hoy. Es una
 *  consulta aparte: no cambia el `range` compartido ni los eventos del
 *  Calendario. Lanza el error de Rust tal cual (`toCalendarError`). */
export async function fetchToday(clientId: string, now = new Date()): Promise<ExternalEvent[]> {
  const range = dayRange(now);
  const { timeMin, timeMax } = rangeToInstants(range);
  const raw = await fetchCalendarEvents(clientId, timeMin, timeMax);
  const untitled = t(useAppStore.getState().language, 'googleCalendar', 'untitled');
  return raw.flatMap((e) => parseGoogleEvent(e, untitled)).filter((e) => e.date === range.from);
}

/** Pide los eventos de hoy y los deja en `useHomeToday`. Solo cuenta la
 *  última petición. */
export async function refreshToday(clientId: string, now = new Date()): Promise<void> {
  const day = localISODate(now);
  const mine = ++todayGeneration;
  useHomeToday.setState((s) => (s.day === day ? { loading: true } : { day, events: null, error: null, loading: true }));
  try {
    const events = await fetchToday(clientId, now);
    if (mine === todayGeneration) useHomeToday.setState({ day, events, loading: false, error: null });
  } catch (err) {
    if (mine === todayGeneration) useHomeToday.setState({ loading: false, error: toCalendarError(err) });
  }
}
