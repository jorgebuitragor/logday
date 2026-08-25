import { Task, TaskStatus } from '../types/task';
import { Note } from '../types/note';
import { OvertimeEntry, OvertimeMonthMeta } from '../types/overtime';
import { CalendarEvent, EventColor, EventRepeat } from '../types/calendar';
import { AbsenceDay, AbsenceType } from '../types/absence';

// Conversión tipo local <-> payload REST de logday-server, por
// entidad. `filePath`/`linked_paths` quedan afuera a propósito (son
// locales, el servidor no los conoce) — quien llame a estas funciones
// se encarga de completarlos con el valor local existente. `id` es
// generado por el cliente (uuid) tanto acá como en logday-server, así
// que viaja tal cual en ambas direcciones.
function nowIso(): string {
  return new Date().toISOString();
}

// ─── Task ───

export interface TaskCreatePayload {
  id: string;
  title: string;
  task_code: string | null;
  status: TaskStatus;
  tags: string[];
  project: string;
  created: string;
  completed_at: string | null;
  due: string | null;
  content: string;
  updated_at: string;
}

export interface TaskPatchPayload {
  title?: string;
  task_code?: string | null;
  status?: TaskStatus;
  tags?: string[];
  project?: string;
  created?: string;
  completed_at?: string | null;
  due?: string | null;
  content?: string;
  updated_at: string;
}

export interface TaskApiResponse extends TaskCreatePayload {
  seq: number;
  deleted_at?: string;
}

export function taskToCreatePayload(task: Task): TaskCreatePayload {
  return {
    id: task.id,
    title: task.title,
    task_code: task.taskCode ?? null,
    status: task.status,
    tags: task.tags,
    project: task.project,
    created: task.created,
    completed_at: task.completedAt ?? null,
    due: task.due ?? null,
    content: task.content,
    updated_at: nowIso(),
  };
}

export function taskFieldsToPatchPayload(fields: Partial<Task>): TaskPatchPayload {
  const payload: TaskPatchPayload = { updated_at: nowIso() };
  if ('title' in fields) payload.title = fields.title;
  if ('taskCode' in fields) payload.task_code = fields.taskCode ?? null;
  if ('status' in fields) payload.status = fields.status;
  if ('tags' in fields) payload.tags = fields.tags;
  if ('project' in fields) payload.project = fields.project;
  if ('created' in fields) payload.created = fields.created;
  if ('completedAt' in fields) payload.completed_at = fields.completedAt ?? null;
  if ('due' in fields) payload.due = fields.due ?? null;
  if ('content' in fields) payload.content = fields.content;
  return payload;
}

export function taskFromApiResponse(payload: TaskApiResponse): Omit<Task, 'filePath' | 'linked_paths'> {
  return {
    id: payload.id,
    title: payload.title,
    taskCode: payload.task_code ?? undefined,
    status: payload.status,
    tags: payload.tags,
    project: payload.project,
    created: payload.created,
    completedAt: payload.completed_at ?? undefined,
    due: payload.due ?? undefined,
    content: payload.content,
  };
}

// ─── Note (metadata) ───
// Content es CRDT (Y.Text), va por POST /notes/:id/content — fuera de
// este mapeo, ver specs/sync-servidor/design.md "CRDT".

export interface NoteCreatePayload {
  id: string;
  title: string;
  folder: string;
  tags: string[];
  created: string;
  updated: string;
  pinned: boolean;
  updated_at: string;
}

export interface NotePatchPayload {
  title?: string;
  folder?: string;
  tags?: string[];
  created?: string;
  updated?: string;
  pinned?: boolean;
  updated_at: string;
}

export interface NoteApiResponse extends NoteCreatePayload {
  content: string;
  content_state?: string;
  seq: number;
  deleted_at?: string;
}

export function noteToCreatePayload(note: Note): NoteCreatePayload {
  return {
    id: note.id,
    title: note.title,
    folder: note.folder,
    tags: note.tags,
    created: note.created,
    updated: note.updated,
    pinned: note.pinned,
    updated_at: nowIso(),
  };
}

export function noteFieldsToPatchPayload(fields: Partial<Note>): NotePatchPayload {
  const payload: NotePatchPayload = { updated_at: nowIso() };
  if ('title' in fields) payload.title = fields.title;
  if ('folder' in fields) payload.folder = fields.folder;
  if ('tags' in fields) payload.tags = fields.tags;
  if ('created' in fields) payload.created = fields.created;
  if ('updated' in fields) payload.updated = fields.updated;
  if ('pinned' in fields) payload.pinned = fields.pinned;
  return payload;
}

