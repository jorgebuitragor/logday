// Parser v2 y ediciones de las tablas (specs/cliente-http HT40–HT43, design
// §14.3): la ida y vuelta tabla ↔ texto. Cada edición se comprueba con el
// parser (`parse(aplicar(e))` da lo esperado) y con que las líneas de fuera
// de la zona no cambian.
import { describe, expect, it } from 'vitest';
import { parseHttpBlock, variablesOf, type ParsedRequest } from './parse';
import {
  addHeaderRow, addQueryRow, encodeQueryPart, isLiteral, moveHeaderRow, moveQueryRow, readAuth, readRequestLine, removeHeaderRow,
  removeQueryRow, setAuth, setHeaderRow, setQueryRow, setRequestBody, splitBasic, toggleHeaderRow, toggleQueryRow, writeRequestLine, type AuthContext,
} from './requestEdit';

const req = (code: string, i = 0): ParsedRequest => parseHttpBlock(code).requests[i];
const rows = (code: string, i = 0) => req(code, i).query.map((r) => `${r.enabled ? '' : '!'}${r.name}=${r.value}@${r.place}`);
const headers = (code: string, i = 0) => req(code, i).headerRows.map((h) => `${h.enabled ? '' : '!'}${h.name}: ${h.value}`);
const NO_SECRETS: AuthContext = { isSecret: () => false };

/** Las líneas que no son de la petición `i` quedan igual. */
function othersUnchanged(before: string, after: string, i: number) {
  const a = parseHttpBlock(before).requests;
  const b = parseHttpBlock(after).requests;
  expect(b.length).toBe(a.length);
  a.forEach((r, k) => {
    if (k !== i) expect(b[k].source).toBe(r.source);
  });
}

describe('parser v2: la query (HT41)', () => {
  it('los parámetros de la URL y de las líneas ?/&, en orden y con su lugar', () => {
    const code = 'GET https://x.com/s?q=hola&page=2\n  &size=10\n# &debug=true\nAccept: */*';
    const r = req(code);
    expect(rows(code)).toEqual(['q=hola@url', 'page=2@url', 'size=10@line', '!debug=true@line']);
    expect(r.urlLine).toBe('https://x.com/s?q=hola&page=2');
    expect(r.url).toBe('https://x.com/s?q=hola&page=2&size=10');
    expect(r.headerRows.map((h) => h.name)).toEqual(['Accept']);
    expect(r.issues).toEqual([]);
  });

  it('comentarios entre las líneas & ya no cortan la query (antes daban invalid_header)', () => {
    const code = 'GET https://x.com\n?a=1\n# un comentario\n&b=2\n// otro\n&c=3\nAccept: x';
    expect(rows(code)).toEqual(['a=1@line', 'b=2@line', 'c=3@line']);
    expect(req(code).url).toBe('https://x.com?a=1&b=2&c=3');
    expect(req(code).issues).toEqual([]);
  });

  it('la URL se arma con ? o & según haga falta, aunque el primero esté desactivado', () => {
    expect(req('GET https://x.com\n# ?a=1\n&b=2').url).toBe('https://x.com?b=2');
    expect(req('GET https://x.com?z=0\n?a=1').url).toBe('https://x.com?z=0&a=1');
    expect(req('GET https://x.com\n&a=1&b=2').url).toBe('https://x.com?a=1&b=2');
  });

  it('un parámetro sin = y uno vacío; los trozos vacíos se saltan', () => {
    const r = req('GET https://x.com?a&b=&&c=1');
    expect(r.query.map((q) => [q.name, q.value, q.hasValue, q.pos])).toEqual([['a', '', false, 0], ['b', '', true, 1], ['c', '1', true, 3]]);
  });

  it('variables en los parámetros; las desactivadas no cuentan para enviar', () => {
    const r = req('GET {{baseUrl}}/u?id={{id}}\n# &debug={{flag}}\nX-A: {{a}}\n# X-B: {{b}}');
    expect(rows('GET {{baseUrl}}/u?id={{id}}\n# &debug={{flag}}')).toEqual(['id={{id}}@url', '!debug={{flag}}@line']);
    expect(variablesOf(r)).toEqual(['baseUrl', 'id', 'a']);
  });

  it('un comentario después de la última línea de la query es de las cabeceras', () => {
    const r = req('GET https://x.com\n&a=1\n# Accept: x\nX-Y: 1');
    expect(rows('GET https://x.com\n&a=1\n# Accept: x')).toEqual(['a=1@line']);
    expect(r.headerRows.map((h) => [h.name, h.enabled])).toEqual([['Accept', false], ['X-Y', true]]);
    expect(r.headerStart).toBe(3);
  });
});

