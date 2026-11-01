import { describe, expect, it } from 'vitest';
import { formatJsonBody, fromCurl, shellWords } from './curl';
import { generateCode, toCurl } from './codegen';
import { hasErrors, parseHttpBlock, type ParsedRequest } from './parse';

/** El bloque de `fromCurl`, que nunca debe tener errores de sintaxis. */
function convert(text: string) {
  const r = fromCurl(text);
  expect(r).not.toBeNull();
  const parsed = parseHttpBlock(r!.code);
  expect(parsed.requests).toHaveLength(1);
  expect(hasErrors(parsed.issues)).toBe(false);
  expect(hasErrors(parsed.requests[0].issues)).toBe(false);
  return { ...r!, req: parsed.requests[0] };
}

const headerOf = (req: ParsedRequest, name: string) => req.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

describe('shellWords', () => {
  it('comillas simples, dobles, escapes y continuaciones', () => {
    expect(shellWords(`curl 'a b' "c \\"d\\" \\$e \\x" f\\ g \\\n  h`)).toEqual(['curl', 'a b', 'c "d" $e \\x', 'f g', 'h']);
    // La barra con espacios detrás, que se cuela al copiar, también continúa.
    expect(shellWords('curl a \\   \n  b')).toEqual(['curl', 'a', 'b']);
    // 'it'\''s' es una sola palabra.
    expect(shellWords(`curl 'it'\\''s'`)).toEqual(['curl', "it's"]);
  });

  it("$'…' con los escapes de bash", () => {
    expect(shellWords(`curl $'l1\\nl2\\t\\x41\\101 \\u00e9 \\'q\\' \\\\'`)).toEqual(['curl', "l1\nl2\tAA é 'q' \\"]);
    // Un emoji en dos mitades (😀), como lo escribe Chrome.
    expect(shellWords(`curl $'\\ud83d\\ude00'`)).toEqual(['curl', '😀']);
  });

  it('las variables del shell pasan a {{nombre}}, salvo en comillas simples', () => {
    expect(shellWords(`curl "Bearer $TOKEN" \${HOST}/a '$NO'`)).toEqual(['curl', 'Bearer {{TOKEN}}', '{{HOST}}/a', '$NO']);
    // Las de Logday ({{$uuid}}) quedan.
    expect(shellWords('curl {{$uuid}} "{{$timestamp}}"')).toEqual(['curl', '{{$uuid}}', '{{$timestamp}}']);
  });

  it('más de un comando, tuberías, redirecciones o sustituciones: null', () => {
    for (const text of [
      'curl a && curl b', 'curl a || true', 'curl a | jq .', 'curl a > out.json', 'curl a < in', 'curl a; echo hi',
      'curl a\necho hi', 'curl $(cat url)', 'curl "$(cat url)"', 'curl `cat url`', "curl 'sin cerrar", 'curl "sin cerrar',
      'curl a & ', '(curl a)',
    ]) expect(shellWords(text), text).toBeNull();
  });

  it('lo que sobra al final: espacios, un ; o un comentario', () => {
    expect(shellWords('curl a;  \n\n')).toEqual(['curl', 'a']);
    expect(shellWords('curl a # la lista\n# otra')).toEqual(['curl', 'a']);
    // `#` dentro de una palabra no es comentario; `&` en una URL sin comillas, tampoco separa.
    expect(shellWords('curl https://x.com/a?b=1&c=2#top')).toEqual(['curl', 'https://x.com/a?b=1&c=2#top']);
  });
});