// content/content_state quedan afuera — metadata únicamente, ver
// nota de arriba del archivo.
export function noteFromApiResponse(payload: NoteApiResponse): Omit<Note, 'filePath' | 'content'> {
  return {
    id: payload.id,
    title: payload.title,
    folder: payload.folder,
    tags: payload.tags,
    created: payload.created,
    updated: payload.updated,
    pinned: payload.pinned,
  };
}

// ─── OvertimeEntry ───

export interface OvertimeEntryCreatePayload {
  id: string;
  fecha: string;
  solicitada_por: string;
  actividad: string;
  observaciones: string;
  hora_inicio: string;
  hora_final: string;
  total_horas: number;
  extras_diurnas: number;
  extras_nocturnas: number;
  extras_diurnas_festivas: number;
  extras_nocturnas_festivas: number;
  updated_at: string;
}

export interface OvertimeEntryPatchPayload {
  fecha?: string;
  solicitada_por?: string;
  actividad?: string;
  observaciones?: string;
  hora_inicio?: string;
  hora_final?: string;
  total_horas?: number;
  extras_diurnas?: number;
  extras_nocturnas?: number;
  extras_diurnas_festivas?: number;
  extras_nocturnas_festivas?: number;
  updated_at: string;
}

export interface OvertimeEntryApiResponse extends OvertimeEntryCreatePayload {
  seq: number;
  deleted_at?: string;
}

export function overtimeEntryToCreatePayload(entry: OvertimeEntry): OvertimeEntryCreatePayload {
  return {
    id: entry.id,
    fecha: entry.fecha,
    solicitada_por: entry.solicitadaPor,
    actividad: entry.actividad,
    observaciones: entry.observaciones,
    hora_inicio: entry.horaInicio,
    hora_final: entry.horaFinal,
    total_horas: entry.totalHoras,
    extras_diurnas: entry.extrasDiurnas,
    extras_nocturnas: entry.extrasNocturnas,
    extras_diurnas_festivas: entry.extrasDiurnasFestivas,
    extras_nocturnas_festivas: entry.extrasNocturnasFestivas,
    updated_at: nowIso(),
  };
}

export function overtimeEntryFieldsToPatchPayload(fields: Partial<OvertimeEntry>): OvertimeEntryPatchPayload {
  const payload: OvertimeEntryPatchPayload = { updated_at: nowIso() };
  if ('fecha' in fields) payload.fecha = fields.fecha;
  if ('solicitadaPor' in fields) payload.solicitada_por = fields.solicitadaPor;
  if ('actividad' in fields) payload.actividad = fields.actividad;
  if ('observaciones' in fields) payload.observaciones = fields.observaciones;
  if ('horaInicio' in fields) payload.hora_inicio = fields.horaInicio;
  if ('horaFinal' in fields) payload.hora_final = fields.horaFinal;
  if ('totalHoras' in fields) payload.total_horas = fields.totalHoras;
  if ('extrasDiurnas' in fields) payload.extras_diurnas = fields.extrasDiurnas;
  if ('extrasNocturnas' in fields) payload.extras_nocturnas = fields.extrasNocturnas;
  if ('extrasDiurnasFestivas' in fields) payload.extras_diurnas_festivas = fields.extrasDiurnasFestivas;
  if ('extrasNocturnasFestivas' in fields) payload.extras_nocturnas_festivas = fields.extrasNocturnasFestivas;
  return payload;
}

export function overtimeEntryFromApiResponse(payload: OvertimeEntryApiResponse): OvertimeEntry {
  return {
    id: payload.id,
    fecha: payload.fecha,
    solicitadaPor: payload.solicitada_por,
    actividad: payload.actividad,
    observaciones: payload.observaciones,
    horaInicio: payload.hora_inicio,
    horaFinal: payload.hora_final,
    totalHoras: payload.total_horas,
    extrasDiurnas: payload.extras_diurnas,
    extrasNocturnas: payload.extras_nocturnas,
    extrasDiurnasFestivas: payload.extras_diurnas_festivas,
    extrasNocturnasFestivas: payload.extras_nocturnas_festivas,
  };
}

// ─── OvertimeMonthMeta ───
// Sin POST propio — el server crea-si-no-existe con el primer PATCH
// (ver internal/overtime/handlers.go). El año-mes va en la URL, no en
// el body, así que no forma parte del tipo local ni del payload.

export interface OvertimeMonthMetaPatchPayload {
  colaborador?: string;
  cedula?: string;
  updated_at: string;
}

export interface OvertimeMonthMetaApiResponse {
  year_month: string;
  colaborador: string;
  cedula: string;
  seq: number;
  updated_at: string;
  deleted_at?: string;
}