describe('parser v2: cabeceras desactivadas (HT42)', () => {
  it('# Nombre: valor es una fila desactivada; // y los demás comentarios no', () => {
    const code = '# antes: no es fila\nGET https://x.com\nAccept: */*\n# Accept-Language: en\n// X-Otra: no\n## X-Doble: no\n# solo un comentario\n# TODO: revisar\nAccept: text/html';
    const r = req(code);
    expect(headers(code)).toEqual(['Accept: */*', '!Accept-Language: en', '!TODO: revisar', 'Accept: text/html']);
    expect(r.headers.map((h) => h.value)).toEqual(['*/*', 'text/html']);
    expect(r.disabledHeaders.map((h) => [h.name, h.line])).toEqual([['Accept-Language', 4], ['TODO', 8]]);
  });

  it('la zona de las cabeceras: de dónde a dónde', () => {
    const r = req('POST https://x.com\n&a=1\nA: 1\nB: 2\n\n{}');
    expect([r.headerStart, r.headerEnd]).toEqual([3, 5]);
    const n = req('GET https://x.com\nA: 1');
    expect([n.headerStart, n.headerEnd]).toEqual([2, 3]);
  });

  it('el tipo de cuerpo (HT45)', () => {
    expect(req('GET https://x.com').bodyKind).toBe('none');
    expect(req('POST https://x.com\n\n{"a":1}').bodyKind).toBe('json');
    expect(req('POST https://x.com\nContent-Type: application/vnd.api+json\n\nx').bodyKind).toBe('json');
    expect(req('POST https://x.com\nContent-Type: application/x-www-form-urlencoded\n\na=1').bodyKind).toBe('form');
    expect(req('POST https://x.com\nContent-Type: multipart/form-data; boundary=B\n\n--B').bodyKind).toBe('multipart');
    expect(req('POST https://x.com\n\n< ./foto.png').bodyKind).toBe('file');
    expect(req('POST https://x.com\nContent-Type: text/xml\n\n<a/>').bodyKind).toBe('text');
  });
});

describe('la línea de la petición', () => {
  it('lee el método y la URL; una línea que no se entiende va entera a la URL', () => {
    expect(readRequestLine('post https://x.com HTTP/1.1')).toEqual({ method: 'POST', url: 'https://x.com' });
    expect(readRequestLine('{{baseUrl}}/u')).toEqual({ method: 'GET', url: '{{baseUrl}}/u' });
    expect(readRequestLine('FETCH https://x.com')).toEqual({ method: 'GET', url: 'FETCH https://x.com' });
    expect(readRequestLine('POST')).toEqual({ method: 'POST', url: '' });
    expect(readRequestLine('')).toEqual({ method: 'GET', url: '' });
  });

  it('cambia la URL sin tocar el método escrito, la sangría ni HTTP/1.1', () => {
    expect(writeRequestLine('  get https://x.com/a HTTP/1.1\nA: 1', 0, { url: 'https://x.com/b' })).toBe('  get https://x.com/b HTTP/1.1\nA: 1');
    expect(writeRequestLine('https://x.com/a', 0, { url: 'https://x.com/b' })).toBe('https://x.com/b');
    // Una URL sin esquema necesita el método escrito.
    expect(writeRequestLine('https://x.com/a', 0, { url: 'localhost:8080' })).toBe('GET localhost:8080');
  });

  it('cambia el método; con el mismo método no cambia nada', () => {
    expect(writeRequestLine('https://x.com', 0, { method: 'GET' })).toBe('https://x.com');
    expect(writeRequestLine('https://x.com', 0, { method: 'POST' })).toBe('POST https://x.com');
    expect(writeRequestLine('get https://x.com', 0, { method: 'GET' })).toBe('get https://x.com');
  });

  it('una petición nueva: sin texto, escribe la línea', () => {
    expect(writeRequestLine('', 0, { url: 'h' })).toBe('GET h');
    expect(writeRequestLine('', 0, { method: 'POST' })).toBe('POST');
    expect(writeRequestLine('POST', 0, { url: 'https://x.com' })).toBe('POST https://x.com');
    expect(writeRequestLine('POST https://x.com', 0, { url: '' })).toBe('POST');
  });

  it('en la petición de un bloque con varias, solo esa', () => {
    const code = 'GET https://x.com/a\n\n### dos\nGET https://x.com/b\n';
    const next = writeRequestLine(code, 1, { url: 'https://x.com/c' });
    expect(next).toBe('GET https://x.com/a\n\n### dos\nGET https://x.com/c\n');
    othersUnchanged(code, next, 1);
  });
});

