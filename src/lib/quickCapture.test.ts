import { describe, expect, it } from 'vitest';
import { parseQuickCapture } from './quickCapture';

const TODAY = '2026-10-27'; // martes
const PROJECTS = ['inbox', 'logday', 'maxibot', 'logday/mobile'];
const parse = (s: string) => parseQuickCapture(s, PROJECTS, TODAY);

describe('parseQuickCapture', () => {
  it('proyecto, tags y fecha al final', () => {
    expect(parse('Llamar al proveedor #Logday @infra @urgente mañana')).toEqual({
      title: 'Llamar al proveedor', project: 'logday', tags: ['infra', 'urgente'], due: '2026-10-28',
    });
  });

  it('un #proyecto que no existe queda en el título', () => {
    expect(parse('Revisar issue #42')).toEqual({ title: 'Revisar issue #42', project: undefined, tags: [], due: undefined });
  });

  it('proyectos anidados', () => {
    expect(parse('Ajustar tabs #logday/mobile').project).toBe('logday/mobile');
  });

  it('la fecha relativa solo cuenta al final del título', () => {
    expect(parse('Preparar la reunión de mañana con Ana').due).toBeUndefined();
    expect(parse('Preparar la reunión de mañana')).toMatchObject({ title: 'Preparar la reunión', due: '2026-10-28' });
  });

  it('una sola palabra de fecha es un título, no una fecha', () => {
    expect(parse('Mañana')).toMatchObject({ title: 'Mañana', due: undefined });
  });

  it('días de la semana: el próximo, y el mismo día es la semana siguiente', () => {
    expect(parse('Llamar el viernes')).toMatchObject({ title: 'Llamar', due: '2026-10-30' });
    expect(parse('Entregar martes').due).toBe('2026-11-03');
    expect(parse('Demo pasado mañana').due).toBe('2026-10-29');
    expect(parse('Deploy hoy').due).toBe(TODAY);
  });

  it('fechas explícitas en cualquier lugar', () => {
    expect(parse('Renovar 15/11 dominio').due).toBe('2026-11-15');
    expect(parse('Cierre 2027-01-05').due).toBe('2027-01-05');
    expect(parse('Impuestos 10/03').due).toBe('2027-03-10'); // ya pasó este año
    expect(parse('Nada 31/02').due).toBeUndefined();
  });
});
