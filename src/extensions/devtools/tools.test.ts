import { describe, expect, it } from 'vitest';
import {
  formatJson, formatXml, formatYaml, jsonToCsv, jsonToYaml, minifyJson, minifyXml, parseJson, yamlToJson,
} from './tools/formats';
import { base64Decode, base64Encode, decodeJwt, htmlDecode, htmlEncode, urlDecode, urlEncode } from './tools/encoding';
import { generatePassword, lorem, passwordEntropy, uuidV4, uuidV7 } from './tools/generators';
import { hashAll, md5 } from './tools/hash';
import { formatInZone, parseDateInput, parseTimestamp, relativeTime } from './tools/time';
import { describeCron, nextRuns } from './tools/cron';
import { runRegex, segments } from './tools/regex';
import { diffStats, lineDiff } from './tools/diff';
import { noteCodeBlocks, readDevtoolsSettings, toolForBlock } from './model';

const bytes = (s: string) => new TextEncoder().encode(s);
const errorOf = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }) => (r.ok ? null : r.error);

describe('JSON', () => {
  it('formatea con 2, 4 espacios o tab y minifica', () => {
    expect(formatJson('{"a":[1,2]}', 2)).toEqual({ ok: true, value: '{\n  "a": [\n    1,\n    2\n  ]\n}' });
    expect(formatJson('{"a":1}', 4)).toEqual({ ok: true, value: '{\n    "a": 1\n}' });
    expect(formatJson('{"a":1}', 'tab')).toEqual({ ok: true, value: '{\n\t"a": 1\n}' });
    expect(minifyJson('{ "a" : [ 1 , 2 ] }')).toEqual({ ok: true, value: '{"a":[1,2]}' });
  });

  it('dice dónde está el error, en línea y columna', () => {
    expect(errorOf(parseJson('{\n  "a": 1,\n  "b" 2\n}'))).toEqual({ code: 'json-unexpected-token', line: 3, column: 7 });
    expect(errorOf(parseJson('{"a": [1, 2'))).toMatchObject({ code: 'json-unexpected-end' });
    expect(errorOf(parseJson('{"a": 01}'))).toMatchObject({ code: 'json-unexpected-token', line: 1, column: 8 });
    expect(errorOf(parseJson('{"a": "x\\q"}'))).toMatchObject({ code: 'json-bad-string' });
    expect(errorOf(parseJson('{"a": 1} x'))).toMatchObject({ code: 'json-trailing', line: 1, column: 10 });
    expect(errorOf(parseJson('{"a": 1,}'))).toMatchObject({ code: 'json-unexpected-token', column: 9 });
  });
});

describe('YAML y conversiones', () => {
  it('formatea YAML y convierte de ida y vuelta con JSON', () => {
    expect(formatYaml('a:   1\nb: [x, z]', 2)).toEqual({ ok: true, value: 'a: 1\nb:\n  - x\n  - z' });
    // "y" es un booleano en YAML 1.1: js-yaml lo deja entre comillas para no cambiarle el tipo.
    expect(formatYaml('b: [y]', 2)).toEqual({ ok: true, value: "b:\n  - 'y'" });
    expect(jsonToYaml('{"name":"Logday","tags":["a"]}', 2)).toEqual({ ok: true, value: 'name: Logday\ntags:\n  - a' });
    expect(yamlToJson('name: Logday\ncount: 3', 2)).toEqual({ ok: true, value: '{\n  "name": "Logday",\n  "count": 3\n}' });
  });

  it('marca el error de YAML con su línea', () => {
    expect(errorOf(formatYaml('a: 1\n b: 2\nc: [', 2))).toMatchObject({ code: 'yaml-invalid', line: 2 });
  });

  it('no ejecuta tipos de JavaScript al leer YAML', () => {
    expect(errorOf(formatYaml('a: !!js/function "function(){}"', 2))).toMatchObject({ code: 'yaml-invalid' });
  });

  it('pasa un arreglo de objetos a CSV con la unión de columnas', () => {
    expect(jsonToCsv('[{"a":1,"b":"x,y"},{"b":"he said \\"hi\\"","c":{"d":1}}]')).toEqual({
      ok: true,
      value: 'a,b,c\n1,"x,y",\n,"he said ""hi""","{""d"":1}"',
    });
    expect(errorOf(jsonToCsv('{"a":1}'))).toMatchObject({ code: 'csv-not-array' });
    expect(errorOf(jsonToCsv('[1,2]'))).toMatchObject({ code: 'csv-not-objects' });
  });
});