describe('fromCurl (HT39)', () => {
  it('"Copiar como cURL" de Chrome en macOS: -H, -b y --data-raw $\'…\'', () => {
    const text = [
      "curl 'https://api.example.com/v1/users?page=2' \\",
      "  -H 'accept: application/json, text/plain, */*' \\",
      "  -H 'accept-language: es-419,es;q=0.9' \\",
      "  -H 'authorization: Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig' \\",
      "  -H 'content-type: application/json' \\",
      "  -b 'sessionid=abc123; csrftoken=xyz' \\",
      "  -H 'origin: https://app.example.com' \\",
      "  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' \\",
      `  --data-raw $'{"name":"Jos\\u00e9","note":"it\\'s"}'`,
    ].join('\n');
    const { code, replaced, req } = convert(text);
    expect(code).toBe([
      'POST https://api.example.com/v1/users?page=2',
      'accept: application/json, text/plain, */*',
      'accept-language: es-419,es;q=0.9',
      'authorization: Bearer {{token}}',
      'content-type: application/json',
      'Cookie: {{cookie}}',
      'origin: https://app.example.com',
      'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      '',
      '{',
      '  "name": "José",',
      `  "note": "it's"`,
      '}',
    ].join('\n'));
    expect(replaced).toEqual(['token', 'cookie']);
    expect(req.method).toBe('POST');
  });

  it('Postman: --location, --header y --data con un JSON en varias líneas', () => {
    const { code, replaced } = convert([
      "curl --location 'https://api.example.com/items' \\",
      "--header 'Content-Type: application/json' \\",
      "--header 'x-api-key: abc123' \\",
      "--data '{",
      '    "title": "Hola",',
      '    "count": 2',
      "}'",
    ].join('\n'));
    expect(code).toBe('POST https://api.example.com/items\nContent-Type: application/json\nx-api-key: {{x_api_key}}\n\n{\n  "title": "Hola",\n  "count": 2\n}');
    expect(replaced).toEqual(['x_api_key']);
  });

  it('Postman antiguo: --request y --data-urlencode, con la contraseña oculta', () => {
    const { code, replaced } = convert(
      "curl --location --request POST 'https://x.com/login' --header 'Content-Type: application/x-www-form-urlencoded' --data-urlencode 'user=ana maría' --data-urlencode 'password=s3cr&t'",
    );
    expect(code).toBe('POST https://x.com/login\nContent-Type: application/x-www-form-urlencoded\n\nuser=ana%20mar%C3%ADa&password={{password}}');
    expect(replaced).toEqual(['password']);
    expect(code).not.toContain('s3cr');
  });

  it('comillas dobles con escapes', () => {
    const { code } = convert(String.raw`curl -X PUT "https://x.com/a" -H "Content-Type: application/json" -d "{\"name\": \"Ana \\\"la\\\" grande\", \"price\": \"\$5\"}"`);
    expect(code).toBe('PUT https://x.com/a\nContent-Type: application/json\n\n{\n  "name": "Ana \\"la\\" grande",\n  "price": "$5"\n}');
  });

  it('opciones juntas (-sSL, -sSX POST, -XPOST) y las que no cambian la petición', () => {
    expect(convert('curl -sSL https://example.com/install.sh').code).toBe('GET https://example.com/install.sh');
    expect(convert('curl -sSX POST https://x.com').code).toBe('POST https://x.com');
    expect(convert('curl -XDELETE https://x.com/1').code).toBe('DELETE https://x.com/1');
    expect(convert('curl -v -k -i --compressed -L --max-time 10 -m 5 -o out.json --connect-timeout 3 --retry 2 https://x.com').code)
      .toBe('GET https://x.com');
    expect(convert('curl --request=PATCH --url=https://x.com/a').code).toBe('PATCH https://x.com/a');
    expect(convert('curl -X post https://x.com').code).toBe('POST https://x.com');
    expect(convert('curl -- https://x.com').code).toBe('GET https://x.com');
  });

  it('-u usuario:contraseña → Authorization: Basic {{basic_auth}}, sin el valor', () => {
    const { code, replaced } = convert('curl -u ana:secreto https://x.com/me');
    expect(code).toBe('GET https://x.com/me\nAuthorization: Basic {{basic_auth}}');
    expect(replaced).toEqual(['basic_auth']);
    expect(code).not.toContain('secreto');
    expect(code).not.toContain(btoa('ana:secreto'));
    // El usuario y la contraseña en la URL (HT23 no los admite), igual.
    expect(convert('curl https://ana:pw@x.com/a').code).toBe('GET https://x.com/a\nAuthorization: Basic {{basic_auth}}');
    // Una cabecera Authorization escrita gana, como en curl.
    expect(convert(`curl -u a:b -H 'Authorization: Bearer {{token}}' https://x.com`).code).toBe('GET https://x.com\nAuthorization: Bearer {{token}}');
  });

  it('--json pone Content-Type y Accept de JSON, y POST', () => {
    expect(convert(`curl --json '{"a":1}' https://x.com`).code)
      .toBe('POST https://x.com\nContent-Type: application/json\nAccept: application/json\n\n{\n  "a": 1\n}');
    // Si ya vienen, no se repiten.
    expect(convert(`curl --json '[]' -H 'Accept: text/plain' https://x.com`).code)
      .toBe('POST https://x.com\nAccept: text/plain\nContent-Type: application/json\n\n[]');
  });

  it('-G -d: los datos van a la query y es GET', () => {
    expect(convert('curl -G https://x.com/search -d q=hola -d page=2').code).toBe('GET https://x.com/search?q=hola&page=2');
    expect(convert(`curl -G 'https://x.com/s?lang=es' --data-urlencode 'q=hola mundo'`).code).toBe('GET https://x.com/s?lang=es&q=hola%20mundo');
    expect(convert('curl -G -I https://x.com -d a=1').code).toBe('HEAD https://x.com?a=1');
    expect(convert(`curl --url-query 'q=a b' --url-query '+raw=%20' https://x.com`).code).toBe('GET https://x.com?q=a%20b&raw=%20');
  });

  it('-I es HEAD y sin cuerpo; con datos y sin -G, curl lo rechaza: null', () => {
    expect(convert('curl -I https://x.com').code).toBe('HEAD https://x.com');
    expect(convert('curl --head https://x.com').code).toBe('HEAD https://x.com');
    expect(fromCurl('curl -I -d a=1 https://x.com')).toBeNull();
  });

  it('el método: el explícito, POST con datos, si no GET', () => {
    expect(convert('curl https://x.com').req.method).toBe('GET');
    expect(convert('curl -d x https://x.com').req.method).toBe('POST');
    expect(convert('curl -X PUT -d x https://x.com').req.method).toBe('PUT');
    expect(convert('curl -X OPTIONS https://x.com').req.method).toBe('OPTIONS');
    // Un método que el bloque no admite no se convierte.
    expect(fromCurl('curl -X PURGE https://x.com')).toBeNull();
  });

  it('varios -d se unen con &, y llevan el Content-Type de formulario de curl', () => {
    expect(convert('curl -d a=1 -d b=2 https://x.com').code).toBe('POST https://x.com\nContent-Type: application/x-www-form-urlencoded\n\na=1&b=2');
    // Un texto que no es formulario no lo lleva, ni un JSON (Logday pone el suyo).
    expect(convert(`curl -d 'hola' https://x.com`).code).toBe('POST https://x.com\n\nhola');
    expect(convert(`curl -d '{"a":1}' https://x.com`).code).toBe('POST https://x.com\n\n{\n  "a": 1\n}');
    // `-H 'Content-Type:'` lo quita, como en curl.
    expect(convert(`curl -H 'Content-Type:' -d a=1 https://x.com`).code).toBe('POST https://x.com\n\na=1');
  });

  it('cuerpo o cabeceras desde un archivo, o un formulario multipart: null', () => {
    for (const text of [
      'curl -d @body.json https://x.com', 'curl --data-binary @- https://x.com', 'curl --json @a.json https://x.com',
      'curl --data-urlencode name@file https://x.com', 'curl -H @headers.txt https://x.com', 'curl -F file=@a.png https://x.com',
      'curl --form-string a=b https://x.com', 'curl -T a.txt https://x.com', 'curl -K config.txt', 'curl --digest -u a:b https://x.com',
      'curl --unix-socket /var/run/docker.sock http://localhost/info', 'curl https://a.com --next https://b.com',
    ]) expect(fromCurl(text), text).toBeNull();
    // --data-raw no lee archivos: la @ es texto.
    expect(convert('curl --data-raw @hola https://x.com').code).toBe('POST https://x.com\n\n@hola');
  });

  it('comandos encadenados o texto que no es un curl: null', () => {
    for (const text of [
      'curl https://a.com && curl https://b.com', 'curl https://a.com | jq .', 'curl https://a.com > out.json',
      'hola mundo', 'wget https://x.com', 'Ejecuta curl https://x.com', 'curl', 'curl -s', 'curlx https://x.com',
      'curl https://a.com https://b.com', '', '   ',
    ]) expect(fromCurl(text), text).toBeNull();
  });

  it('URL sin esquema: http://, como curl; otros esquemas, null', () => {
    expect(convert('curl example.com/api').code).toBe('GET http://example.com/api');
    expect(convert('curl localhost:8080/health').code).toBe('GET http://localhost:8080/health');
    expect(fromCurl('curl ftp://x.com/f')).toBeNull();
    expect(fromCurl('curl ftp.x.com/f')).toBeNull();
    expect(fromCurl('curl file:///etc/passwd')).toBeNull();
  });

  it('un prompt delante, curl.exe y la continuación de PowerShell', () => {
    expect(convert('$ curl https://x.com').code).toBe('GET https://x.com');
    expect(convert("curl.exe 'https://x.com' `\n  -H 'Accept: */*'").code).toBe('GET https://x.com\nAccept: */*');
    expect(convert('/usr/bin/curl https://x.com').code).toBe('GET https://x.com');
    // La sintaxis de cmd.exe (Chrome en Windows, "cmd") no se entiende.
    expect(fromCurl('curl ^"https://x.com^" ^\n  -H ^"accept: */*^"')).toBeNull();
  });

  it('-A, -e, -b, --oauth2-bearer y -r', () => {
    const { code, replaced } = convert(`curl -A 'Logday/1' -e 'https://ref.com;auto' -b 'a=1' --oauth2-bearer tok -r 0-99 https://x.com`);
    expect(code).toBe('GET https://x.com\nUser-Agent: Logday/1\nReferer: https://ref.com\nCookie: {{cookie}}\nRange: bytes=0-99\nAuthorization: Bearer {{token}}');
    expect(replaced).toEqual(['cookie', 'token']);
    // -b con un archivo de cookies no se lee.
    expect(convert('curl -b cookies.txt https://x.com').code).toBe('GET https://x.com');
  });

  it('una opción desconocida: si lleva valor, null; si no, se ignora', () => {
    expect(fromCurl('curl --opcion-nueva valor https://x.com')).toBeNull();
    expect(convert('curl --opcion-nueva https://x.com').code).toBe('GET https://x.com');
  });

  it('una línea ### en el cuerpo partiría la petición: null', () => {
    expect(fromCurl(`curl -d $'a\\n### b' https://x.com`)).toBeNull();
  });

  it('un cuerpo grande se convierte rápido', () => {
    const big = JSON.stringify({ items: Array.from({ length: 4000 }, (_v, i) => ({ id: i, name: `item ${i} con $ y \\ y "` })) });
    const quoted = `'${big.replace(/'/g, `'\\''`)}'`;
    const start = performance.now();
    const r = fromCurl(`curl -H 'Content-Type: application/json' --data-raw ${quoted} https://x.com`);
    expect(r).not.toBeNull();
    expect(performance.now() - start).toBeLessThan(1500);
    expect(JSON.parse(parseHttpBlock(r!.code).requests[0].body!)).toEqual(JSON.parse(big));
  });
});

