// Comandos Rust de Google Calendar (src-tauri/src/extensions/google_calendar.rs).
import { invoke } from '@tauri-apps/api/core';
import type { GoogleEvent } from './model';

export interface CalendarCommandError {
  code: string;
  status?: number | null;
}

export function toCalendarError(err: unknown): CalendarCommandError {
  if (typeof err === 'string') return { code: err };
  if (err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string') {
    const e = err as { code: string; status?: unknown };
    return { code: e.code, status: typeof e.status === 'number' ? e.status : null };
  }
  return { code: 'unknown' };
}

export const connectCalendar = (clientId: string) => invoke<string>('google_calendar_connect', { clientId });
export const disconnectCalendar = () => invoke<void>('google_calendar_disconnect');
/** G1: copia el secreto de Chat del equipo dentro de Rust. */
export const copyClientFromTeamChat = () => invoke<void>('google_calendar_copy_client');
export const fetchCalendarEvents = (clientId: string, timeMin: string, timeMax: string) =>
  invoke<GoogleEvent[]>('google_calendar_events', { clientId, timeMin, timeMax });
