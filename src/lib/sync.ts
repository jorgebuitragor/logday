import { syncRequest } from './invoke';
import {
  TaskCreatePayload, TaskPatchPayload, TaskApiResponse,
  NoteCreatePayload, NotePatchPayload, NoteApiResponse,
  OvertimeEntryCreatePayload, OvertimeEntryPatchPayload, OvertimeEntryApiResponse,
  OvertimeMonthMetaPatchPayload, OvertimeMonthMetaApiResponse,
  CalendarEventCreatePayload, CalendarEventPatchPayload, CalendarEventApiResponse,
  AbsenceDayCreatePayload, AbsenceDayPatchPayload, AbsenceDayApiResponse,
  DailyEntryApiResponse,
} from './syncMapping';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  device_id: string;
}

export type SyncEntityType =
  | 'task' | 'note' | 'overtime_entry' | 'overtime_month_meta'
  | 'calendar_event' | 'absence_day' | 'daily_entry';

export interface SyncChange {
  type: SyncEntityType;
  id: string;
  seq: number;
  deleted: boolean;
  updated_at: string;
  data: unknown; // fila completa de la entidad, shape = *ApiResponse de syncMapping.ts
}

export class SyncApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Prepends http:// if the user didn't type a scheme — reqwest (Rust)
 *  requires an absolute URL, and typing e.g. "localhost:8080" without
 *  one is the natural thing for someone to type in this field. */
export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

