import { describe, expect, it } from 'vitest';
import { buildDailyCopyText, dateFromISO } from '../colombianHolidays';
import { buildDailyMessage } from './choice';

const input = {
  prevDate: dateFromISO('2026-10-30'),
  prevActivities: '- A',
  todayDate: dateFromISO('2026-11-02'),
  todayActivities: '- B',
  language: 'es' as const,
  userName: 'Ana',
  now: dateFromISO('2026-11-02'),
};
const fcv = buildDailyCopyText(input.prevDate, '- A', input.todayDate, '- B');

describe('buildDailyMessage', () => {
  it('sin elección, o con la FCV, da lo de siempre', () => {
    expect(buildDailyMessage(undefined, input)).toBe(fcv);
    expect(buildDailyMessage({ source: 'fcv', text: '{{hoy.fecha}}' }, input)).toBe(fcv);
  });

  it('la de Logday y una propia', () => {
    expect(buildDailyMessage({ source: 'logday' }, input)).toContain('Avance del día anterior (Viernes 30 de Octubre):');
    expect(buildDailyMessage({ source: 'custom', text: 'Daily de {{usuario.nombre}}: {{hoy.actividades}}' }, input)).toBe('Daily de Ana: - B');
  });

  it('una propia vacía usa la FCV', () => {
    expect(buildDailyMessage({ source: 'custom', text: '  ' }, input)).toBe(fcv);
    expect(buildDailyMessage({ source: 'custom' }, input)).toBe(fcv);
  });
});
