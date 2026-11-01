import { describe, expect, it } from 'vitest';
import { makeTr } from './text';

describe('textos de DevTools', () => {
  it('elige singular o plural según la cantidad', () => {
    const es = makeTr('es');
    expect(es('sqlDupsRemoved', { n: 1 })).toBe('1 duplicado quitado');
    expect(es('sqlDupsRemoved', { n: 3 })).toBe('3 duplicados quitados');
    expect(es('csvSummary', { rows: 1, cols: 2 })).toBe('1 fila · 2 columnas');
    expect(es('listCount', { n: 1200 })).toBe('1.200 valores');
    expect(makeTr('en')('regexMatches', { n: 1 })).toBe('1 match');
  });
});
