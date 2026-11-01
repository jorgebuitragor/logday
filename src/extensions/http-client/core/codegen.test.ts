// "Copiar como…" (HT37, HT60): la salida de cada lenguaje para una
// petición típica, los escapes de cada uno y las reglas comunes (secretos
// como {{nombre}}, Content-Type JSON de Logday, HEAD sin cuerpo, Basic).
// La salida de estos casos se compiló y se envió a un servidor local con
// curl, Node, Go y Java el 31 oct 2026: los cuerpos llegaron byte a byte.
import { describe, expect, it } from 'vitest';
import {
  CODE_LANGUAGES, codegenBlocked, generateCode, goString, impliesJsonContentType, javaString, jsString, pyString,
  requestForCode, shellQuote, toCurl, type CodeLanguage,
} from './codegen';
import { parseHttpBlock } from './parse';
import { resolveRequest } from './resolve';
import type { HttpEnvironment } from './environments';

const req = (code: string, i = 0) => parseHttpBlock(code).requests[i];
const gen = (lang: CodeLanguage, code: string) => generateCode(lang, req(code));
const ALL = CODE_LANGUAGES.map((l) => l.id);

const TYPICAL = 'POST {{baseUrl}}/users?lang=es\nAccept: */*\nAuthorization: Bearer {{token}}\n\n{\n  "name": "Ana"\n}';

describe('los lenguajes del menú', () => {
  it('cURL, fetch, Python, Go y Java, en ese orden y con su resaltado', () => {
    expect(CODE_LANGUAGES.map((l) => [l.id, l.label, l.highlight])).toEqual([
      ['curl', 'cURL', 'bash'],
      ['fetch', 'JavaScript (fetch)', 'javascript'],
      ['python', 'Python (requests)', 'python'],
      ['go', 'Go (net/http)', 'go'],
      ['java', 'Java (HttpClient)', 'java'],
    ]);
  });
});

describe('una petición típica en cada lenguaje', () => {
  it('cURL', () => {
    expect(gen('curl', TYPICAL)).toBe([
      "curl -X POST '{{baseUrl}}/users?lang=es' \\",
      "  -H 'Accept: */*' \\",
      "  -H 'Authorization: Bearer {{token}}' \\",
      "  -H 'Content-Type: application/json' \\",
      "  --data-raw '{",
      '  "name": "Ana"',
      "}'",
    ].join('\n'));
  });

  it('JavaScript (fetch)', () => {
    expect(gen('fetch', TYPICAL)).toBe([
      "const response = await fetch('{{baseUrl}}/users?lang=es', {",
      "  method: 'POST',",
      '  headers: {',
      "    'Accept': '*/*',",
      "    'Authorization': 'Bearer {{token}}',",
      "    'Content-Type': 'application/json',",
      '  },',
      '  body: `{',
      '  "name": "Ana"',
      '}`,',
      '});',
      '',
      'console.log(response.status, await response.text());',
    ].join('\n'));
  });

  it('Python (requests)', () => {
    expect(gen('python', TYPICAL)).toBe([
      'import requests',
      '',
      'response = requests.post(',
      "    '{{baseUrl}}/users?lang=es',",
      '    headers={',
      "        'Accept': '*/*',",
      "        'Authorization': 'Bearer {{token}}',",
      "        'Content-Type': 'application/json',",
      '    },',
      '    data=(',
      "        '{\\n'",
      "        '  \"name\": \"Ana\"\\n'",
      "        '}'",
      '    ),',
      ')',
      '',
      'print(response.status_code)',
      'print(response.text)',
    ].join('\n'));
  });

  it('Go (net/http), con el formato de gofmt', () => {
    expect(gen('go', TYPICAL)).toBe([
      'package main',
      '',
      'import (',
      '\t"fmt"',
      '\t"io"',
      '\t"net/http"',
      '\t"strings"',
      ')',
      '',
      'func main() {',
      '\tbody := strings.NewReader(`{',
      '  "name": "Ana"',
      '}`)',
      '\treq, err := http.NewRequest("POST", "{{baseUrl}}/users?lang=es", body)',
      '\tif err != nil {',
      '\t\tpanic(err)',
      '\t}',
      '\treq.Header.Add("Accept", "*/*")',
      '\treq.Header.Add("Authorization", "Bearer {{token}}")',
      '\treq.Header.Add("Content-Type", "application/json")',
      '',
      '\tres, err := http.DefaultClient.Do(req)',
      '\tif err != nil {',
      '\t\tpanic(err)',
      '\t}',
      '\tdefer res.Body.Close()',
      '',
      '\tdata, err := io.ReadAll(res.Body)',
      '\tif err != nil {',
      '\t\tpanic(err)',
      '\t}',
      '\tfmt.Println(res.Status)',
      '\tfmt.Println(string(data))',
      '}',
    ].join('\n'));
  });

  it('Java (HttpClient)', () => {
    expect(gen('java', TYPICAL)).toBe([
      'import java.net.URI;',
      'import java.net.http.HttpClient;',
      'import java.net.http.HttpRequest;',
      'import java.net.http.HttpResponse;',
      '',
      'public class Main {',
      '    public static void main(String[] args) throws Exception {',
      '        HttpClient client = HttpClient.newHttpClient();',
      '        HttpRequest request = HttpRequest.newBuilder()',
      '            .uri(URI.create("{{baseUrl}}/users?lang=es"))',
      '            .header("Accept", "*/*")',
      '            .header("Authorization", "Bearer {{token}}")',
      '            .header("Content-Type", "application/json")',
      '            .method("POST", HttpRequest.BodyPublishers.ofString(',
      '                "{\\n" +',
      '                "  \\"name\\": \\"Ana\\"\\n" +',
      '                "}"))',
      '            .build();',
      '',
      '        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
      '        System.out.println(response.statusCode());',
      '        System.out.println(response.body());',
      '    }',
      '}',
    ].join('\n'));
  });
});

