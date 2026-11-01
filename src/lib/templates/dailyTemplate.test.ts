import { describe, expect, it } from 'vitest';
import { buildDailyCopyText, dateFromISO } from '../colombianHolidays';
import { DAILY_TEMPLATE_EXAMPLES, LOGDAY_DAILY_TEMPLATE, dailyDateLabel, dailyTemplateContext, renderTemplate, splitTemplate } from './dailyTemplate';

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

describe('la plantilla de Logday', () => {
  it('da lo mismo que buildDailyCopyText', () => {
    const now = new Date();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const [day, prev, today] of [
      [todayISO, '- A\n- B', '- C'],
      ['2026-11-03', '', ''],
      ['2026-11-03', '  - con espacios  ', '- x'],
    ]) {
      const expected = buildDailyCopyText(dateFromISO('2026-10-30'), prev, dateFromISO(day), today);
      const ours = renderTemplate(LOGDAY_DAILY_TEMPLATE, dailyTemplateContext({
        prevDate: dateFromISO('2026-10-30'), prevActivities: prev, todayDate: dateFromISO(day), todayActivities: today, language: 'es',
      }));
      expect(ours.text).toBe(expected);
    }
  });

  it('solo usa marcadores que existen', () => {
    expect(renderTemplate(LOGDAY_DAILY_TEMPLATE, ctx('2026-11-02', '2026-11-02')).unknown).toEqual([]);
  });

  it('las fechas en inglés y el texto sin actividades', () => {
    expect(dailyDateLabel(dateFromISO('2026-11-02'), 'en')).toBe('Monday, November 2');
    const en = ctx('2026-11-02', '2026-11-02', '', '', 'en');
    expect(en['anterior.actividades']).toBe('- (no activities recorded)');
    expect(en['hoy.es_hoy']).toBe(true);
  });
});

describe('ejemplos y recuadros', () => {
  it('los ejemplos solo usan marcadores que existen', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const ex of DAILY_TEMPLATE_EXAMPLES[lang]) {
        expect(renderTemplate(ex.template, ctx('2026-11-02', '2026-11-02', '- a', '- b', lang)).unknown).toEqual([]);
      }
    }
  });

  it('«Fecha del Daily (con de hoy)» da el mensaje de siempre sin secciones', () => {
    expect(ctx('2026-11-02', '2026-11-02')['hoy.dia']).toBe('de hoy, Lunes 2 de Noviembre');
    expect(ctx('2026-11-02', '2026-11-05')['hoy.dia']).toBe('Lunes 2 de Noviembre');
    expect(LOGDAY_DAILY_TEMPLATE).not.toContain('{{#');
  });

  it('splitTemplate separa texto y marcadores y vuelve a armar lo mismo', () => {
    const t = 'Hola {{usuario.nombre}}:\n{{ hoy.fecha }}{{#x}}';
    const parts = splitTemplate(t);
    expect(parts).toEqual([
      { kind: 'text', text: 'Hola ' },
      { kind: 'marker', name: 'usuario.nombre' },
      { kind: 'text', text: ':\n' },
      { kind: 'marker', name: 'hoy.fecha' },
      { kind: 'text', text: '{{#x}}' },
    ]);
  });
});