export function overtimeMonthMetaFieldsToPatchPayload(fields: Partial<OvertimeMonthMeta>): OvertimeMonthMetaPatchPayload {
  const payload: OvertimeMonthMetaPatchPayload = { updated_at: nowIso() };
  if ('colaborador' in fields) payload.colaborador = fields.colaborador;
  if ('cedula' in fields) payload.cedula = fields.cedula;
  return payload;
}

export function overtimeMonthMetaFromApiResponse(payload: OvertimeMonthMetaApiResponse): OvertimeMonthMeta {
  return {
    colaborador: payload.colaborador,
    cedula: payload.cedula,
  };
}

// ─── CalendarEvent ───

export interface CalendarEventCreatePayload {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  color: EventColor;
  reminder_minutes: number;
  repeat: EventRepeat;
  updated_at: string;
}

export interface CalendarEventPatchPayload {
  title?: string;
  date?: string;
  time?: string;
  description?: string;
  color?: EventColor;
  reminder_minutes?: number;
  repeat?: EventRepeat;
  updated_at: string;
}

export interface CalendarEventApiResponse extends CalendarEventCreatePayload {
  seq: number;
  deleted_at?: string;
}

export function calendarEventToCreatePayload(event: CalendarEvent): CalendarEventCreatePayload {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    time: event.time,
    description: event.description,
    color: event.color,
    reminder_minutes: event.reminderMinutes,
    repeat: event.repeat,
    updated_at: nowIso(),
  };
}

export function calendarEventFieldsToPatchPayload(fields: Partial<CalendarEvent>): CalendarEventPatchPayload {
  const payload: CalendarEventPatchPayload = { updated_at: nowIso() };
  if ('title' in fields) payload.title = fields.title;
  if ('date' in fields) payload.date = fields.date;
  if ('time' in fields) payload.time = fields.time;
  if ('description' in fields) payload.description = fields.description;
  if ('color' in fields) payload.color = fields.color;
  if ('reminderMinutes' in fields) payload.reminder_minutes = fields.reminderMinutes;
  if ('repeat' in fields) payload.repeat = fields.repeat;
  return payload;
}

export function calendarEventFromApiResponse(payload: CalendarEventApiResponse): CalendarEvent {
  return {
    id: payload.id,
    title: payload.title,
    date: payload.date,
    time: payload.time,
    description: payload.description,
    color: payload.color,
    reminderMinutes: payload.reminder_minutes,
    repeat: payload.repeat,
  };
}

// ─── AbsenceDay ───

export interface AbsenceDayCreatePayload {
  id: string;
  date: string;
  type: AbsenceType;
  note: string | null;
  updated_at: string;
}

export interface AbsenceDayPatchPayload {
  date?: string;
  type?: AbsenceType;
  note?: string | null;
  updated_at: string;
}

export interface AbsenceDayApiResponse extends AbsenceDayCreatePayload {
  seq: number;
  deleted_at?: string;
}

export function absenceDayToCreatePayload(absence: AbsenceDay): AbsenceDayCreatePayload {
  return {
    id: absence.id,
    date: absence.date,
    type: absence.type,
    note: absence.note ?? null,
    updated_at: nowIso(),
  };
}

export function absenceDayFieldsToPatchPayload(fields: Partial<AbsenceDay>): AbsenceDayPatchPayload {
  const payload: AbsenceDayPatchPayload = { updated_at: nowIso() };
  if ('date' in fields) payload.date = fields.date;
  if ('type' in fields) payload.type = fields.type;
  if ('note' in fields) payload.note = fields.note ?? null;
  return payload;
}

export function absenceDayFromApiResponse(payload: AbsenceDayApiResponse): AbsenceDay {
  return {
    id: payload.id,
    date: payload.date,
    type: payload.type,
    note: payload.note ?? undefined,
  };
}

// ─── DailyEntry ───
// Sin tipo local propio (ver specs/sync-primer-sincronizacion) — un daily
// es una entrada en `Record<fecha, texto>` (dailyFileFormat.ts), no un
// objeto con id. `date` es la key natural tanto acá como en logday-server
// (PUT /daily-entries/:date), igual que year_month en OvertimeMonthMeta.
// Todo el contenido es CRDT (ver dailyContentSync.ts) — no hay create ni
// patch de metadata, PUT-only con content_update, por eso no hace falta un
// CreatePayload/PatchPayload acá como en las demás entidades.

export interface DailyEntryApiResponse {
  date: string;
  content: string;
  content_state?: string;
  seq: number;
  updated_at: string;
  deleted_at?: string;
}
