import { describe, expect, it } from 'vitest';
import { compareLists, fromSqlList, splitValues, toSqlList, type SqlListOptions } from './tools/lists';
import { barcodeSvg, encodeBarcode, qrMatrix, qrSvg } from './tools/codes';
import { cronFieldCount, nextRuns } from './tools/cron';

const base: SqlListOptions = {
  trim: true, skipEmpty: true, dedupe: true, quote: 'single', numbersUnquoted: false,
  compact: false, onePerLine: false, parentheses: false, column: '', chunkSize: 0,
};

describe('lista a IN de SQL', () => {
  it('parte por líneas, tabs, punto y coma o comas', () => {
    expect(splitValues('a\nb\r\nc')).toEqual(['a', 'b', 'c']);
    expect(splitValues('a\tb')).toEqual(['a', 'b']);
    expect(splitValues('a;b')).toEqual(['a', 'b']);
    expect(splitValues('a, b')).toEqual(['a', ' b']);
  });

  it('con comilla simple, escapando las comillas y quitando repetidos y vacíos', () => {
    const r = toSqlList("ana\nO'Brien\n\nana\n 42 ", 'auto', base);
    expect(r).toEqual({ sql: "'ana', 'O''Brien', '42'", count: 3, removed: 2, groups: 1 });
  });

  it('sin comillas, compacto, con paréntesis o con columna', () => {
    expect(toSqlList('1\n2\n3', 'auto', { ...base, quote: 'none', compact: true, parentheses: true }).sql).toBe('(1,2,3)');
    expect(toSqlList('a\n7', 'auto', { ...base, numbersUnquoted: true, column: 'codigo' }).sql).toBe("codigo IN ('a', 7)");
  });

  it('parte en grupos de N con OR (el límite de Oracle)', () => {
    expect(toSqlList('1\n2\n3', 'auto', { ...base, quote: 'none', column: 'id', chunkSize: 2 }).sql).toBe('(id IN (1, 2) OR id IN (3))');
    expect(toSqlList('1\n2\n3', 'auto', { ...base, quote: 'none', chunkSize: 2 })).toMatchObject({ sql: '1, 2\n\n3', groups: 2 });
  });

  it('un valor por línea', () => {
    expect(toSqlList('a\nb', 'auto', { ...base, onePerLine: true, parentheses: true }).sql).toBe("(\n  'a',\n  'b'\n)");
  });

  it('de vuelta: de un IN a un valor por línea', () => {
    expect(fromSqlList("'a', 'b,c', 'O''Brien'")).toEqual(['a', 'b,c', "O'Brien"]);
    expect(fromSqlList("WHERE codigo IN ('x','y') OR codigo IN ('z')")).toEqual(['x', 'y', 'z']);
    expect(fromSqlList('IN (1, 2,\n 3)')).toEqual(['1', '2', '3']);
    expect(fromSqlList("('', 'b')")).toEqual(['', 'b']);
  });
});

describe('comparar listas', () => {
  it('solo en A, solo en B, en las dos, unión y duplicados', () => {
    const r = compareLists(['a', 'B', 'c', 'a', ' d '], ['b', 'e', 'd'], { trim: true, ignoreCase: true });
    expect(r).toEqual({
      onlyA: ['a', 'c'], onlyB: ['e'], both: ['B', 'd'], union: ['a', 'B', 'c', 'd', 'e'],
      duplicatesA: ['a'], duplicatesB: [], countA: 4, countB: 3,
    });
    expect(compareLists(['A'], ['a'], { trim: false, ignoreCase: false }).both).toEqual([]);
  });
});

describe('QR', () => {
  it('genera la matriz con UTF-8 y crece la versión con el texto', () => {
    const small = qrMatrix('https://logday.app', 'M');
    expect(small.ok && small.value.size).toBe(25); // versión 2
    const long = qrMatrix('x'.repeat(500), 'M');
    expect(long.ok && long.value.version).toBeGreaterThan(10);
    expect(qrMatrix('canción ñ 🚀', 'H').ok).toBe(true);
    expect(qrMatrix('x'.repeat(3000), 'H')).toMatchObject({ ok: false, error: { code: 'qr-too-long' } });
  });

  it('el SVG lleva fondo blanco, margen y un path', () => {
    const m = qrMatrix('hola', 'L');
    const svg = m.ok ? qrSvg(m.value, { scale: 4, margin: 4 }) : '';
    expect(svg).toMatch(/^<svg [^>]*width="116" height="116" viewBox="0 0 29 29"/);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('<path d="M4 4h1v1h-1z');
  });
});

describe('códigos de barras', () => {
  it('codifica y calcula el dígito de control de EAN-13', () => {
    expect(encodeBarcode('590123412345', 'EAN13')).toMatchObject({ ok: true, value: { text: '5901234123457' } });
    expect(encodeBarcode('5901234123450', 'EAN13')).toMatchObject({ ok: false, error: { code: 'barcode-invalid' } });
    expect(encodeBarcode('ABC', 'EAN13').ok).toBe(false);
    expect(encodeBarcode('Logday-01', 'CODE128')).toMatchObject({ ok: true, value: { text: 'Logday-01' } });
    expect(encodeBarcode('', 'CODE128').ok).toBe(false);
  });

  it('dibuja las barras y el texto, escapado', () => {
    const c = encodeBarcode('A<B', 'CODE128');
    const svg = c.ok ? barcodeSvg(c.value, { barWidth: 2, height: 60, showText: true, margin: 10 }) : '';
    expect(svg).toContain('<rect x="10" y="10" width="4" height="60"/>');
    expect(svg).toContain('>A&lt;B</text>');
  });
});

describe('cron con segundos', () => {
  it('detecta 5 o 6 campos y calcula los segundos', () => {
    expect(cronFieldCount('0 */5 * * * *')).toBe(6);
    expect(cronFieldCount('@hourly')).toBe(5);
    expect(cronFieldCount('* * *')).toBeNull();
    const from = new Date(2026, 9, 30, 10, 7, 20).getTime();
    const runs = nextRuns('*/30 * * * * *', from, 3)!.map((ms) => new Date(ms).toTimeString().slice(0, 8));
    expect(runs).toEqual(['10:07:30', '10:08:00', '10:08:30']);
  });
});
