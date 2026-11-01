// Pruebas de las funciones que sumó la vista de DevTools: las opciones del
// CSV, los errores con posición de Base64 y URL, la validación previa de
// los códigos de barras y los detalles de las listas.
import { describe, expect, it } from 'vitest';
import { jsonToCsv, jsonToCsvTable } from './tools/formats';
import { base64InvalidAt, htmlEncode, urlInvalidAt } from './tools/encoding';
import { lorem } from './tools/generators';
import { checkBarcode, encodeBarcode, gs1CheckDigit } from './tools/codes';
import { groupNames } from './tools/regex';
import { detectSeparator, duplicateCounts, findUnclosedQuote, toSqlList, type SqlListOptions } from './tools/lists';

describe('CSV con opciones', () => {
  it('usa punto y coma o tab, y puede ir sin encabezados', () => {
    const json = '[{"a":1,"b":"x;y"},{"a":2,"b":"z"}]';
    expect(jsonToCsv(json, { separator: ';', headers: true })).toEqual({ ok: true, value: 'a;b\n1;"x;y"\n2;z' });
    expect(jsonToCsv(json, { separator: '\t', headers: false })).toEqual({ ok: true, value: '1\tx;y\n2\tz' });
    // Con coma, la coma dentro de un valor sigue yendo entre comillas.
    expect(jsonToCsv('[{"a":"1,5"}]')).toEqual({ ok: true, value: 'a\n"1,5"' });
  });

  it('cuenta filas y columnas', () => {
    expect(jsonToCsvTable('[{"a":1},{"b":2,"c":3}]')).toMatchObject({ ok: true, value: { rows: 2, columns: 3 } });
  });
});

describe('posición de los errores de codificación', () => {
  it('Base64: el primer carácter fuera del alfabeto', () => {
    expect(base64InvalidAt('SG9s*YQ==')).toEqual({ char: '*', pos: 5 });
    expect(base64InvalidAt('SG9s\nYQ==')).toBeNull();
    expect(base64InvalidAt('a-b_')).toBeNull();
    expect(base64InvalidAt('YQ==YQ')).toEqual({ char: 'Y', pos: 5 });
  });

  it('URL: un % sin cifras o con bytes que no son UTF-8', () => {
    expect(urlInvalidAt('a%2')).toBe(2);
    expect(urlInvalidAt('ok%20y%zz')).toBe(7);
    expect(urlInvalidAt('%C3%B1%FF')).toBe(1);
    expect(urlInvalidAt('%C3%B1 bien')).toBeNull();
  });

  it('HTML: también los no ASCII si se pide', () => {
    expect(htmlEncode('café <b>', true)).toBe('caf&#233; &lt;b&gt;');
    expect(htmlEncode('café')).toBe('café');
    expect(htmlEncode('🚀', true)).toBe('&#128640;');
  });
});

describe('lorem sin la frase clásica', () => {
  it('no empieza por Lorem ipsum dolor sit amet', () => {
    expect(lorem('words', 4, false).split(' ')).toHaveLength(4);
    expect(lorem('sentences', 2, false)).not.toMatch(/^Lorem ipsum dolor sit amet,/);
    expect(lorem('paragraphs', 2, false).split('\n\n')).toHaveLength(2);
  });
});

describe('validación previa de los códigos de barras', () => {
  it('calcula y comprueba el dígito de control GS1', () => {
    expect(gs1CheckDigit('590123412345')).toBe(7);
    expect(gs1CheckDigit('9638507')).toBe(4); // EAN-8 96385074
    expect(checkBarcode('590123412345', 'EAN13')).toEqual({ ok: true, value: '590123412345', checkDigit: 7 });
    expect(checkBarcode('5901234123457', 'EAN13')).toEqual({ ok: true, value: '5901234123457' });
    expect(checkBarcode('5901234123450', 'EAN13')).toEqual({ ok: false, kind: 'check-digit', expected: 7, actual: 0 });
    expect(checkBarcode('12345', 'UPC')).toEqual({ ok: false, kind: 'length', expected: [11, 12], actual: 5 });
    expect(checkBarcode('12a4', 'ITF14')).toEqual({ ok: false, kind: 'chars', char: 'a', pos: 3 });
  });

  it('lo que pasa la validación también lo acepta JsBarcode', () => {
    for (const [value, format] of [['590123412345', 'EAN13'], ['9638507', 'EAN8'], ['03600029145', 'UPC'], ['1234567890123', 'ITF14']] as const) {
      expect(checkBarcode(value, format).ok).toBe(true);
      expect(encodeBarcode(value, format).ok).toBe(true);
    }
  });

  it('CODE39 pasa a mayúsculas; CODE128 rechaza lo que no es ASCII', () => {
    expect(checkBarcode('abc-1', 'CODE39')).toEqual({ ok: true, value: 'ABC-1', uppercased: true });
    expect(checkBarcode('AB_1', 'CODE39')).toEqual({ ok: false, kind: 'chars', char: '_', pos: 3 });
    expect(checkBarcode('Año', 'CODE128')).toEqual({ ok: false, kind: 'chars', char: 'ñ', pos: 2 });
    expect(checkBarcode('Logday-01', 'CODE128').ok).toBe(true);
  });

  it('Codabar con o sin inicio y fin', () => {
    expect(checkBarcode('a123b', 'codabar')).toEqual({ ok: true, value: 'A123B' });
    expect(encodeBarcode('A123B', 'codabar').ok).toBe(true);
    expect(checkBarcode('12-34', 'codabar')).toEqual({ ok: true, value: '12-34' });
    expect(checkBarcode('A12X4B', 'codabar')).toEqual({ ok: false, kind: 'chars', char: 'X', pos: 4 });
  });
});

const base: SqlListOptions = {
  trim: true, skipEmpty: true, dedupe: true, quote: 'single', numbersUnquoted: true,
  compact: false, onePerLine: false, parentheses: false, column: '', chunkSize: 0,
};

describe('detalles de las listas', () => {
  it('NULL sin comillas y los ceros a la izquierda como texto', () => {
    expect(toSqlList('7\n007\nNULL\nnull', 'auto', base).sql).toBe("7, '007', NULL, 'null'");
    expect(toSqlList('NULL', 'auto', { ...base, numbersUnquoted: false }).sql).toBe("'NULL'");
  });

  it('dice qué separador detectó', () => {
    expect(detectSeparator('a\r\nb')).toBe('newline');
    expect(detectSeparator('a\tb')).toBe('tab');
    expect(detectSeparator('a;b,c')).toBe('semicolon');
    expect(detectSeparator('a,b')).toBe('comma');
  });

  it('encuentra la comilla sin cerrar', () => {
    expect(findUnclosedQuote("'a', 'O''Brien'")).toBeNull();
    expect(findUnclosedQuote("'a', 'b")).toBe(6);
    expect(findUnclosedQuote('"x", \'y\'')).toBeNull();
  });

  it('cuenta los repetidos con la forma de la primera vez', () => {
    expect(duplicateCounts(['a', 'A', 'b', 'a', ''], { trim: true, ignoreCase: true })).toEqual([{ value: 'a', times: 3 }]);
    expect(duplicateCounts(['a', 'A'], { trim: false, ignoreCase: false })).toEqual([]);
  });
});

describe('nombres de los grupos del regex', () => {
  it('en el orden de JavaScript, sin contar los que no capturan', () => {
    expect(groupNames('(\\d+)-(?<mes>\\d{2})(?:x)(?=y)(?<!z)[(](a)')).toEqual([null, 'mes', null]);
    expect(groupNames('\\(no\\)')).toEqual([]);
  });
});
