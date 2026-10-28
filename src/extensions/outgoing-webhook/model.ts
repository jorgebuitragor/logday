// "Webhook saliente" (specs/webhook-saliente). Lógica sin React ni Tauri:
// la configuración, qué evento de la app se envía y el cuerpo.
import type { AppEvent } from '../../lib/appEvents';
import type { Task } from '../../types/task';
import type { OvertimeEntry } from '../../types/overtime';

export const OUTGOING_WEBHOOK_ID = 'outgoing-webhook' as const;
export const URL_SECRET_KEY = 'url';
export const SIGNING_SECRET_KEY = 'secret';

export type WebhookEvent = 'task.created' | 'task.completed' | 'overtime.saved' | 'daily.sent' | 'test';
/** W5: los automáticos, que el usuario elige (W4). */
export const AUTOMATIC_EVENTS = ['task.created', 'task.completed', 'overtime.saved'] as const;
export type AutomaticEvent = (typeof AUTOMATIC_EVENTS)[number];

export interface WebhookLast {
  event: WebhookEvent;
  at: string;
  status: 'ok' | 'error';
  error?: { code: string; status?: number | null };
}

export interface WebhookSettings {
  /** Pista de la URL guardada. */
  hint?: string;
  /** Pista del secreto de firma, si hay. */
  secretHint?: string;
  events: AutomaticEvent[];
  last?: WebhookLast;
}

const isAutomatic = (v: unknown): v is AutomaticEvent => (AUTOMATIC_EVENTS as readonly unknown[]).includes(v);

export function readWebhookSettings(raw: Record<string, unknown> | undefined): WebhookSettings {
  const out: WebhookSettings = { events: [] };
  if (!raw) return out;
  if (typeof raw.hint === 'string' && raw.hint) out.hint = raw.hint;
  if (typeof raw.secretHint === 'string' && raw.secretHint) out.secretHint = raw.secretHint;
  if (Array.isArray(raw.events)) out.events = [...new Set(raw.events.filter(isAutomatic))];
  const l = raw.last as Record<string, unknown> | undefined;
  if (l && typeof l.event === 'string' && typeof l.at === 'string' && (l.status === 'ok' || l.status === 'error')) {
    out.last = { event: l.event as WebhookEvent, at: l.at, status: l.status };
    const e = l.error as Record<string, unknown> | undefined;
    if (e && typeof e.code === 'string') out.last.error = { code: e.code, status: typeof e.status === 'number' ? e.status : null };
  }
  return out;
}

/** W12: la tarea sin su contenido. */
export function taskData(t: Task) {
  return {
    id: t.id,
    title: t.title,
    project: t.project,
    status: t.status,
    tags: t.tags,
    ...(t.due ? { due: t.due } : {}),
    ...(t.taskCode ? { taskCode: t.taskCode } : {}),
    ...(t.status === 'done' && t.completedAt ? { completedAt: t.completedAt } : {}),
  };
}

export function overtimeData(e: OvertimeEntry) {
  return {
    id: e.id, date: e.fecha, start: e.horaInicio, end: e.horaFinal, activity: e.actividad,
    requestedBy: e.solicitadaPor, notes: e.observaciones, hours: e.totalHoras, day: e.extrasDiurnas,
    night: e.extrasNocturnas, holidayDay: e.extrasDiurnasFestivas, holidayNight: e.extrasNocturnasFestivas,
  };
}

/** Qué se envía por un evento de la app, o `null` si nada (W5). */
export function webhookEventFor(ev: AppEvent): { event: AutomaticEvent; data: unknown } | null {
  switch (ev.type) {
    case 'task.created':
      return { event: 'task.created', data: taskData(ev.task) };
    case 'task.updated':
      // Solo el paso a hecha: editar el título de una tarea hecha no cuenta.
      return ev.next.status === 'done' && ev.prev?.status !== 'done'
        ? { event: 'task.completed', data: taskData(ev.next) }
        : null;
    case 'overtime.saved':
      return { event: 'overtime.saved', data: overtimeData(ev.entry) };
  }
}

/** W9: el cuerpo de cada envío. */
export function buildPayload(event: WebhookEvent, data: unknown, at: string): string {
  return JSON.stringify({ event, at, source: 'logday-desktop', data });
}