describe('XML', () => {
  it('formatea y minifica', () => {
    const xml = '<?xml version="1.0"?><root a="1"><!-- c --><item>uno</item><empty/><list><x/><y>2</y></list></root>';
    expect(formatXml(xml, 2)).toEqual({
      ok: true,
      value: '<?xml version="1.0"?>\n<root a="1">\n  <!-- c -->\n  <item>uno</item>\n  <empty/>\n  <list>\n    <x/>\n    <y>2</y>\n  </list>\n</root>',
    });
    expect(minifyXml('<a>\n  <b>1</b>\n</a>')).toEqual({ ok: true, value: '<a><b>1</b></a>' });
  });

  it('un comentario con ">" dentro no corta la lectura', () => {
    expect(formatXml('<a><!-- 1 > 0 --><!-- b --></a>', 2)).toMatchObject({ ok: true });
  });

  it('detecta etiquetas mal cerradas, atributos sin comillas y dos raíces', () => {
    expect(errorOf(formatXml('<a>\n  <b></c>\n</a>', 2))).toMatchObject({ code: 'xml-invalid', line: 2, column: 6 });
    expect(errorOf(formatXml('<a x=1/>', 2))).toMatchObject({ code: 'xml-invalid' });
    expect(errorOf(formatXml('<a/><b/>', 2))).toMatchObject({ code: 'xml-invalid', detail: 'more than one root element' });
    expect(errorOf(formatXml('<a><b></a>', 2))).toMatchObject({ code: 'xml-invalid' });
    expect(errorOf(formatXml('<a>', 2))).toMatchObject({ code: 'xml-invalid', detail: 'unclosed <a>' });
  });
});

