import { describe, expect, it } from 'vitest';
import { normalizeProgress, progressToPayload, withNormalizedProgress } from './taskProgress';

describe('normalizeProgress', () => {
  it('deja igual un entero dentro del rango, incluido 0', () => {
    expect(normalizeProgress(0)).toBe(0);
    expect(normalizeProgress(40)).toBe(40);
    expect(normalizeProgress(100)).toBe(100);
  });

  it('redondea los decimales y lleva al borde lo que se sale del rango', () => {
    expect(normalizeProgress(40.4)).toBe(40);
    expect(normalizeProgress(40.5)).toBe(41);
    expect(normalizeProgress(150)).toBe(100);
    expect(normalizeProgress(-5)).toBe(0);
  });

  it('acepta strings numéricos, con o sin % al final', () => {
    expect(normalizeProgress('40')).toBe(40);
    expect(normalizeProgress(' 75 ')).toBe(75);
    expect(normalizeProgress('40%')).toBe(40);
    expect(normalizeProgress('12.7')).toBe(13);
  });

  it('lo que no es un número cuenta como sin progreso', () => {
    for (const v of [undefined, null, '', '   ', 'mucho', 'null', NaN, Infinity, true, {}, [40]]) {
      expect(normalizeProgress(v)).toBeUndefined();
    }
  });
});

describe('progressToPayload', () => {
  it('manda null sin progreso y nunca un valor inválido', () => {
    expect(progressToPayload(undefined)).toBeNull();
    expect(progressToPayload(0)).toBe(0);
    expect(progressToPayload(101)).toBe(100);
    expect(progressToPayload(33.3)).toBe(33);
  });
});

describe('withNormalizedProgress', () => {
  it('quita la clave si no hay progreso y normaliza si hay', () => {
    expect('progress' in withNormalizedProgress({ id: 'a', progress: undefined })).toBe(false);
    expect(withNormalizedProgress({ id: 'a', progress: 250 }).progress).toBe(100);
  });

  it('devuelve el mismo objeto si ya estaba bien', () => {
    const task = { id: 'a', progress: 40 };
    expect(withNormalizedProgress(task)).toBe(task);
  });
});