describe('Params: ida y vuelta (HT41)', () => {
  it('editar uno de la URL solo cambia ese par', () => {
    const code = 'GET https://x.com/s?q=hola&page=2#frag\nAccept: x';
    const next = setQueryRow(code, 0, 1, { name: 'page', value: '3' });
    expect(next).toBe('GET https://x.com/s?q=hola&page=3#frag\nAccept: x');
  });

  it('al escribir, solo se codifica lo que rompería la query; las variables nunca', () => {
    expect(encodeQueryPart('a b&c#d=e', false)).toBe('a%20b%26c%23d=e');
    expect(encodeQueryPart('a=b', true)).toBe('a%3Db');
    expect(encodeQueryPart('{{a b}} x', false)).toBe('{{a b}}%20x');
    const next = setQueryRow('GET https://x.com?q=1', 0, 0, { name: 'q', value: 'hola mundo {{x}}' });
    expect(next).toBe('GET https://x.com?q=hola%20mundo%20{{x}}');
    expect(req(next).query[0].value).toBe('hola%20mundo%20{{x}}');
  });

  it('un parámetro sin = sigue sin = si el valor queda vacío', () => {
    expect(setQueryRow('GET https://x.com?flag', 0, 0, { name: 'flag2', value: '' })).toBe('GET https://x.com?flag2');
    expect(setQueryRow('GET https://x.com?flag', 0, 0, { name: 'flag', value: '1' })).toBe('GET https://x.com?flag=1');
    expect(setQueryRow('GET https://x.com?a=', 0, 0, { name: 'a', value: '' })).toBe('GET https://x.com?a=');
  });

  it('editar uno de una línea aparte conserva la sangría y los demás pares', () => {
    const code = 'GET https://x.com\n    ?a=1&b=2\n    &c=3';
    expect(setQueryRow(code, 0, 1, { name: 'b', value: '9' })).toBe('GET https://x.com\n    ?a=1&b=9\n    &c=3');
    expect(setQueryRow(code, 0, 2, { name: 'cc', value: '3' })).toBe('GET https://x.com\n    ?a=1&b=2\n    &cc=3');
  });

  it('desactivar uno de la URL lo pasa a su propia línea # &k=v', () => {
    const code = 'GET https://x.com/s?q=hola&page=2\nAccept: x\n\nbody';
    const next = toggleQueryRow(code, 0, 1);
    expect(next).toBe('GET https://x.com/s?q=hola\n# &page=2\nAccept: x\n\nbody');
    expect(rows(next)).toEqual(['q=hola@url', '!page=2@line']);
    // Y el último: la URL se queda sin ?.
    expect(toggleQueryRow('GET https://x.com?a=1', 0, 0)).toBe('GET https://x.com\n# &a=1');
  });

  it('activar uno desactivado; si la URL no tiene ?, la primera línea activa lo lleva', () => {
    const off = 'GET https://x.com\n# &a=1\n&b=2';
    // El parser arma bien la URL aunque el texto diga & (lo arregla la próxima edición).
    expect(req(off).url).toBe('https://x.com?b=2');
    const on = toggleQueryRow(off, 0, 0);
    expect(on).toBe('GET https://x.com\n?a=1\n&b=2');
    expect(req(on).url).toBe('https://x.com?a=1&b=2');
    // Desactivar el primero de las líneas: el siguiente pasa a ?.
    const again = toggleQueryRow(on, 0, 0);
    expect(again).toBe('GET https://x.com\n# ?a=1\n?b=2');
    expect(req(again).url).toBe('https://x.com?b=2');
  });

  it('desactivar uno de una línea con varios lo saca a la suya', () => {
    const code = 'GET https://x.com\n?a=1&b=2&c=3\nX: 1';
    const next = toggleQueryRow(code, 0, 1);
    expect(next).toBe('GET https://x.com\n?a=1&c=3\n# &b=2\nX: 1');
    expect(rows(next)).toEqual(['a=1@line', 'c=3@line', '!b=2@line']);
    const back = toggleQueryRow('GET https://x.com\n# &a=1&b=2', 0, 1);
    expect(back).toBe('GET https://x.com\n# &a=1\n?b=2');
  });

  it('agregar respeta el estilo: en la URL, o en una línea si ya hay líneas activas', () => {
    expect(addQueryRow('GET https://x.com\nA: 1', 0, { name: 'a', value: '1' })).toBe('GET https://x.com?a=1\nA: 1');
    expect(addQueryRow('GET https://x.com?a=1', 0, { name: 'b b', value: '{{x}}' })).toBe('GET https://x.com?a=1&b%20b={{x}}');
    expect(addQueryRow('GET https://x.com\n  ?a=1\nA: 1', 0, { name: 'b', value: '2' })).toBe('GET https://x.com\n  ?a=1\n  &b=2\nA: 1');
    // Solo con líneas desactivadas, sigue en la URL.
    expect(addQueryRow('GET https://x.com?q=1\n# &a=1', 0, { name: 'b', value: '2' })).toBe('GET https://x.com?q=1&b=2\n# &a=1');
    expect(addQueryRow('GET https://x.com HTTP/1.1', 0, { name: 'a', value: '' })).toBe('GET https://x.com?a HTTP/1.1');
  });

  it('quitar uno de la URL, de una línea con varios, o una línea entera', () => {
    expect(removeQueryRow('GET https://x.com?a=1&b=2', 0, 0)).toBe('GET https://x.com?b=2');
    expect(removeQueryRow('GET https://x.com?a=1', 0, 0)).toBe('GET https://x.com');
    expect(removeQueryRow('GET https://x.com\n?a=1&b=2', 0, 0)).toBe('GET https://x.com\n?b=2');
    expect(removeQueryRow('GET https://x.com\n?a=1\n&b=2\nX: 1', 0, 0)).toBe('GET https://x.com\n?b=2\nX: 1');
  });

  it('mover: dentro de la URL, dentro de una línea o entre líneas; entre lugares, no', () => {
    expect(moveQueryRow('GET https://x.com?a=1&b=2', 0, 0, 1)).toBe('GET https://x.com?b=2&a=1');
    expect(moveQueryRow('GET https://x.com\n?a=1\n# &b=2', 0, 0, 1)).toBe('GET https://x.com\n# &b=2\n?a=1');
    expect(moveQueryRow('GET https://x.com\n?a=1&b=2', 0, 1, -1)).toBe('GET https://x.com\n?b=2&a=1');
    expect(moveQueryRow('GET https://x.com?a=1\n&b=2', 0, 0, 1)).toBe('GET https://x.com?a=1\n&b=2');
  });

  it('parámetros repetidos son filas aparte y se editan por separado', () => {
    const code = 'GET https://x.com?tag=a&tag=b';
    expect(rows(code)).toEqual(['tag=a@url', 'tag=b@url']);
    expect(setQueryRow(code, 0, 1, { name: 'tag', value: 'c' })).toBe('GET https://x.com?tag=a&tag=c');
  });

  it('con varias peticiones (###), solo cambia la suya', () => {
    const code = '### uno\nGET https://x.com?a=1\n\n### dos\nGET https://y.com?b=2\n&c=3\n';
    const next = toggleQueryRow(code, 1, 1);
    expect(next).toBe('### uno\nGET https://x.com?a=1\n\n### dos\nGET https://y.com?b=2\n# &c=3\n');
    othersUnchanged(code, next, 1);
  });

  it('los comentarios de la zona y del cuerpo quedan igual', () => {
    const code = '# antes\nPOST https://x.com\n?a=1\n# nota de la query\n&b=2\nA: 1\n\n# cuerpo\n{}';
    const next = setQueryRow(code, 0, 1, { name: 'b', value: '3' });
    expect(next).toBe('# antes\nPOST https://x.com\n?a=1\n# nota de la query\n&b=3\nA: 1\n\n# cuerpo\n{}');
  });
});

