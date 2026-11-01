import { describe, expect, it } from 'vitest';
import { interpolate } from './interpolate';

describe('interpolate', () => {
  it('rellena valores y elige la forma del plural', () => {
    expect(interpolate('{n} {n|valor|valores}', { n: 1 })).toBe('1 valor');
    expect(interpolate('{n} {n|valor|valores}', { n: 2 })).toBe('2 valores');
    expect(interpolate('{min|Queda|Quedan} {min} min', { min: 1 })).toBe('Queda 1 min');
    expect(interpolate('Hola {x}', { x: 'tú' })).toBe('Hola tú');
    expect(interpolate('Sin {x}', undefined)).toBe('Sin {x}');
  });

  it('las formas pueden llevar el número dentro', () => {
    expect(interpolate('{n|Hay 1 más|Hay {n} más}.', { n: 1 })).toBe('Hay 1 más.');
    expect(interpolate('{n|Hay 1 más|Hay {n} más}.', { n: 1200 }, (v) => v.toLocaleString('es-CO'))).toBe('Hay 1.200 más.');
  });
});