describe('las variables y los secretos quedan como {{nombre}} (HT37, HT60)', () => {
  const env: HttpEnvironment = {
    id: 'e_00000001', name: 'Staging', protected: false, insecureTls: false, extraHosts: [],
    vars: [
      { name: 'baseUrl', secret: false, value: 'https://staging.example.com' },
      { name: 'token', secret: true, key: 'v_ab12cd34', hint: '…a1b2' },
      { name: 'password', secret: true, key: 'v_cd34ef56', hint: '…9f00' },
    ],
  };
  const code = 'POST {{baseUrl}}/login\nAuthorization: Bearer {{token}}\nX-Pass: {{password}}\n\n{"t":"{{token}}","p":"{{password}}"}';

  it('ni el valor de una variable normal ni la pista ni la marca de un secreto', () => {
    const r = req(code);
    // La misma petición, resuelta con el entorno, sí lleva los valores:
    // los generadores nunca pasan por ahí.
    const resolved = resolveRequest(r, { env, now: () => new Date(0), uuid: () => 'u', userAgent: 'Logday/1' });
    expect(resolved.ok && resolved.preview.url).toBe('https://staging.example.com/login');
    for (const lang of ALL) {
      const out = generateCode(lang, r)!;
      expect(out, lang).toContain('{{baseUrl}}');
      expect(out, lang).toContain('{{token}}');
      expect(out, lang).toContain('{{password}}');
      for (const leak of ['staging.example.com', 'a1b2', '9f00', 'v_ab12cd34', 'v_cd34ef56', '$secret', '••••']) {
        expect(out, `${lang}: ${leak}`).not.toContain(leak);
      }
    }
  });

  it('las variables del sistema también quedan como están', () => {
    for (const lang of ALL) expect(gen(lang, 'GET https://x.com/{{$uuid}}\nX-At: {{$timestamp}}'), lang).toMatch(/\{\{\$uuid\}\}[\s\S]*\{\{\$timestamp\}\}/);
  });
});

describe('Content-Type JSON que agrega Logday (decisión 6)', () => {
  it('con un cuerpo JSON válido y sin Content-Type, en todos los lenguajes', () => {
    for (const lang of ALL) expect(gen(lang, 'POST https://x.com\n\n{"a":1}'), lang).toMatch(/Content-Type.{1,6}application\/json/);
  });

  it('variables dentro y fuera de comillas cuentan como JSON', () => {
    expect(impliesJsonContentType(req('POST https://x.com\n\n{"n": {{num}}, "s": "{{s}}"}'))).toBe(true);
    expect(impliesJsonContentType(req('POST https://x.com\n\n[{{a}}, {{b}}]'))).toBe(true);
  });

  it('no si ya hay Content-Type, si no es JSON, si es HEAD o si el cuerpo es solo una variable', () => {
    expect(impliesJsonContentType(req('POST https://x.com\ncontent-type: text/plain\n\n{"a":1}'))).toBe(false);
    expect(impliesJsonContentType(req('POST https://x.com\n\nhola'))).toBe(false);
    expect(impliesJsonContentType(req('POST https://x.com\n\n{"a":1,}'))).toBe(false);
    expect(impliesJsonContentType(req('HEAD https://x.com\n\n{"a":1}'))).toBe(false);
    expect(impliesJsonContentType(req('POST https://x.com\n\n{{payload}}'))).toBe(false);
    expect(impliesJsonContentType(req('GET https://x.com'))).toBe(false);
    for (const lang of ALL) expect(gen(lang, 'POST https://x.com\n\nhola'), lang).not.toContain('Content-Type');
  });
});

