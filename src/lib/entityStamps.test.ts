import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../types/note';
import {
  NOTE_UPDATED_MIN_INTERVAL_MS, NoteUpdatedThrottle, newNoteStamps, newTaskStamps, nextCompletedAt,
  noteSaveKind, stampNoteSave,
} from './entityStamps';

// Un instante como los de `toISOString()`.
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const NOW = '2026-10-28T19:30:00.000Z';
const now = () => NOW;

function note(fields: Partial<Note> = {}): Note {
  return {
    id: 'n1', title: 'Nota', folder: '', tags: [], created: '2026-10-01', updated: '2026-10-01',
    pinned: false, content: 'hola', filePath: '/n1.md', ...fields,
  };
}

describe('newTaskStamps', () => {
  it('una tarea nueva lleva created como instante y sin completedAt', () => {
    const stamps = newTaskStamps('todo');
    expect(stamps.created).toMatch(INSTANT);
    expect(stamps.completedAt).toBeUndefined();
    expect('completedAt' in stamps).toBe(false);
  });

  it('una tarea que nace hecha lleva completedAt con el mismo instante', () => {
    const stamps = newTaskStamps('done');
    expect(stamps.created).toMatch(INSTANT);
    expect(stamps.completedAt).toBe(stamps.created);
  });
});

describe('nextCompletedAt (D2)', () => {
  it('al pasar a done sella con el instante actual', () => {
    expect(nextCompletedAt({ status: 'todo' }, { status: 'done' }, now)).toBe(NOW);
    expect(nextCompletedAt({ status: 'in-progress' }, { status: 'done' }, now)).toBe(NOW);
  });

  it('al pasar a done ignora un valor viejo que traiga la tarea', () => {
    // Otro cliente la reabrió sin limpiar completedAt.
    const stale = '2026-01-15';
    expect(nextCompletedAt({ status: 'todo', completedAt: stale }, { status: 'done', completedAt: stale }, now)).toBe(NOW);
    expect(nextCompletedAt({ status: 'todo', completedAt: '2026-01-15T10:00:00.000Z' }, { status: 'done', completedAt: '2026-01-15T10:00:00.000Z' }, now)).toBe(NOW);
  });

  it('si sigue en done conserva su valor, también el legado', () => {
    const at = '2026-10-20T15:00:00.000Z';
    expect(nextCompletedAt({ status: 'done', completedAt: at }, { status: 'done', completedAt: at }, now)).toBe(at);
    expect(nextCompletedAt({ status: 'done', completedAt: '2026-10-20' }, { status: 'done', completedAt: '2026-10-20' }, now)).toBe('2026-10-20');
    // Un cambio de otro campo que no trae completedAt conserva el del store.
    expect(nextCompletedAt({ status: 'done', completedAt: at }, { status: 'done' }, now)).toBe(at);
  });

  it('si sigue en done pero no tenía valor, lo sella', () => {
    expect(nextCompletedAt({ status: 'done' }, { status: 'done' }, now)).toBe(NOW);
  });

  it('al reabrir se limpia', () => {
    expect(nextCompletedAt({ status: 'done', completedAt: NOW }, { status: 'todo', completedAt: NOW }, now)).toBeUndefined();
    expect(nextCompletedAt({ status: 'done', completedAt: NOW }, { status: 'in-progress' }, now)).toBeUndefined();
  });

  it('completar, reabrir y volver a completar sella de nuevo', () => {
    const first = nextCompletedAt({ status: 'todo' }, { status: 'done' }, () => '2026-10-28T10:00:00.000Z');
    const reopened = nextCompletedAt({ status: 'done', completedAt: first }, { status: 'todo', completedAt: first }, now);
    expect(reopened).toBeUndefined();
    expect(nextCompletedAt({ status: 'todo', completedAt: reopened }, { status: 'done' }, () => '2026-10-28T11:00:00.000Z'))
      .toBe('2026-10-28T11:00:00.000Z');
  });

  it('sin prev conserva lo que traiga y si no trae nada sella', () => {
    expect(nextCompletedAt(undefined, { status: 'done', completedAt: '2026-10-20' }, now)).toBe('2026-10-20');
    expect(nextCompletedAt(undefined, { status: 'done' }, now)).toBe(NOW);
    expect(nextCompletedAt(undefined, { status: 'todo', completedAt: '2026-10-20' }, now)).toBeUndefined();
  });
});

describe('newNoteStamps', () => {
  it('crear, duplicar o importar deja created = updated = un instante', () => {
    const stamps = newNoteStamps();
    expect(stamps.created).toMatch(INSTANT);
    expect(stamps.updated).toBe(stamps.created);
  });
});

describe('noteSaveKind', () => {
  it('distingue metadatos, contenido y nada', () => {
    const prev = note();
    expect(noteSaveKind(undefined, prev)).toBe('meta');
    expect(noteSaveKind(prev, { ...prev })).toBe('none');
    expect(noteSaveKind(prev, { ...prev, content: 'otro' })).toBe('content');
    expect(noteSaveKind(prev, { ...prev, title: 'Otro' })).toBe('meta');
    expect(noteSaveKind(prev, { ...prev, tags: ['a'] })).toBe('meta');
    expect(noteSaveKind(prev, { ...prev, folder: 'x' })).toBe('meta');
    expect(noteSaveKind(prev, { ...prev, pinned: true })).toBe('meta');
    // Título y contenido a la vez: sella como metadato.
    expect(noteSaveKind(prev, { ...prev, title: 'Otro', content: 'otro' })).toBe('meta');
  });
});

