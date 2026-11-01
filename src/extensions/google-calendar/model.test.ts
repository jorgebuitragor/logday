import { describe, expect, it } from 'vitest';
import type { ExternalEvent } from '../externalEvents';
import { dayRange, homeAgenda, parseGoogleEvent, rangeIncludes, rangeToInstants, readCalendarSettings, showsOnHome } from './model';

// vitest corre en America/Bogota (UTC−5), ver vitest.config.ts.
describe('eventos de Google → Calendario de Logday (G6, G8)', () => {
  const link = 'https://www.google.com/calendar/event?eid=a';

  it('evento con hora, en hora local', () => {
    expect(parseGoogleEvent({ id: 'a', summary: 'Daily', start: { dateTime: '2026-10-28T09:00:00-05:00' }, htmlLink: link }, '(x)'))
      .toEqual([{ id: 'a', source: 'google-calendar', title: 'Daily', date: '2026-10-28', time: '09:00', url: link }]);
  });

  it('otra zona horaria se pasa a la local, aunque cambie el día', () => {
    // 01:30 en Madrid (UTC+1) = 19:30 del día anterior en Bogotá.
    expect(parseGoogleEvent({ id: 'b', summary: 'Madrid', start: { dateTime: '2026-10-29T01:30:00+01:00' } }, '(x)')[0])
      .toMatchObject({ date: '2026-10-28', time: '19:30' });
  });

  it('todo el día, uno o varios días (fin exclusivo)', () => {
    expect(parseGoogleEvent({ id: 'c', summary: 'Festivo', start: { date: '2026-11-02' }, end: { date: '2026-11-03' } }, '(x)'))
      .toEqual([{ id: 'c', source: 'google-calendar', title: 'Festivo', date: '2026-11-02', time: '' }]);
    const trip = parseGoogleEvent({ id: 'd', summary: 'Viaje', start: { date: '2026-10-30' }, end: { date: '2026-11-02' } }, '(x)');
    expect(trip.map((e) => e.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('sin título, sin id, fechas rotas y enlaces raros', () => {
    expect(parseGoogleEvent({ id: 'e', summary: '  ', start: { date: '2026-10-28' } }, '(Sin título)')[0].title).toBe('(Sin título)');
    expect(parseGoogleEvent({ summary: 'x', start: { date: '2026-10-28' } }, '(x)')).toEqual([]);
    expect(parseGoogleEvent({ id: 'f', start: { dateTime: 'mañana' } }, '(x)')).toEqual([]);
    expect(parseGoogleEvent({ id: 'g', start: { date: '28/10/2026' } }, '(x)')).toEqual([]);
    expect(parseGoogleEvent({ id: 'h', start: { date: '2026-10-28' }, htmlLink: 'javascript:alert(1)' }, '(x)')[0]).not.toHaveProperty('url');
  });

  it('un todo el día larguísimo no se expande sin límite', () => {
    expect(parseGoogleEvent({ id: 'i', start: { date: '2026-01-01' }, end: { date: '2027-01-01' } }, '(x)')).toHaveLength(62);
  });
});

describe('rango y configuración', () => {
  it('el mes visible pasa a instantes desde la medianoche local', () => {
    expect(rangeToInstants({ from: '2026-10-01', to: '2026-11-01' }))
      .toEqual({ timeMin: '2026-10-01T05:00:00.000Z', timeMax: '2026-11-01T05:00:00.000Z' });
  });

  it('lee la configuración e ignora lo vacío', () => {
    expect(readCalendarSettings(undefined)).toEqual({});
    expect(readCalendarSettings({ clientId: 'c', secretHint: '…a', account: '', extra: 1 })).toEqual({ clientId: 'c', secretHint: '…a' });
  });
});

describe('tarjeta de Inicio (G12, R27)', () => {
  const ev = (id: string, time: string, date = '2026-10-31'): ExternalEvent =>
    ({ id, source: 'google-calendar', title: id, date, time });

  it('"Mostrar en Inicio" está encendido salvo que se apague', () => {
    expect(showsOnHome(undefined)).toBe(true);
    expect(showsOnHome({})).toBe(true);
    expect(showsOnHome({ showOnHome: false })).toBe(false);
  });

  it('el día local como rango, y si un rango lo incluye', () => {
    // A las 21:00 en Bogotá ya es el día siguiente en UTC: cuenta el local.
    const range = dayRange(new Date(2026, 9, 31, 21, 0));
    expect(range).toEqual({ from: '2026-10-31', to: '2026-11-01' });
    expect(rangeToInstants(range)).toEqual({ timeMin: '2026-10-31T05:00:00.000Z', timeMax: '2026-11-01T05:00:00.000Z' });
    expect(rangeIncludes({ from: '2026-10-01', to: '2026-11-01' }, '2026-10-31')).toBe(true);
    expect(rangeIncludes({ from: '2026-11-01', to: '2026-12-01' }, '2026-10-31')).toBe(false);
    expect(rangeIncludes(null, '2026-10-31')).toBe(false);
  });

  it('solo hoy, todo el día primero, hasta 5, el siguiente y cuántos más', () => {
    const events = [ev('c', '15:00'), ev('a', '09:00'), ev('todo', ''), ev('ayer', '10:00', '2026-10-30'), ev('b', '11:30'), ev('d', '16:00'), ev('e', '17:00')];
    const agenda = homeAgenda(events, '2026-10-31', '10:15');
    expect(agenda.rows.map((e) => e.id)).toEqual(['todo', 'a', 'b', 'c', 'd']);
    expect(agenda.next).toBe(2);
    expect(agenda.more).toBe(1);
  });

  it('el siguiente puede empezar justo ahora, y no hay si ya pasaron todos', () => {
    expect(homeAgenda([ev('a', '09:00'), ev('b', '10:15')], '2026-10-31', '10:15').next).toBe(1);
    expect(homeAgenda([ev('todo', ''), ev('a', '09:00')], '2026-10-31', '18:00').next).toBe(-1);
    expect(homeAgenda([], '2026-10-31', '18:00')).toEqual({ rows: [], next: -1, more: 0 });
  });
});