describe('HEAD y GET', () => {
  it('HEAD nunca lleva cuerpo', () => {
    const code = 'HEAD https://x.com\n\nnada';
    expect(gen('curl', code)).toBe("curl --head 'https://x.com'");
    expect(gen('fetch', code)).toContain("method: 'HEAD'");
    expect(gen('python', code)).toContain("response = requests.head('https://x.com')");
    expect(gen('go', code)).toContain('http.NewRequest("HEAD", "https://x.com", nil)');
    expect(gen('go', code)).not.toContain('strings');
    expect(gen('java', code)).toContain('.method("HEAD", HttpRequest.BodyPublishers.noBody())');
    for (const lang of ALL) expect(gen(lang, code), lang).not.toContain('nada');
  });

  it('un GET sin nada más es la llamada más corta', () => {
    expect(gen('fetch', 'GET https://x.com')).toContain("const response = await fetch('https://x.com');");
    expect(gen('python', 'https://x.com')).toContain("response = requests.get('https://x.com')");
    expect(gen('curl', 'https://x.com')).toBe("curl -X GET 'https://x.com'");
  });

  it('un GET con cuerpo lo lleva, como lo envía Logday', () => {
    const code = 'GET https://x.com\n\nq';
    expect(gen('curl', code)).toContain("--data-raw 'q'");
    expect(gen('fetch', code)).toContain("body: 'q',");
    expect(gen('python', code)).toContain("data='q',");
    expect(gen('go', code)).toContain('strings.NewReader(`q`)');
    expect(gen('java', code)).toContain('.method("GET", HttpRequest.BodyPublishers.ofString("q"))');
  });

  it('cada método con su llamada', () => {
    for (const m of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(gen('python', `${m} https://x.com`)).toContain(`requests.${m.toLowerCase()}(`);
      expect(gen('fetch', `${m} https://x.com`)).toContain(`method: '${m}'`);
      expect(gen('curl', `${m} https://x.com`)).toBe(`curl -X ${m} 'https://x.com'`);
    }
  });
});

describe('Basic sin codificar (HT44): la ayuda de cada lenguaje', () => {
  const code = 'GET https://x.com\nAuthorization: Basic {{user}}:{{password}}';

  it('usuario:contraseña', () => {
    expect(gen('curl', code)).toBe("curl -X GET 'https://x.com' \\\n  -u '{{user}}:{{password}}'");
    expect(gen('fetch', code)).toContain("'Authorization': 'Basic ' + btoa('{{user}}:{{password}}'),");
    expect(gen('python', code)).toContain("auth=('{{user}}', '{{password}}'),");
    expect(gen('go', code)).toContain('req.SetBasicAuth("{{user}}", "{{password}}")');
    const java = gen('java', code)!;
    expect(java).toContain('.header("Authorization", "Basic " + Base64.getEncoder().encodeToString("{{user}}:{{password}}".getBytes(StandardCharsets.UTF_8)))');
    expect(java).toContain('import java.util.Base64;');
    expect(java).toContain('import java.nio.charset.StandardCharsets;');
    for (const lang of ALL) expect(gen(lang, code), lang).not.toContain('Authorization: Basic');
  });

  it('con un espacio, y la contraseña puede tener ":"', () => {
    expect(gen('python', 'GET https://x.com\nauthorization: basic ana {{pass}}')).toContain("auth=('ana', '{{pass}}')");
    expect(gen('go', 'GET https://x.com\nAuthorization: Basic ana:a:b')).toContain('req.SetBasicAuth("ana", "a:b")');
  });

  it('ya en Base64 (o en una variable) va como cabecera, tal cual', () => {
    expect(gen('curl', 'GET https://x.com\nAuthorization: Basic dXNlcjpwYXNz')).toContain("-H 'Authorization: Basic dXNlcjpwYXNz'");
    expect(gen('python', 'GET https://x.com\nAuthorization: Basic {{b64}}')).toContain("'Authorization': 'Basic {{b64}}'");
    expect(gen('java', 'GET https://x.com\nAuthorization: Basic {{b64}}')).not.toContain('Base64');
  });

  it('con dos Authorization no se elige: van las dos', () => {
    const out = gen('curl', 'GET https://x.com\nAuthorization: Basic a:b\nAuthorization: Bearer {{t}}')!;
    expect(out).not.toContain(' -u ');
    expect(out).toContain("-H 'Authorization: Basic a:b'");
  });
});

