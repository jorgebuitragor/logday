// "Google Calendar" (specs/google-calendar). Lógica sin React ni Tauri:
// la configuración no secreta y cómo se convierten los eventos de Google
// en eventos externos del Calendario de Logday.
import { localISODate } from '../../lib/localDate';
import type { DateRange, ExternalEvent } from '../externalEvents';

export const GOOGLE_CALENDAR_ID = 'google-calendar' as const;
export const CLIENT_SECRET_KEY = 'google_client_secret';
/** Más días que esto no se expanden (un evento de todo el día muy largo). */
const MAX_ALL_DAY_SPAN = 62;

export interface CalendarSettings {
  clientId?: string;
  /** Pista del secreto del cliente guardado. */
  secretHint?: string;
  /** Correo de la cuenta conectada (G3). */
  account?: string;
}

export function readCalendarSettings(raw: Record<string, unknown> | undefined): CalendarSettings {
  const out: CalendarSettings = {};
  for (const key of ['clientId', 'secretHint', 'account'] as const) {
    const v = raw?.[key];
    if (typeof v === 'string' && v) out[key] = v;
  }
  return out;
}

/** Un evento tal como lo deja `slim_events` en Rust. */
export interface GoogleEvent {
  id?: string | null;
  summary?: string | null;
  start?: { date?: string; dateTime?: string } | null;
  end?: { date?: string; dateTime?: string } | null;
  htmlLink?: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function addDays(date: string, days: number): string {
  const [, y, m, d] = DAY.exec(date)!;
  return localISODate(new Date(Number(y), Number(m) - 1, Number(d) + days));
}

/** G6, G8: un evento de Google → uno o más eventos externos en hora
 *  local. Los de todo el día que duran varios días van en cada día
 *  (`end.date` es exclusivo). */
export function parseGoogleEvent(e: GoogleEvent, untitled: string): ExternalEvent[] {
  if (!e.id) return [];
  const base = {
    id: e.id,
    source: GOOGLE_CALENDAR_ID,
    title: e.summary?.trim() || untitled,
    ...(e.htmlLink?.startsWith('https://') ? { url: e.htmlLink } : {}),
  };
  if (e.start?.dateTime) {
    const start = new Date(e.start.dateTime);
    if (Number.isNaN(start.getTime())) return [];
    return [{ ...base, date: localISODate(start), time: `${pad(start.getHours())}:${pad(start.getMinutes())}` }];
  }
  const first = e.start?.date;
  if (!first || !DAY.test(first)) return [];
  const end = e.end?.date && DAY.test(e.end.date) ? e.end.date : addDays(first, 1);
  const out: ExternalEvent[] = [];
  for (let day = first, i = 0; day < end && i < MAX_ALL_DAY_SPAN; day = addDays(day, 1), i++) {
    out.push({ ...base, date: day, time: '' });
  }
  return out;
}

/** El rango del Calendario (días locales) → instantes para la API. */
export function rangeToInstants(range: DateRange): { timeMin: string; timeMax: string } {
  const at = (date: string) => {
    const [, y, m, d] = DAY.exec(date)!;
    return new Date(Number(y), Number(m) - 1, Number(d)).toISOString();
  };
  return { timeMin: at(range.from), timeMax: at(range.to) };
}

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; at: string; count: number }
  | { state: 'error'; code: string; status?: number | null };

// ─── Tarjeta de Inicio (specs/extensiones R27) ───

/** "Mostrar en Inicio", encendido por defecto. Va en los mismos
 *  `settings` locales que el resto. */
export const showsOnHome = (raw: Record<string, unknown> | undefined) => raw?.showOnHome !== false;

/** El día local de `now` como rango de un día (`to` excluido). */
export function dayRange(now: Date): DateRange {
  const from = localISODate(now);
  return { from, to: addDays(from, 1) };
}

export const rangeIncludes = (range: DateRange | null, day: string) => !!range && range.from <= day && day < range.to;

export interface HomeAgenda {
  /** Hasta `max` eventos: los de todo el día primero y luego por hora. */
  rows: ExternalEvent[];
  /** Posición en `rows` del primero con hora desde ahora ("Siguiente"),
   *  o -1. */
  next: number;
  /** Los que no caben. */
  more: number;
}

/** Los eventos de `day` para la tarjeta. `nowTime` es la hora local
 *  (HH:MM) para marcar el siguiente. */
export function homeAgenda(events: readonly ExternalEvent[], day: string, nowTime: string, max = 5): HomeAgenda {
  const today = events
    .filter((e) => e.date === day)
    .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  const rows = today.slice(0, max);
  return { rows, next: rows.findIndex((e) => e.time !== '' && e.time >= nowTime), more: Math.max(0, today.length - max) };
}