describe('NoteUpdatedThrottle (D1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T19:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mientras se edita sella como mucho una vez cada 60 s', () => {
    const throttle = new NoteUpdatedThrottle();
    const stamps: number[] = [];
    // Autoguardado cada 600 ms durante 150 s.
    for (let t = 0; t <= 150_000; t += 600) {
      if (throttle.shouldStamp('n1', 'content')) stamps.push(t);
      vi.advanceTimersByTime(600);
    }
    expect(stamps).toEqual([0, 60_000, 120_000]);
  });

  it('editar unos segundos cambia updated una sola vez, y el sello final va al salir', () => {
    const throttle = new NoteUpdatedThrottle();
    let count = 0;
    for (let i = 0; i < 10; i++) {
      if (throttle.shouldStamp('n1', 'content')) count++;
      vi.advanceTimersByTime(600);
    }
    expect(count).toBe(1);
    expect(throttle.hasPending('n1')).toBe(true);
    // Salir de la nota sin cambios nuevos sella lo pendiente.
    expect(throttle.shouldStamp('n1', 'none', true)).toBe(true);
    expect(throttle.hasPending('n1')).toBe(false);
  });

  it('salir sin ediciones desde el último sello no sella', () => {
    const throttle = new NoteUpdatedThrottle();
    expect(throttle.shouldStamp('n1', 'content')).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(throttle.shouldStamp('n1', 'none', true)).toBe(false);
    expect(throttle.shouldStamp('n2', 'none', true)).toBe(false);
  });

  it('un cambio de metadatos sella al momento y cubre lo pendiente', () => {
    const throttle = new NoteUpdatedThrottle();
    throttle.shouldStamp('n1', 'content');
    vi.advanceTimersByTime(5_000);
    expect(throttle.shouldStamp('n1', 'content')).toBe(false);
    expect(throttle.shouldStamp('n1', 'meta')).toBe(true);
    expect(throttle.hasPending('n1')).toBe(false);
    // Y reinicia la ventana de 60 s.
    vi.advanceTimersByTime(30_000);
    expect(throttle.shouldStamp('n1', 'content')).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(throttle.shouldStamp('n1', 'content')).toBe(true);
  });

  it('el límite es por nota', () => {
    const throttle = new NoteUpdatedThrottle();
    expect(throttle.shouldStamp('n1', 'content')).toBe(true);
    expect(throttle.shouldStamp('n2', 'content')).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(throttle.shouldStamp('n1', 'content')).toBe(false);
    expect(throttle.shouldStamp('n2', 'content')).toBe(false);
  });

  it('una nota recién creada no se vuelve a sellar en los primeros 60 s', () => {
    const throttle = new NoteUpdatedThrottle();
    throttle.markStamped('n1');
    vi.advanceTimersByTime(NOTE_UPDATED_MIN_INTERVAL_MS - 1);
    expect(throttle.shouldStamp('n1', 'content')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(throttle.shouldStamp('n1', 'content')).toBe(true);
  });

  it('forget olvida lo pendiente de una nota borrada', () => {
    const throttle = new NoteUpdatedThrottle();
    throttle.shouldStamp('n1', 'content');
    throttle.shouldStamp('n1', 'content');
    expect(throttle.hasPending('n1')).toBe(true);
    throttle.forget('n1');
    expect(throttle.hasPending('n1')).toBe(false);
  });
});

describe('stampNoteSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T19:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('el contenido se guarda siempre; solo el sello de updated se espacia', () => {
    const throttle = new NoteUpdatedThrottle();
    let stored = note();
    stored = stampNoteSave(stored, { ...stored, content: 'a' }, throttle);
    expect(stored.updated).toMatch(INSTANT);
    const firstStamp = stored.updated;
    vi.advanceTimersByTime(600);
    stored = stampNoteSave(stored, { ...stored, content: 'ab' }, throttle);
    expect(stored.content).toBe('ab');
    expect(stored.updated).toBe(firstStamp);
    vi.advanceTimersByTime(600);
    stored = stampNoteSave(stored, stored, throttle, { leaving: true });
    expect(stored.updated).not.toBe(firstStamp);
    expect(stored.updated).toBe('2026-10-28T19:00:01.200Z');
  });

  it('sin sello conserva el updated del store, no el de un snapshot viejo', () => {
    const throttle = new NoteUpdatedThrottle();
    throttle.markStamped('n1');
    const prev = note({ updated: '2026-10-28T19:00:00.000Z' });
    const saved = stampNoteSave(prev, { ...prev, updated: '2026-10-01', content: 'otro' }, throttle);
    expect(saved.updated).toBe('2026-10-28T19:00:00.000Z');
  });

  it('un guardado sin cambios no toca un updated legado (sin PATCH espurio)', () => {
    const throttle = new NoteUpdatedThrottle();
    const prev = note({ updated: '2026-10-01' });
    expect(stampNoteSave(prev, { ...prev }, throttle).updated).toBe('2026-10-01');
  });

  it('cambiar el título, los tags o el fijado sella al momento', () => {
    const throttle = new NoteUpdatedThrottle();
    throttle.markStamped('n1');
    const prev = note();
    expect(stampNoteSave(prev, { ...prev, title: 'Otro' }, throttle, { now }).updated).toBe(NOW);
    expect(stampNoteSave(prev, { ...prev, tags: ['x'] }, throttle, { now }).updated).toBe(NOW);
    expect(stampNoteSave(prev, { ...prev, pinned: true }, throttle, { now }).updated).toBe(NOW);
  });
});