describe('cabeceras repetidas y especiales', () => {
  const code = 'GET https://x.com\nX-A: 1\nx-a: 2\nCookie: a=1\nCookie: b=2\nHost: example.org';

  it('cURL, Go y Java las mandan aparte; fetch y Python, unidas', () => {
    expect(gen('curl', code)).toContain("-H 'X-A: 1' \\\n  -H 'x-a: 2'");
    expect(gen('go', code)).toContain('req.Header.Add("X-A", "1")\n\treq.Header.Add("x-a", "2")');
    expect(gen('java', code)).toContain('.header("X-A", "1")\n            .header("x-a", "2")');
    expect(gen('fetch', code)).toContain("'X-A': '1, 2',");
    expect(gen('fetch', code)).toContain("'Cookie': 'a=1; b=2',");
    expect(gen('python', code)).toContain("'X-A': '1, 2',");
  });

  it('en Go, Host va en req.Host', () => {
    expect(gen('go', code)).toContain('req.Host = "example.org"');
    expect(gen('go', code)).not.toContain('Header.Add("Host"');
  });
});

describe('Java con multipart (decisión 7)', () => {
  const code = 'POST https://x.com\nContent-Type: multipart/form-data; boundary=B\n\n--B\nContent-Disposition: form-data; name="a"\n\n1\n--B--';

  it('queda bloqueado con su razón; los demás lo generan', () => {
    expect(codegenBlocked('java', req(code))).toBe('java_multipart');
    expect(generateCode('java', req(code))).toBeNull();
    for (const lang of ALL.filter((l) => l !== 'java')) {
      expect(codegenBlocked(lang, req(code)), lang).toBeNull();
      expect(generateCode(lang, req(code)), lang).toContain('boundary=B');
    }
    expect(codegenBlocked('java', req('POST https://x.com\n\n{}'))).toBeNull();
  });
});