describe('codificar y decodificar', () => {
  it('Base64 con UTF-8, normal y URL-safe', () => {
    expect(base64Encode('canción ñ 🚀', false)).toBe('Y2FuY2nDs24gw7Eg8J+agA==');
    expect(base64Encode('canción ñ 🚀', true)).toBe('Y2FuY2nDs24gw7Eg8J-agA');
    expect(base64Decode('Y2FuY2nDs24gw7Eg8J-agA')).toEqual({ ok: true, value: 'canción ñ 🚀' });
    expect(base64Decode('Y2Fu\nY2nDs24=')).toEqual({ ok: true, value: 'canción' });
    expect(errorOf(base64Decode('no es base64!'))).toMatchObject({ code: 'base64-invalid' });
    expect(errorOf(base64Decode('/w=='))).toMatchObject({ code: 'base64-invalid' }); // 0xFF no es UTF-8
  });

  it('URL y entidades HTML', () => {
    expect(urlEncode('a b&c=ñ')).toBe('a%20b%26c%3D%C3%B1');
    expect(urlDecode('a+b%20c')).toEqual({ ok: true, value: 'a b c' });
    expect(errorOf(urlDecode('%E0%A4%A'))).toMatchObject({ code: 'url-invalid' });
    expect(htmlEncode('<a href="x">Tom & Jerry\'s</a>')).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
    expect(htmlDecode('&lt;p&gt; &aacute; &#241; &#x1F680; &desconocida;')).toBe('<p> á ñ 🚀 &desconocida;');
  });

  it('decodifica un JWT sin verificar la firma y lee sus fechas', () => {
    const enc = (o: object) => base64Encode(JSON.stringify(o), true);
    const token = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: '42', iat: 1_700_000_000, exp: 1_700_003_600 })}.firma`;
    const r = decodeJwt(`Bearer ${token}`, 1_700_007_200_000);
    expect(r.ok && r.value.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(r.ok && r.value.payload.sub).toBe('42');
    expect(r.ok && r.value.times).toEqual({ iat: 1_700_000_000_000, exp: 1_700_003_600_000 });
    expect(r.ok && r.value.expired).toBe(true);
    expect(errorOf(decodeJwt('a.b'))).toMatchObject({ code: 'jwt-parts' });
    expect(errorOf(decodeJwt('xx.yy.zz'))).toMatchObject({ code: 'jwt-part-invalid', detail: 'header' });
  });
});

describe('generadores', () => {
  it('UUID v4 y v7 con su versión y variante; los v7 se ordenan por fecha', () => {
    const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-([47])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(uuidV4()).toMatch(shape);
    const a = uuidV7(1_700_000_000_000);
    const b = uuidV7(1_700_000_000_001);
    expect(a).toMatch(shape);
    expect(a[14]).toBe('7');
    expect(a.slice(0, 13).replace('-', '')).toBe((1_700_000_000_000).toString(16).padStart(12, '0'));
    expect(a < b).toBe(true);
  });

  it('contraseñas con la longitud y al menos uno de cada juego', () => {
    const opts = { length: 24, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: true };
    for (let i = 0; i < 50; i++) {
      const p = generatePassword(opts)!;
      expect(p).toHaveLength(24);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
    expect(generatePassword({ ...opts, lower: false, upper: false, digits: false, symbols: false })).toBeNull();
    expect(generatePassword({ ...opts, length: 1 })).toHaveLength(4);
    expect(passwordEntropy({ ...opts, avoidAmbiguous: false, symbols: false })).toBe(Math.round(24 * Math.log2(62)));
  });

  it('lorem ipsum empieza por "Lorem ipsum dolor sit amet"', () => {
    expect(lorem('words', 3)).toBe('Lorem ipsum dolor');
    expect(lorem('words', 10).split(' ')).toHaveLength(10);
    expect(lorem('sentences', 2)).toMatch(/^Lorem ipsum dolor sit amet, [a-z]/);
    expect(lorem('paragraphs', 3).split('\n\n')).toHaveLength(3);
  });
});

describe('hashes', () => {
  it('MD5 con los vectores del RFC 1321', () => {
    expect(md5(bytes(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5(bytes('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5(bytes('The quick brown fox jumps over the lazy dog'))).toBe('9e107d9d372bb6826bd81d3542a419d6');
    expect(md5(bytes('a'.repeat(1000)))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8');
  });

  it('SHA-1, SHA-256 y SHA-512 de un texto', async () => {
    const all = await hashAll('abc');
    expect(all['SHA-1']).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(all['SHA-256']).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(all['SHA-512'].slice(0, 16)).toBe('ddaf35a193617aba');
  });
});

describe('fechas', () => {
  it('detecta segundos o milisegundos', () => {
    expect(parseTimestamp('1700000000')).toEqual({ ok: true, value: { ms: 1_700_000_000_000, unit: 'seconds' } });
    expect(parseTimestamp('1700000000123')).toEqual({ ok: true, value: { ms: 1_700_000_000_123, unit: 'milliseconds' } });
    expect(parseTimestamp('1 700 000 000', 'seconds')).toMatchObject({ ok: true });
    expect(errorOf(parseTimestamp('mañana'))).toMatchObject({ code: 'timestamp-invalid' });
    expect(errorOf(parseTimestamp('1e30'))).toMatchObject({ code: 'timestamp-invalid' });
  });

  it('lee fechas ISO con y sin zona (sin zona, en la hora local)', () => {
    expect(parseDateInput('2026-10-30T12:00:00Z')).toEqual({ ok: true, value: Date.UTC(2026, 9, 30, 12) });
    expect(parseDateInput('2026-10-30T07:00:00-05:00')).toEqual({ ok: true, value: Date.UTC(2026, 9, 30, 12) });
    // Las pruebas corren en America/Bogota (UTC-5).
    expect(parseDateInput('2026-10-30 07:00')).toEqual({ ok: true, value: Date.UTC(2026, 9, 30, 12) });
    expect(errorOf(parseDateInput('2026-02-31'))).toMatchObject({ code: 'date-invalid' });
    expect(errorOf(parseDateInput('30/10/2026'))).toMatchObject({ code: 'date-invalid' });
  });

  it('muestra la fecha en una zona y el tiempo relativo', () => {
    const ms = Date.UTC(2026, 9, 30, 12);
    expect(formatInZone(ms, 'America/Bogota', 'es')).toMatch(/30 de octubre de 2026.*7:00:00/);
    expect(relativeTime(ms - 3 * 3600_000, ms, 'es')).toBe('hace 3 horas');
    expect(relativeTime(ms + 2 * 86_400_000, ms, 'en')).toBe('in 2 days');
  });
});

describe('cron', () => {
  it('describe en español y en inglés', () => {
    expect(describeCron('*/15 9-17 * * 1-5', 'en')).toEqual({
      ok: true,
      value: 'Every 15 minutes, between 09:00 and 17:59, Monday through Friday',
    });
    const es = describeCron('0 8 * * 1', 'es');
    expect(es.ok && es.value).toMatch(/08:00.*lunes/i);
    expect(errorOf(describeCron('99 * * * *', 'es'))).toMatchObject({ code: 'cron-invalid' });
  });

  it('calcula las próximas ejecuciones en la hora local', () => {
    const from = new Date(2026, 9, 30, 10, 7).getTime(); // viernes 30 oct 10:07
    const runs = nextRuns('*/15 9-17 * * 1-5', from, 3)!.map((ms) => new Date(ms).toString().slice(0, 21));
    expect(runs).toEqual(['Fri Oct 30 2026 10:15', 'Fri Oct 30 2026 10:30', 'Fri Oct 30 2026 10:45']);
    const weekly = nextRuns('0 8 * * MON', from, 1)!;
    expect(new Date(weekly[0]).toString().slice(0, 21)).toBe('Mon Nov 02 2026 08:00');
    expect(nextRuns('@daily', from, 1)!.map((ms) => new Date(ms).getHours())).toEqual([0]);
    expect(nextRuns('0 0 30 2 *', from, 1)).toEqual([]);
    expect(nextRuns('0 0 0 * * * 2026', from, 1)).toBeNull(); // 7 campos (con año)
    expect(nextRuns('0 0 L * *', from, 1)).toBeNull(); // L de Quartz
  });
});

describe('regex', () => {
  it('lista coincidencias con sus grupos', () => {
    const r = runRegex('(?<user>\\w+)@(\\w+)\\.com', 'g', 'ana@fcv.com y luis@logday.com');
    expect(r.ok && r.value.matches.map((m) => [m.text, m.groups, m.named.user])).toEqual([
      ['ana@fcv.com', ['ana', 'fcv'], 'ana'],
      ['luis@logday.com', ['luis', 'logday'], 'luis'],
    ]);
    const one = runRegex('\\d', '', 'a1b2');
    expect(one.ok && one.value.matches).toHaveLength(1);
  });

  it('no se cuelga con coincidencias vacías', () => {
    const r = runRegex('x*', 'g', 'abc');
    expect(r.ok && r.value.matches).toHaveLength(4);
  });

  it('un patrón inválido da error', () => {
    expect(errorOf(runRegex('(', 'g', 'x'))).toMatchObject({ code: 'regex-invalid' });
  });

  it('parte el texto en tramos para resaltar', () => {
    const r = runRegex('o', 'g', 'logo');
    expect(segments('logo', r.ok ? r.value.matches : [])).toEqual([
      { text: 'l', match: null }, { text: 'o', match: 0 }, { text: 'g', match: null }, { text: 'o', match: 1 },
    ]);
  });
});

describe('diff por líneas', () => {
  it('marca lo agregado y lo quitado con su número de línea', () => {
    const lines = lineDiff('a\nb\nc', 'a\nB\nc\nd');
    expect(lines).toEqual([
      { kind: 'same', text: 'a', left: 1, right: 1 },
      { kind: 'removed', text: 'b', left: 2 },
      { kind: 'added', text: 'B', right: 2 },
      { kind: 'same', text: 'c', left: 3, right: 3 },
      { kind: 'added', text: 'd', right: 4 },
    ]);
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1 });
  });

  it('puede ignorar los espacios', () => {
    expect(diffStats(lineDiff('a  b\n c', 'a b\nc', { ignoreWhitespace: true }))).toEqual({ added: 0, removed: 0 });
  });
});

describe('bloques de las notas', () => {
  it('lista los bloques de código de cualquier lenguaje', () => {
    const md = '# Nota\n```json\n{"a":1}\n```\ntexto\n~~~\neyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.x\n~~~\n```yaml title\nb: 2\n```';
    const blocks = noteCodeBlocks(md);
    expect(blocks.map((b) => [b.language, b.code])).toEqual([
      ['json', '{"a":1}'],
      ['', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.x'],
      ['yaml', 'b: 2'],
    ]);
    expect(blocks.map(toolForBlock)).toEqual(['json', 'jwt', 'yaml']);
    expect(toolForBlock({ language: 'python', code: 'print(1)' })).toBeNull();
  });

  it('las preferencias guardadas inválidas vuelven a las de siempre', () => {
    expect(readDevtoolsSettings({ lastTool: 'nada', options: 'x' })).toEqual({ lastTool: 'json', options: {} });
    expect(readDevtoolsSettings({ lastTool: 'jwt' }).lastTool).toBe('jwt');
  });
});