describe('fromCurl: valores sensibles (HT39)', () => {
  it('ninguno de los valores queda en el bloque', () => {
    const secrets = ['eyJtoken', 'proxy-pw', 'galleta=1', 'k-123', 'tok-q', 'pw-body', 'cs-body', 'sess-9', 'sig-1'];
    const { code, replaced } = convert([
      "curl 'https://x.com/a?page=1&api_key=k-123&access_token=tok-q&X-Amz-Signature=sig-1#frag'",
      "-H 'Authorization: Bearer eyJtoken'",
      "-H 'Proxy-Authorization: Basic proxy-pw'",
      "-H 'Cookie: galleta=1'",
      "-H 'X-Session-Id: sess-9'",
      "-H 'Accept: */*'",
      `--data-raw '{"email":"a@b.co","password":"pw-body","nested":{"client_secret":"cs-body","n":1},"list":["x"]}'`,
    ].join(' '));
    for (const s of secrets) expect(code, s).not.toContain(s);
    expect(code).toContain('?page=1&api_key={{api_key}}&access_token={{access_token}}&X-Amz-Signature={{x_amz_signature}}#frag');
    expect(code).toContain('Authorization: Bearer {{token}}');
    expect(code).toContain('Proxy-Authorization: Basic {{proxy_basic_auth}}');
    expect(code).toContain('Cookie: {{cookie}}');
    expect(code).toContain('X-Session-Id: {{x_session_id}}');
    expect(code).toContain('Accept: */*');
    expect(code).toContain('"email": "a@b.co"');
    expect(code).toContain('"password": "{{password}}"');
    expect(code).toContain('"client_secret": "{{client_secret}}"');
    expect(replaced).toEqual(['api_key', 'access_token', 'x_amz_signature', 'token', 'proxy_basic_auth', 'cookie', 'x_session_id', 'password', 'client_secret']);
  });

  it('el esquema se ve: Bearer, Basic, Token, otro y ninguno', () => {
    expect(convert(`curl -H 'Authorization: Token abc' https://x.com`).code).toContain('Authorization: Token {{token}}');
    expect(convert(`curl -H 'Authorization: Basic YTpi' https://x.com`).code).toContain('Authorization: Basic {{basic_auth}}');
    expect(convert(`curl -H 'Authorization: Digest a=1' https://x.com`).code).toContain('Authorization: Digest {{authorization}}');
    expect(convert(`curl -H 'Authorization: abc' https://x.com`).code).toContain('Authorization: {{authorization}}');
  });

  it('el mismo nombre con otro valor lleva _2; el mismo valor reusa la variable', () => {
    const { code, replaced } = convert(`curl -H 'X-Token: a' -H 'X-Token: b' -H 'X-Token: a' https://x.com`);
    expect(code).toBe('GET https://x.com\nX-Token: {{x_token}}\nX-Token: {{x_token_2}}\nX-Token: {{x_token}}');
    expect(replaced).toEqual(['x_token', 'x_token_2']);
  });

  it('lo que ya es una variable no se toca, ni se lista', () => {
    const { code, replaced } = convert(`curl -H "Authorization: Bearer $TOKEN" -H 'Cookie: {{cookie}}' 'https://x.com?token={{t}}'`);
    expect(code).toBe('GET https://x.com?token={{t}}\nAuthorization: Bearer {{TOKEN}}\nCookie: {{cookie}}');
    expect(replaced).toEqual([]);
  });

  it('sin nada sensible, replaced está vacío', () => {
    expect(convert(`curl -H 'Accept: */*' 'https://x.com?q=token'`).replaced).toEqual([]);
  });
});

