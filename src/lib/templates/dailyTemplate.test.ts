import { describe, expect, it } from 'vitest';
import { buildDailyCopyText, dateFromISO } from '../colombianHolidays';
import { FCV_DAILY_TEMPLATE, LOGDAY_DAILY_TEMPLATE, dailyTemplateContext, renderTemplate } from './dailyTemplate';

const ctx = (todayISO: string, nowISO: string, prev = '- Revisé el PR', today = '- Desplegar', language: 'es' | 'en' = 'es') =>
  dailyTemplateContext({
    prevDate: dateFromISO('2026-10-30'),
    prevActivities: prev,
    todayDate: dateFromISO(todayISO),
    todayActivities: today,
    language,
    userName: 'Ana',
    now: dateFromISO(nowISO),
  });

describe('renderTemplate', () => {
  it('llena valores y secciones', () => {
    const r = renderTemplate('Hola {{a}}.{{#b}} sí{{/b}}{{^b}} no{{/b}}', { a: 'Ana', b: true });
    expect(r).toEqual({ text: 'Hola Ana. sí', unknown: [], error: null });
    expect(renderTemplate('{{#b}}sí{{/b}}{{^b}}no{{/b}}', { b: false }).text).toBe('no');
  });

  it('un marcador desconocido queda vacío y se reporta una vez', () => {
    const r = renderTemplate('{{x}}-{{x}}-{{ a }}', { a: '1' });
    expect(r.text).toBe('--1');
    expect(r.unknown).toEqual(['x']);
  });

  it('una sección sin cerrar deja el texto tal cual', () => {
    const r = renderTemplate('A {{#b}} B', { b: true });
    expect(r.text).toBe('A {{#b}} B');
    expect(r.error).not.toBeNull();
    expect(renderTemplate('A {{/b}}', {}).error).not.toBeNull();
  });
});

describe('plantillas del Daily', () => {
  it('la FCV escrita como plantilla da lo mismo que buildDailyCopyText', () => {
    const now = new Date();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const [day, prev, today] of [
      [todayISO, '- A\n- B', '- C'],
      ['2026-11-03', '', ''],
      ['2026-11-03', '  - con espacios  ', '- x'],
    ]) {
      const expected = buildDailyCopyText(dateFromISO('2026-10-30'), prev, dateFromISO(day), today);
      const ours = renderTemplate(FCV_DAILY_TEMPLATE, dailyTemplateContext({
        prevDate: dateFromISO('2026-10-30'), prevActivities: prev, todayDate: dateFromISO(day), todayActivities: today, language: 'es',
      }));
      expect(ours.text).toBe(expected);
    }
  });

  it('la de Logday en español, hoy y otro día', () => {
    expect(renderTemplate(LOGDAY_DAILY_TEMPLATE.es, ctx('2026-11-02', '2026-11-02')).text).toBe(
      'Avance del día anterior (Viernes 30 de Octubre):\n- Revisé el PR\n\nPlan de hoy (Lunes 2 de Noviembre):\n- Desplegar',
    );
    expect(renderTemplate(LOGDAY_DAILY_TEMPLATE.es, ctx('2026-11-02', '2026-11-05')).text).toContain('Plan del día (Lunes 2 de Noviembre):');
  });

  it('la de Logday en inglés, con fechas en inglés y sin actividades', () => {
    expect(renderTemplate(LOGDAY_DAILY_TEMPLATE.en, ctx('2026-11-02', '2026-11-02', '', '', 'en')).text).toBe(
      'Previous workday (Friday, October 30):\n- (no activities recorded)\n\nToday (Monday, November 2):\n- (no activities yet)',
    );
  });

  it('las dos plantillas incluidas solo usan marcadores que existen', () => {
    const context = ctx('2026-11-02', '2026-11-02');
    for (const t of [FCV_DAILY_TEMPLATE, LOGDAY_DAILY_TEMPLATE.es, LOGDAY_DAILY_TEMPLATE.en]) {
      expect(renderTemplate(t, context).unknown).toEqual([]);
    }
  });
});