describe('Cabeceras: ida y vuelta (HT42)', () => {
  const code = 'POST https://x.com\n&a=1\nAccept: */*\n# Accept-Language: en\nX-Id: {{id}}\n\n{"a":1}';

  it('editar el nombre y el valor de una fila, activa o desactivada', () => {
    expect(setHeaderRow(code, 0, 0, { name: 'Accept', value: 'application/json ' })).toContain('\nAccept: application/json\n');
    const off = setHeaderRow(code, 0, 1, { name: 'Accept-Language', value: 'es' });
    expect(headers(off)).toEqual(['Accept: */*', '!Accept-Language: es', 'X-Id: {{id}}']);
    // Un nombre que no es válido no se escribe.
    expect(setHeaderRow(code, 0, 0, { name: 'Mal nombre', value: 'x' })).toBe(code);
    // Valor vacío: `Nombre:`.
    expect(setHeaderRow(code, 0, 2, { name: 'X-Id', value: '' })).toContain('\nX-Id:\n');
  });

  it('activar y desactivar: # Nombre: valor; la sangría se queda', () => {
    const off = toggleHeaderRow(code, 0, 0);
    expect(off).toBe(code.replace('Accept: */*', '# Accept: */*'));
    expect(toggleHeaderRow(off, 0, 0)).toBe(code);
    expect(toggleHeaderRow(code, 0, 1)).toBe(code.replace('# Accept-Language: en', 'Accept-Language: en'));
    expect(toggleHeaderRow('GET https://x.com\n  #A: 1', 0, 0)).toBe('GET https://x.com\n  A: 1');
  });

  it('agregar al final de la zona, antes de la línea en blanco; quitar; mover', () => {
    const added = addHeaderRow(code, 0, { name: 'X-Nueva', value: '1' });
    expect(headers(added)).toEqual(['Accept: */*', '!Accept-Language: en', 'X-Id: {{id}}', 'X-Nueva: 1']);
    expect(req(added).body).toBe('{"a":1}');
    expect(addHeaderRow('GET https://x.com', 0, { name: 'A', value: '1' })).toBe('GET https://x.com\nA: 1');
    expect(addHeaderRow('GET https://x.com\n?a=1\n\n', 0, { name: 'A', value: '1' })).toBe('GET https://x.com\n?a=1\nA: 1\n\n');
    expect(addHeaderRow('GET https://x.com\n### dos\nGET https://y.com', 0, { name: 'A', value: '1' })).toBe('GET https://x.com\nA: 1\n### dos\nGET https://y.com');
    expect(headers(removeHeaderRow(code, 0, 1))).toEqual(['Accept: */*', 'X-Id: {{id}}']);
    expect(headers(moveHeaderRow(code, 0, 2, -1))).toEqual(['Accept: */*', 'X-Id: {{id}}', '!Accept-Language: en']);
    expect(moveHeaderRow(code, 0, 0, -1)).toBe(code);
  });

  it('las cabeceras repetidas son filas aparte, en su orden', () => {
    const dup = 'GET https://x.com\nAccept: a\nAccept: b';
    expect(headers(dup)).toEqual(['Accept: a', 'Accept: b']);
    expect(headers(toggleHeaderRow(dup, 0, 1))).toEqual(['Accept: a', '!Accept: b']);
    expect(headers(moveHeaderRow(dup, 0, 0, 1))).toEqual(['Accept: b', 'Accept: a']);
  });

  it('una petición nueva, sin texto', () => {
    expect(addHeaderRow('', 0, { name: 'A', value: '1' })).toBe('GET\nA: 1');
  });
});

