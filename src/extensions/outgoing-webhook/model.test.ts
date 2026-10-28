import { describe, expect, it } from 'vitest';
import type { Task } from '../../types/task';
import type { OvertimeEntry } from '../../types/overtime';
import { buildPayload, readWebhookSettings, taskData, webhookEventFor } from './model';

const task = (over: Partial<Task>): Task => ({
  id: 't1', title: 'Revisar PR', status: 'todo', tags: ['dsi'], project: 'work', created: '2026-10-28T12:00:00.000Z',
  linked_paths: ['/secreto'], content: 'contenido privado', filePath: '/d/t1.md', ...over,
});

describe('webhook saliente', () => {
  it('lee la configuración e ignora eventos desconocidos o repetidos', () => {
    expect(readWebhookSettings(undefined)).toEqual({ events: [] });
    expect(readWebhookSettings({ hint: 'h', events: ['task.completed', 'note.saved', 'task.completed'], last: { event: 'test', at: 'x', status: 'ok' } }))
      .toEqual({ hint: 'h', events: ['task.completed'], last: { event: 'test', at: 'x', status: 'ok' } });
  });

  it('la tarea va sin contenido ni rutas (W12)', () => {
    const data = taskData(task({ status: 'done', completedAt: '2026-10-28T13:00:00.000Z', due: '2026-10-30', taskCode: 'F-1' }));
    expect(data).toEqual({
      id: 't1', title: 'Revisar PR', project: 'work', status: 'done', tags: ['dsi'], due: '2026-10-30', taskCode: 'F-1',
      completedAt: '2026-10-28T13:00:00.000Z',
    });
    expect(JSON.stringify(data)).not.toContain('privado');
  });

  it('qué evento sale de cada cambio (W5)', () => {
    expect(webhookEventFor({ type: 'task.created', task: task({}) })?.event).toBe('task.created');
    expect(webhookEventFor({ type: 'task.updated', prev: task({}), next: task({ status: 'done' }) })?.event).toBe('task.completed');
    // Editar una tarea que ya estaba hecha, o cualquier otro cambio, no envía nada.
    expect(webhookEventFor({ type: 'task.updated', prev: task({ status: 'done' }), next: task({ status: 'done', title: 'x' }) })).toBeNull();
    expect(webhookEventFor({ type: 'task.updated', prev: task({}), next: task({ status: 'in-progress' }) })).toBeNull();
    const entry: OvertimeEntry = {
      id: 'o1', fecha: '2026-10-05', solicitadaPor: 'DSI', actividad: 'Soporte', observaciones: '', horaInicio: '08:00',
      horaFinal: '10:00', totalHoras: 2, extrasDiurnas: 2, extrasNocturnas: 0, extrasDiurnasFestivas: 0, extrasNocturnasFestivas: 0,
    };
    expect(webhookEventFor({ type: 'overtime.saved', entry })).toMatchObject({ event: 'overtime.saved', data: { date: '2026-10-05', hours: 2 } });
  });

  it('el cuerpo (W9)', () => {
    expect(JSON.parse(buildPayload('test', { a: 1 }, '2026-10-28T12:00:00.000Z')))
      .toEqual({ event: 'test', at: '2026-10-28T12:00:00.000Z', source: 'logday-desktop', data: { a: 1 } });
  });
});