describe('formatJsonBody', () => {
  it('como JSON.stringify con 2 espacios, sin perder precisión', () => {
    expect(formatJsonBody('{"a":[1,{"b":null}],"c":{},"d":[]}')).toBe(JSON.stringify({ a: [1, { b: null }], c: {}, d: [] }, null, 2));
    expect(formatJsonBody('{"id": 12345678901234567890, "x": 1.50}')).toBe('{\n  "id": 12345678901234567890,\n  "x": 1.50\n}');
    expect(formatJsonBody('{"a":"x\\"y, z: {}"}')).toBe('{\n  "a": "x\\"y, z: {}"\n}');
    expect(formatJsonBody('{mal}')).toBeNull();
  });
});

describe('toCurl → fromCurl: ida y vuelta (casos de codegen.test.ts)', () => {
  const normalize = (req: ParsedRequest) => ({
    method: req.method,
    url: req.url,
    headers: req.headers.map((h) => `${h.name}: ${h.value}`),
    body: req.body === null ? null : (() => {
      try {
        return JSON.stringify(JSON.parse(req.body!));
      } catch {
        return req.body;
      }
    })(),
  });

  it.each([
    'POST https://x.com/users\nAccept: */*\nContent-Type: application/json\n\n{"name":"Ana"}',
    'GET {{baseUrl}}/me\nAuthorization: Bearer {{token}}',
    "PUT https://x.com/a?q=it's\nX-Note: l'eau\n\nlínea 1\nit's",
    'POST https://x.com\n\nhola',
    'HEAD https://x.com',
    'DELETE https://x.com/b\n?id=1\n&force=true',
    'GET https://x.com/a',
  ])('%s', (code) => {
    const req = parseHttpBlock(code).requests[0];
    const back = convert(toCurl(req));
    // "Copiar como… → cURL" es el mismo comando.
    expect(generateCode('curl', req)).toBe(toCurl(req));
    expect(back.replaced).toEqual([]);
    expect(normalize(back.req)).toEqual(normalize(req));
  });

  it('el Content-Type JSON que agrega toCurl vuelve como cabecera escrita', () => {
    const req = parseHttpBlock('POST https://x.com\n\n{"a":1}').requests[0];
    const back = convert(toCurl(req));
    expect(headerOf(back.req, 'content-type')).toBe('application/json');
    expect(JSON.parse(back.req.body!)).toEqual({ a: 1 });
  });
});