async function request<T>(
  baseUrl: string,
  method: string,
  path: string,
  opts?: { token?: string; body?: unknown },
): Promise<T> {
  const res = await syncRequest({
    baseUrl: normalizeServerUrl(baseUrl),
    method,
    path,
    token: opts?.token,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new SyncApiError(res.status, res.body || `HTTP ${res.status}`);
  }
  return res.body ? (JSON.parse(res.body) as T) : (undefined as T);
}

export function login(
  baseUrl: string,
  email: string,
  password: string,
  deviceName?: string,
): Promise<TokenResponse> {
  return request<TokenResponse>(baseUrl, 'POST', '/auth/login', {
    body: { email, password, device_name: deviceName },
  });
}

export function refreshToken(baseUrl: string, refreshTokenValue: string): Promise<TokenResponse> {
  return request<TokenResponse>(baseUrl, 'POST', '/auth/refresh', {
    body: { refresh_token: refreshTokenValue },
  });
}

export interface DeviceResponse {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string;
}

export function listDevicesRemote(baseUrl: string, token: string): Promise<DeviceResponse[]> {
  return request(baseUrl, 'GET', '/devices', { token });
}

export function revokeDeviceRemote(baseUrl: string, token: string, id: string): Promise<void> {
  return request(baseUrl, 'DELETE', `/devices/${id}`, { token });
}

/** since=0 (u omitido) trae el historial completo — usado tanto para
 *  el pull incremental normal como para el full resync tras un cursor
 *  inválido (410, ver appStore.ts reconcileSync). */
export function syncChangesRemote(baseUrl: string, token: string, since: number): Promise<SyncChange[]> {
  return request(baseUrl, 'GET', `/sync/changes?since=${since}`, { token });
}

// ─── Task ───

export function createTaskRemote(baseUrl: string, token: string, payload: TaskCreatePayload): Promise<TaskApiResponse> {
  return request(baseUrl, 'POST', '/tasks', { token, body: payload });
}
export function patchTaskRemote(baseUrl: string, token: string, id: string, payload: TaskPatchPayload): Promise<TaskApiResponse> {
  return request(baseUrl, 'PATCH', `/tasks/${id}`, { token, body: payload });
}
export function deleteTaskRemote(baseUrl: string, token: string, id: string): Promise<void> {
  return request(baseUrl, 'DELETE', `/tasks/${id}`, { token });
}

// ─── Note (metadata) ───

export function createNoteRemote(baseUrl: string, token: string, payload: NoteCreatePayload): Promise<NoteApiResponse> {
  return request(baseUrl, 'POST', '/notes', { token, body: payload });
}
export function patchNoteRemote(baseUrl: string, token: string, id: string, payload: NotePatchPayload): Promise<NoteApiResponse> {
  return request(baseUrl, 'PATCH', `/notes/${id}`, { token, body: payload });
}
export function deleteNoteRemote(baseUrl: string, token: string, id: string): Promise<void> {
  return request(baseUrl, 'DELETE', `/notes/${id}`, { token });
}

// ─── Note (content, CRDT) ───
// Canal separado del PATCH de metadata (LWW) de arriba — ver
// specs/sync-servidor/design.md "CRDT: Note.content..." y, para el
// contrato exacto (verificado contra la implementación real, no solo el
// spec), logday-web/src/lib/api.ts `postNoteContent`: el body va como
// `content_update` (no `update`) + `updated_at`, y la respuesta es la fila
// completa de la nota (mismo shape que create/patch), no un objeto angosto
// — el servidor mergea el update Yjs (nunca lo rechaza por antigüedad, los
// updates conmutan) y devuelve el `content`/`content_state` ya resultante.
export function pushNoteContentRemote(baseUrl: string, token: string, id: string, updateB64: string): Promise<NoteApiResponse> {
  return request(baseUrl, 'POST', `/notes/${id}/content`, {
    token,
    body: { content_update: updateB64, updated_at: new Date().toISOString() },
  });
}

// ─── OvertimeEntry ───

export function createOvertimeEntryRemote(baseUrl: string, token: string, payload: OvertimeEntryCreatePayload): Promise<OvertimeEntryApiResponse> {
  return request(baseUrl, 'POST', '/overtime-entries', { token, body: payload });
}
export function patchOvertimeEntryRemote(baseUrl: string, token: string, id: string, payload: OvertimeEntryPatchPayload): Promise<OvertimeEntryApiResponse> {
  return request(baseUrl, 'PATCH', `/overtime-entries/${id}`, { token, body: payload });
}
export function deleteOvertimeEntryRemote(baseUrl: string, token: string, id: string): Promise<void> {
  return request(baseUrl, 'DELETE', `/overtime-entries/${id}`, { token });
}

// ─── OvertimeMonthMeta ───
// Sin POST — el primer PATCH crea si no existe (ver syncMapping.ts).

export function patchOvertimeMonthMetaRemote(baseUrl: string, token: string, yearMonth: string, payload: OvertimeMonthMetaPatchPayload): Promise<OvertimeMonthMetaApiResponse> {
  return request(baseUrl, 'PATCH', `/overtime-month-meta/${yearMonth}`, { token, body: payload });
}
export function deleteOvertimeMonthMetaRemote(baseUrl: string, token: string, yearMonth: string): Promise<void> {
  return request(baseUrl, 'DELETE', `/overtime-month-meta/${yearMonth}`, { token });
}

// ─── CalendarEvent ───

export function createCalendarEventRemote(baseUrl: string, token: string, payload: CalendarEventCreatePayload): Promise<CalendarEventApiResponse> {
  return request(baseUrl, 'POST', '/calendar-events', { token, body: payload });
}
export function patchCalendarEventRemote(baseUrl: string, token: string, id: string, payload: CalendarEventPatchPayload): Promise<CalendarEventApiResponse> {
  return request(baseUrl, 'PATCH', `/calendar-events/${id}`, { token, body: payload });
}
export function deleteCalendarEventRemote(baseUrl: string, token: string, id: string): Promise<void> {
  return request(baseUrl, 'DELETE', `/calendar-events/${id}`, { token });
}

// ─── AbsenceDay ───

export function createAbsenceDayRemote(baseUrl: string, token: string, payload: AbsenceDayCreatePayload): Promise<AbsenceDayApiResponse> {
  return request(baseUrl, 'POST', '/absence-days', { token, body: payload });
}
export function patchAbsenceDayRemote(baseUrl: string, token: string, id: string, payload: AbsenceDayPatchPayload): Promise<AbsenceDayApiResponse> {
  return request(baseUrl, 'PATCH', `/absence-days/${id}`, { token, body: payload });
}
export function deleteAbsenceDayRemote(baseUrl: string, token: string, id: string): Promise<void> {
  return request(baseUrl, 'DELETE', `/absence-days/${id}`, { token });
}

// ─── DailyEntry (contenido, CRDT) ───
// PUT-only (natural key = date, sin POST) — mismo patrón que
// pushNoteContentRemote, ver internal/dailyentry/handlers.go.
export function putDailyEntryContentRemote(baseUrl: string, token: string, date: string, updateB64: string): Promise<DailyEntryApiResponse> {
  return request(baseUrl, 'PUT', `/daily-entries/${date}`, {
    token,
    body: { content_update: updateB64, updated_at: new Date().toISOString() },
  });
}
export function deleteDailyEntryRemote(baseUrl: string, token: string, date: string): Promise<void> {
  return request(baseUrl, 'DELETE', `/daily-entries/${date}`, { token });
}