describe('escapes por lenguaje', () => {
  // Comillas, barra invertida, salto de línea, tabulador, control, DEL,
  // U+2028, BOM, ñ y un emoji.
  const raw = `a'b"c\\d\ne\tf\x01g\x7fh\u2028i\ufeffjñ😀`;

  it('shell: comillas simples, con el resto tal cual', () => {
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
    expect(shellQuote(raw)).toBe(`'a'\\''b"c\\d\ne\tf\x01g\x7fh\u2028i\ufeffjñ😀'`);
  });

  it('JavaScript', () => {
    expect(jsString(raw)).toBe(`'a\\'b"c\\\\d\\ne\\tf\\x01g\\x7Fh\\u2028i\ufeffjñ😀'`);
  });

  it('Python', () => {
    expect(pyString(raw)).toBe(`'a\\'b"c\\\\d\\ne\\tf\\x01g\\x7Fh\u2028i\ufeffjñ😀'`);
  });

  it('Go', () => {
    expect(goString(raw)).toBe(`"a'b\\"c\\\\d\\ne\\tf\\x01g\\x7Fh\u2028i\\uFEFFjñ😀"`);
  });

  it('Java: lo que no es ASCII como \\uXXXX y el control en octal', () => {
    expect(javaString(raw)).toBe(`"a'b\\"c\\\\d\\ne\\tf\\001g\\177h\\u2028i\\uFEFFj\\u00F1\\uD83D\\uDE00"`);
    // Un "\u0022" escrito en el texto no se vuelve una comilla al compilar.
    expect(javaString('\\u0022')).toBe('"\\\\u0022"');
    expect(javaString('\b\f\r')).toBe('"\\b\\f\\r"');
  });

  it('el cuerpo de varias líneas: template literal en JS y raw string en Go, si se puede', () => {
    const code = 'POST https://x.com\nContent-Type: text/plain\n\nuno ${x}\n`dos` \\ fin';
    expect(gen('fetch', code)).toContain('body: `uno \\${x}\n\\`dos\\` \\\\ fin`,');
    // Con comillas invertidas, Go no puede usar raw string.
    expect(gen('go', code)).toContain('strings.NewReader("uno ${x}\\n`dos` \\\\ fin")');
    expect(gen('go', 'POST https://x.com\nContent-Type: text/plain\n\nuno\n"dos"')).toContain('strings.NewReader(`uno\n"dos"`)');
  });

  it('Python codifica en UTF-8 un cuerpo que no es ASCII; si es ASCII, lo deja como str', () => {
    expect(gen('python', 'POST https://x.com\nContent-Type: text/plain\n\naño')).toContain("data='año'.encode(),");
    expect(gen('python', 'POST https://x.com\nContent-Type: text/plain\n\nuno\nños')).toContain("    data=(\n        'uno\\n'\n        'ños'\n    ).encode(),");
    expect(gen('python', 'POST https://x.com\nContent-Type: text/plain\n\nabc')).toContain("data='abc',");
  });

  it('las líneas en blanco del cuerpo se conservan', () => {
    expect(gen('java', 'POST https://x.com\nContent-Type: text/plain\n\na\n\nb')).toContain('"a\\n" +\n                "\\n" +\n                "b"))');
    expect(gen('python', 'POST https://x.com\nContent-Type: text/plain\n\na\n\nb')).toContain("'a\\n'\n        '\\n'\n        'b'");
  });

  it('una URL y una cabecera con comillas', () => {
    const code = "GET https://x.com/?q=it's\nX-Note: say \"hi\"";
    expect(gen('curl', code)).toContain(`'https://x.com/?q=it'\\''s'`);
    expect(gen('fetch', code)).toContain(`fetch('https://x.com/?q=it\\'s'`);
    expect(gen('python', code)).toContain(`'X-Note': 'say "hi"'`);
    expect(gen('go', code)).toContain(`req.Header.Add("X-Note", "say \\"hi\\"")`);
    expect(gen('java', code)).toContain(`.header("X-Note", "say \\"hi\\"")`);
  });
});

describe('toCurl (HT37), sin cambios de salida', () => {
  const curl = (code: string, i = 0) => toCurl(req(code, i));

  it('método, URL, cabeceras y cuerpo, una opción por línea', () => {
    expect(curl('POST https://x.com/users\nAccept: */*\nContent-Type: application/json\n\n{"name":"Ana"}')).toBe([
      "curl -X POST 'https://x.com/users'",
      "-H 'Accept: */*'",
      "-H 'Content-Type: application/json'",
      `--data-raw '{"name":"Ana"}'`,
    ].join(' \\\n  '));
  });

  it('escapa las comillas simples y deja los saltos de línea del cuerpo', () => {
    const out = curl("PUT https://x.com/a?q=it's\nX-Note: l'eau\n\nlínea 1\nit's");
    expect(out).toContain(`'https://x.com/a?q=it'\\''s'`);
    expect(out).toContain(`-H 'X-Note: l'\\''eau'`);
    expect(out).toContain(`--data-raw 'línea 1\nit'\\''s'`);
  });

  it('la petición de un bloque con ###, y la query en líneas ? y &', () => {
    expect(curl('### A\nGET https://x.com/a\n\n### B\nDELETE https://x.com/b\n?id=1\n&force=true', 1))
      .toBe("curl -X DELETE 'https://x.com/b?id=1&force=true'");
  });

  it('las líneas comentadas (filas desactivadas) no aparecen', () => {
    const out = curl('GET https://x.com\n# X-Off: 1\nX-On: 2');
    expect(out).not.toContain('X-Off');
    expect(out).toContain('X-On: 2');
  });
});

describe('requestForCode', () => {
  it('la petición sin errores; con errores, null; una variable que falta no es un error', () => {
    expect(requestForCode('GET {{baseUrl}}')?.url).toBe('{{baseUrl}}');
    expect(requestForCode('mal')).toBeNull();
    expect(requestForCode('GET https://x.com\nmal')).toBeNull();
    expect(requestForCode('GET https://x.com\nX: {{$secret:v_1}}')).toBeNull();
    expect(requestForCode('')).toBeNull();
    expect(requestForCode('### A\nGET https://x.com/a\n\n### B\nPOST https://x.com/b', 1)?.method).toBe('POST');
    // El índice se acota a las peticiones que hay.
    expect(requestForCode('GET https://x.com/a', 5)?.url).toBe('https://x.com/a');
  });
});
