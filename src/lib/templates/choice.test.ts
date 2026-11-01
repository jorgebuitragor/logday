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
const usual = buildDailyCopyText(input.prevDate, '- A', input.todayDate, '- B');

describe('buildDailyMessage', () => {
  it('sin elección, o con la de Logday, da el mensaje de siempre', () => {
    expect(buildDailyMessage(undefined, input)).toBe(usual);
    expect(buildDailyMessage({ source: 'logday', text: '{{hoy.fecha}}' }, input)).toBe(usual);
  });

  it('una propia', () => {
    expect(buildDailyMessage({ source: 'custom', text: 'Daily de {{usuario.nombre}}: {{hoy.actividades}}' }, input)).toBe('Daily de Ana: - B');
  });

  it('una propia vacía usa la de Logday', () => {
    expect(buildDailyMessage({ source: 'custom', text: '  ' }, input)).toBe(usual);
    expect(buildDailyMessage({ source: 'custom' }, input)).toBe(usual);
  });
});