describe('el cuerpo', () => {
  it('reemplaza lo de después de la línea en blanco, y nada más', () => {
    const code = 'POST https://x.com\nA: 1\n\n{"a":1}\n\n### dos\nGET https://y.com';
    const next = setRequestBody(code, 0, '{"a":2}\n');
    expect(next).toBe('POST https://x.com\nA: 1\n\n{"a":2}\n\n### dos\nGET https://y.com');
    othersUnchanged(code, next, 0);
    expect(setRequestBody(code, 0, '')).toBe('POST https://x.com\nA: 1\n\n### dos\nGET https://y.com');
    expect(setRequestBody('POST https://x.com\nA: 1', 0, 'hola\n\nmundo')).toBe('POST https://x.com\nA: 1\n\nhola\n\nmundo');
    expect(setRequestBody('', 0, '{}')).toBe('GET\n\n{}');
    expect(req(setRequestBody('POST https://x.com\n\nviejo', 0, 'nuevo')).body).toBe('nuevo');
  });
});

describe('Auth (HT43)', () => {
  const ctx: AuthContext = { isSecret: (n) => n === 'clave' };

  it('lee Bearer, Basic (con : o espacio), Otra y Ninguna', () => {
    expect(readAuth(req('GET https://x.com\nAuthorization: Bearer {{token}}'), ctx)).toEqual({ kind: 'bearer', token: '{{token}}', row: 0 });
    expect(readAuth(req('GET https://x.com\nauthorization: bearer'), ctx)).toEqual({ kind: 'bearer', token: '', row: 0 });
    expect(readAuth(req('GET https://x.com\nA: 1\nAuthorization: Basic {{user}}:{{password}}'), ctx)).toEqual({ kind: 'basic', user: '{{user}}', password: '{{password}}', row: 1 });
    expect(readAuth(req('GET https://x.com\nAuthorization: Basic ana {{pw}}'), ctx)).toMatchObject({ kind: 'basic', user: 'ana', password: '{{pw}}' });
    expect(readAuth(req('GET https://x.com\nAuthorization: Basic dXNlcjpwYXNz'), ctx)).toEqual({ kind: 'other', value: 'Basic dXNlcjpwYXNz', row: 0 });
    expect(readAuth(req('GET https://x.com\nAuthorization: Digest x=1'), ctx)).toMatchObject({ kind: 'other' });
    expect(readAuth(req('GET https://x.com\n# Authorization: Bearer {{t}}'), ctx)).toEqual({ kind: 'none' });
  });

  it('splitBasic: el primer : fuera de las variables', () => {
    expect(splitBasic('{{a:b}}:{{c}}')).toEqual({ user: '{{a:b}}', password: '{{c}}' });
    expect(splitBasic('ana:p:w')).toEqual({ user: 'ana', password: 'p:w' });
    expect(splitBasic('')).toEqual({ user: '', password: '' });
    expect(splitBasic('Zm9v')).toBeNull();
  });

  it('reconoce una API key en una cabecera o en la query, por el secreto o por el nombre', () => {
    expect(readAuth(req('GET https://x.com\nX-API-Key: {{apiKey}}'), ctx)).toEqual({ kind: 'apikey', place: 'header', name: 'X-API-Key', value: '{{apiKey}}', row: 0 });
    expect(readAuth(req('GET https://x.com\nX-Algo: {{clave}}'), ctx)).toMatchObject({ kind: 'apikey', place: 'header' });
    expect(readAuth(req('GET https://x.com?page=1&api_key={{api_key}}'), ctx)).toEqual({ kind: 'apikey', place: 'query', name: 'api_key', value: '{{api_key}}', row: 1 });
    // Un literal o una variable que no es de credencial, no.
    expect(readAuth(req('GET https://x.com\nX-API-Key: abc\nX-Id: {{id}}'), ctx)).toEqual({ kind: 'none' });
    // La fila que la pantalla acaba de escribir sí, aunque todavía no sea una variable.
    expect(readAuth(req('GET https://x.com\nX-API-Key: abc'), { ...ctx, apiKey: { place: 'header', name: 'x-api-key' } })).toMatchObject({ kind: 'apikey', value: 'abc' });
  });

  it('escribe cada tipo como una cabecera o un parámetro normal', () => {
    const base = 'POST https://x.com\nAccept: */*\n\n{}';
    const bearer = setAuth(base, 0, { kind: 'bearer', token: '{{token}}' }, ctx);
    expect(bearer).toBe('POST https://x.com\nAccept: */*\nAuthorization: Bearer {{token}}\n\n{}');
    const basic = setAuth(bearer, 0, { kind: 'basic', user: '{{user}}', password: '{{password}}' }, ctx);
    expect(basic).toBe('POST https://x.com\nAccept: */*\nAuthorization: Basic {{user}}:{{password}}\n\n{}');
    expect(setAuth(base, 0, { kind: 'basic', user: '', password: '' }, ctx)).toContain('Authorization: Basic\n');
    expect(readAuth(req(setAuth(base, 0, { kind: 'basic', user: '', password: '' }, ctx)), ctx)).toMatchObject({ kind: 'basic', user: '', password: '' });
    // De Basic a API key: se quita la Authorization.
    const key = setAuth(basic, 0, { kind: 'apikey', place: 'header', name: 'X-API-Key', value: '{{apiKey}}' }, ctx);
    expect(key).toBe('POST https://x.com\nAccept: */*\nX-API-Key: {{apiKey}}\n\n{}');
    // A la query: se quita la cabecera y va como parámetro.
    const inQuery = setAuth(key, 0, { kind: 'apikey', place: 'query', name: 'api_key', value: '{{apiKey}}' }, ctx);
    expect(inQuery).toBe('POST https://x.com?api_key={{apiKey}}\nAccept: */*\n\n{}');
    // Ninguna: quita lo de Auth y nada más.
    expect(setAuth(inQuery, 0, { kind: 'none' }, ctx)).toBe(base);
    expect(setAuth(bearer, 0, { kind: 'none' }, ctx)).toBe(base);
  });

  it('cambiar el token reescribe solo la Authorization, con su nombre como estaba', () => {
    const code = 'GET https://x.com\nauthorization: Bearer {{a}}\nX: 1';
    expect(setAuth(code, 0, { kind: 'bearer', token: '{{b}}' }, ctx)).toBe('GET https://x.com\nauthorization: Bearer {{b}}\nX: 1');
    expect(setAuth(code, 0, { kind: 'other', value: 'Token abc' }, ctx)).toBe('GET https://x.com\nauthorization: Token abc\nX: 1');
  });

  it('una API key cambia de nombre en su sitio', () => {
    const code = 'GET https://x.com\nX-API-Key: {{apiKey}}\nX: 1';
    expect(setAuth(code, 0, { kind: 'apikey', place: 'header', name: 'X-Key', value: '{{apiKey}}' }, ctx)).toBe('GET https://x.com\nX-Key: {{apiKey}}\nX: 1');
  });

  it('en una petición nueva, sin texto', () => {
    expect(setAuth('', 0, { kind: 'bearer', token: '{{t}}' }, NO_SECRETS)).toBe('GET\nAuthorization: Bearer {{t}}');
  });

  it('un valor literal es lo que no es solo {{variables}}', () => {
    expect(isLiteral('{{token}}')).toBe(false);
    expect(isLiteral(' {{a}}{{b}} ')).toBe(false);
    expect(isLiteral('')).toBe(false);
    expect(isLiteral('eyJhbGciOi')).toBe(true);
    expect(isLiteral('x{{a}}')).toBe(true);
  });
});
