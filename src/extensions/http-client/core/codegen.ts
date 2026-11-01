// "Copiar como…" (specs/cliente-http HT37, HT60 y HT61): una petición de
// un bloque ```http como código de cURL, JavaScript (fetch), Python
// (requests), Go (net/http) y Java (HttpClient). Puro: sin React ni DOM,
// sobre el mismo parser que el envío.
//
// Reglas de todos los lenguajes:
// - Se usa el texto de la petición tal cual: las variables y los secretos
//   quedan como `{{nombre}}`, NUNCA con su valor. Ningún generador recibe
//   el entorno, así que no hay valor que se pueda filtrar.
// - Lleva el `Content-Type: application/json` que agrega Logday cuando el
//   cuerpo es JSON y no hay Content-Type (decisión 6 del diseño).
// - HEAD va sin cuerpo, como lo envía Logday.
// - `Authorization: Basic usuario:contraseña` (sin codificar, HT44) usa la
//   ayuda de cada lenguaje (`-u`, `auth=`, `SetBasicAuth`…) en vez de la
//   cabecera, porque esas credenciales las codifica Logday al enviar.
// - Las comillas, los saltos de línea y los caracteres de control se
//   escapan según el lenguaje, y el Unicode se deja tal cual salvo en Java
//   (`\uXXXX`, porque javac no siempre lee el código fuente como UTF-8).
import { hasErrors, parseHttpBlock, replaceVariables, type HttpMethod, type ParsedRequest } from './parse';

export type CodeLanguage = 'curl' | 'fetch' | 'python' | 'go' | 'java';

export interface CodeLanguageInfo {
  id: CodeLanguage;
  /** El nombre en el menú y en el anuncio ("Copiado como Python (requests)"). */
  label: string;
  /** El lenguaje del resaltado del panel "Código". */
  highlight: 'bash' | 'javascript' | 'python' | 'go' | 'java';
}

/** En el orden del menú. Los nombres son de producto: no se traducen. */
export const CODE_LANGUAGES: readonly CodeLanguageInfo[] = [
  { id: 'curl', label: 'cURL', highlight: 'bash' },
  { id: 'fetch', label: 'JavaScript (fetch)', highlight: 'javascript' },
  { id: 'python', label: 'Python (requests)', highlight: 'python' },
  { id: 'go', label: 'Go (net/http)', highlight: 'go' },
  { id: 'java', label: 'Java (HttpClient)', highlight: 'java' },
];

/** Por qué un lenguaje no puede generar esta petición. */
export type CodegenBlock = 'java_multipart';

/** La petición `index` del bloque si se puede generar su código: existe y
 *  ni ella ni el bloque tienen errores. Una variable que falta no lo
 *  impide, porque el código lleva `{{nombre}}`. */
export function requestForCode(code: string, index = 0): ParsedRequest | null {
  const parsed = parseHttpBlock(code);
  const req = parsed.requests[Math.min(Math.max(0, index), Math.max(0, parsed.requests.length - 1))];
  if (!req || hasErrors(req.issues) || hasErrors(parsed.issues)) return null;
  return req;
}

const lower = (s: string) => s.toLowerCase();
const headerValue = (req: ParsedRequest, name: string) => req.headers.find((h) => lower(h.name) === name)?.value ?? null;

/** Java: `HttpClient` no trae multipart; escribirlo a mano con el boundary
 *  son unas 30 líneas que pocos copiarían (decisión 7). */
export function codegenBlocked(lang: CodeLanguage, req: ParsedRequest): CodegenBlock | null {
  if (lang !== 'java') return null;
  return req.headers.some((h) => lower(h.name) === 'content-type' && /^\s*multipart\//i.test(h.value)) ? 'java_multipart' : null;
}

/** El código de `req` en `lang`, o `null` si ese lenguaje no puede
 *  generarlo (`codegenBlocked`). */
export function generateCode(lang: CodeLanguage, req: ParsedRequest): string | null {
  if (codegenBlocked(lang, req)) return null;
  const p = prepare(req);
  switch (lang) {
    case 'curl': return curlCode(p);
    case 'fetch': return fetchCode(p);
    case 'python': return pythonCode(p);
    case 'go': return goCode(p);
    case 'java': return javaCode(p);
  }
}

// ---------- Lo común ----------

interface Basic {
  user: string;
  password: string;
}

/** La petición lista para escribirla en cualquier lenguaje. */
interface Prepared {
  method: HttpMethod;
  url: string;
  /** Las de la petición, en orden, sin la `Authorization` que pasó a
   *  `basic`, y con el Content-Type JSON de Logday al final si toca. */
  headers: [string, string][];
  basic: Basic | null;
  body: string | null;
}

const SINGLE_VARIABLE_RE = /^\s*\{\{[^}]*\}\}\s*$/;

/** Si Logday le agregaría `Content-Type: application/json`: el cuerpo es
 *  JSON válido. Las variables no tienen valor aquí, así que cada una se
 *  prueba como un `0` (vale dentro de comillas y fuera de ellas). Un cuerpo
 *  que es solo una variable no se sabe hasta enviar: no lo lleva. */
export function impliesJsonContentType(req: ParsedRequest): boolean {
  const body = req.method === 'HEAD' ? null : req.body;
  if (body === null || headerValue(req, 'content-type') !== null || SINGLE_VARIABLE_RE.test(body)) return false;
  try {
    JSON.parse(replaceVariables(body, () => '0'));
    return true;
  } catch {
    return false;
  }
}

/** `Basic usuario:contraseña` o `Basic usuario contraseña`, sin codificar
 *  (HT44): Base64 nunca tiene `:` ni espacios, así que `Basic dXNlcjpwYXNz`
 *  o `Basic {{b64}}` se dejan como cabecera. */
function basicOf(value: string): Basic | null {
  const m = /^Basic\s+(.+)$/i.exec(value.trim());
  if (!m) return null;
  const cred = m[1].trim();
  const colon = cred.indexOf(':');
  if (colon >= 0) return { user: cred.slice(0, colon), password: cred.slice(colon + 1) };
  const space = /\s+/.exec(cred);
  if (!space) return null;
  return { user: cred.slice(0, space.index), password: cred.slice(space.index + space[0].length) };
}

function prepare(req: ParsedRequest): Prepared {
  const auths = req.headers.filter((h) => lower(h.name) === 'authorization');
  // Con dos Authorization no se adivina cuál es la buena: van las dos tal cual.
  const basic = auths.length === 1 ? basicOf(auths[0].value) : null;
  const headers: [string, string][] = req.headers
    .filter((h) => !(basic && h === auths[0]))
    .map((h) => [h.name, h.value]);
  if (impliesJsonContentType(req)) headers.push(['Content-Type', 'application/json']);
  return { method: req.method, url: req.url, headers, basic, body: req.method === 'HEAD' ? null : req.body };
}

/** Las cabeceras repetidas (sin distinguir mayúsculas) en una, para los
 *  lenguajes que las guardan en un diccionario: se unen con `, ` (con
 *  `; ` las Cookie), como lo haría el propio protocolo. */
function mergeHeaders(headers: readonly [string, string][]): [string, string][] {
  const out: [string, string][] = [];
  for (const [name, value] of headers) {
    const prev = out.find(([n]) => lower(n) === lower(name));
    if (prev) prev[1] += `${lower(name) === 'cookie' ? '; ' : ', '}${value}`;
    else out.push([name, value]);
  }
  return out;
}

const hex = (c: string, width: number) => c.charCodeAt(0).toString(16).toUpperCase().padStart(width, '0');

// ---------- cURL ----------

/** Entre comillas simples para sh/zsh: `'` se escribe `'\''`. */
export const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

function curlCode(p: Prepared): string {
  // `-X HEAD` deja a curl esperando un cuerpo que no llega: va `--head`.
  const parts: string[] = [`curl ${p.method === 'HEAD' ? '--head' : `-X ${p.method}`} ${shellQuote(p.url)}`];
  if (p.basic) parts.push(`-u ${shellQuote(`${p.basic.user}:${p.basic.password}`)}`);
  for (const [name, value] of p.headers) parts.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  if (p.body !== null) parts.push(`--data-raw ${shellQuote(p.body)}`);
  return parts.join(' \\\n  ');
}

/** El comando cURL de una petición, para pegarlo en una terminal (HT37). */
export function toCurl(req: ParsedRequest): string {
  return curlCode(prepare(req));
}

// ---------- JavaScript (fetch) ----------

/** Un string de JS entre comillas simples. */
export function jsString(s: string): string {
  let out = '';
  for (const c of s) {
    if (c === '\\') out += '\\\\';
    else if (c === "'") out += "\\'";
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (c < ' ' || c === '\x7f') out += `\\x${hex(c, 2)}`;
    // Fueron fin de línea en JS hasta ES2019.
    else if (c === '\u2028' || c === '\u2029') out += `\\u${hex(c, 4)}`;
    else out += c;
  }
  return `'${out}'`;
}

/** Un template literal de JS, para los cuerpos de varias líneas: se
 *  escapan `\`, `` ` `` y `${`, y los saltos de línea quedan como están. */
function jsTemplate(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\') out += '\\\\';
    else if (c === '`') out += '\\`';
    else if (c === '$' && s[i + 1] === '{') out += '\\$';
    else if (c === '\r') out += '\\r';
    else if ((c < ' ' && c !== '\n' && c !== '\t') || c === '\x7f') out += `\\x${hex(c, 2)}`;
    else if (c === '\u2028' || c === '\u2029') out += `\\u${hex(c, 4)}`;
    else out += c;
  }
  return `\`${out}\``;
}

function fetchCode(p: Prepared): string {
  const props: string[] = [];
  if (p.method !== 'GET') props.push(`  method: ${jsString(p.method)},`);
  const headers = mergeHeaders(p.headers).map(([n, v]) => `    ${jsString(n)}: ${jsString(v)},`);
  if (p.basic) headers.push(`    'Authorization': 'Basic ' + btoa(${jsString(`${p.basic.user}:${p.basic.password}`)}),`);
  if (headers.length > 0) props.push('  headers: {', ...headers, '  },');
  // Con GET, fetch rechaza el cuerpo; se deja para que el código diga lo
  // mismo que la petición (y el bloque ya avisa de GET con cuerpo).
  if (p.body !== null) props.push(`  body: ${p.body.includes('\n') ? jsTemplate(p.body) : jsString(p.body)},`);
  const call = props.length > 0 ? `fetch(${jsString(p.url)}, {\n${props.join('\n')}\n})` : `fetch(${jsString(p.url)})`;
  return [`const response = await ${call};`, '', 'console.log(response.status, await response.text());'].join('\n');
}

// ---------- Python (requests) ----------

/** Un string de Python entre comillas simples. */
export function pyString(s: string): string {
  let out = '';
  for (const c of s) {
    if (c === '\\') out += '\\\\';
    else if (c === "'") out += "\\'";
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (c < ' ' || c === '\x7f') out += `\\x${hex(c, 2)}`;
    else out += c;
  }
  return `'${out}'`;
}

/** Las líneas de un texto, cada una con su `\n` salvo la última: para
 *  escribir un cuerpo largo como strings seguidos, uno por línea. */
const linesKeepingBreaks = (s: string) => s.split('\n').map((l, i, all) => (i < all.length - 1 ? `${l}\n` : l)).filter((l) => l !== '');

function pythonCode(p: Prepared): string {
  const args: string[] = [`    ${pyString(p.url)},`];
  const headers = mergeHeaders(p.headers);
  if (headers.length > 0) args.push('    headers={', ...headers.map(([n, v]) => `        ${pyString(n)}: ${pyString(v)},`), '    },');
  if (p.basic) args.push(`    auth=(${pyString(p.basic.user)}, ${pyString(p.basic.password)}),`);
  if (p.body !== null) {
    // Un str con algo fuera de ASCII lo codifica http.client en Latin-1 (o
    // falla): Logday envía UTF-8, así que se codifica antes.
    const encode = /[\u0080-\uffff]/.test(p.body) ? '.encode()' : '';
    if (p.body.includes('\n')) {
      args.push('    data=(', ...linesKeepingBreaks(p.body).map((l) => `        ${pyString(l)}`), `    )${encode},`);
    } else {
      args.push(`    data=${pyString(p.body)}${encode},`);
    }
  }
  const fn = `requests.${lower(p.method)}`;
  const call = args.length === 1 ? `response = ${fn}(${pyString(p.url)})` : `response = ${fn}(\n${args.join('\n')}\n)`;
  return ['import requests', '', call, '', 'print(response.status_code)', 'print(response.text)'].join('\n');
}

// ---------- Go (net/http) ----------

/** Un string de Go entre comillas dobles. */
export function goString(s: string): string {
  let out = '';
  for (const c of s) {
    if (c === '\\') out += '\\\\';
    else if (c === '"') out += '\\"';
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (c < ' ' || c === '\x7f') out += `\\x${hex(c, 2)}`;
    // Go no admite el BOM dentro del código fuente.
    else if (c === '\ufeff') out += '\\uFEFF';
    else out += c;
  }
  return `"${out}"`;
}

/** Si Go acepta el texto en un raw string: sin comillas invertidas, ni
 *  control (salvo el salto de línea y el tabulador), ni BOM. */
const goRawOk = (s: string) => [...s].every((c) => c !== '`' && c !== '\ufeff' && c !== '\x7f' && (c >= ' ' || c === '\n' || c === '\t'));

/** El cuerpo como raw string (`` `…` ``), que se lee mejor con JSON, si
 *  se puede; si no, entre comillas. */
const goBody = (s: string) => (goRawOk(s) ? `\`${s}\`` : goString(s));

function goCode(p: Prepared): string {
  const imports = ['"fmt"', '"io"', '"net/http"', ...(p.body !== null ? ['"strings"'] : [])];
  const body: string[] = [];
  if (p.body !== null) body.push(`\tbody := strings.NewReader(${goBody(p.body)})`);
  body.push(
    `\treq, err := http.NewRequest(${goString(p.method)}, ${goString(p.url)}, ${p.body !== null ? 'body' : 'nil'})`,
    '\tif err != nil {', '\t\tpanic(err)', '\t}',
  );
  for (const [name, value] of p.headers) {
    // Go no envía la cabecera Host del mapa: va en `req.Host`.
    body.push(lower(name) === 'host' ? `\treq.Host = ${goString(value)}` : `\treq.Header.Add(${goString(name)}, ${goString(value)})`);
  }
  if (p.basic) body.push(`\treq.SetBasicAuth(${goString(p.basic.user)}, ${goString(p.basic.password)})`);
  body.push(
    '',
    '\tres, err := http.DefaultClient.Do(req)',
    '\tif err != nil {', '\t\tpanic(err)', '\t}',
    '\tdefer res.Body.Close()',
    '',
    '\tdata, err := io.ReadAll(res.Body)',
    '\tif err != nil {', '\t\tpanic(err)', '\t}',
    '\tfmt.Println(res.Status)',
    '\tfmt.Println(string(data))',
  );
  return ['package main', '', 'import (', ...imports.map((i) => `\t${i}`), ')', '', 'func main() {', ...body, '}'].join('\n');
}

// ---------- Java (HttpClient) ----------

/** Un string de Java entre comillas dobles. Lo que no es ASCII va como
 *  `\uXXXX` y el control como octal de tres cifras: nunca un `\u000a` o un
 *  `"`, que javac traduce antes de leer el string y lo rompen. */
export function javaString(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\') out += '\\\\';
    else if (c === '"') out += '\\"';
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (c === '\b') out += '\\b';
    else if (c === '\f') out += '\\f';
    else if (c < ' ' || c === '\x7f') out += `\\${c.charCodeAt(0).toString(8).padStart(3, '0')}`;
    // Por unidad UTF-16: un emoji son dos `\u`, como lo escribe Java.
    else if (c > '\x7f') out += `\\u${hex(c, 4)}`;
    else out += c;
  }
  return `"${out}"`;
}

function javaCode(p: Prepared): string {
  const imports = [
    'java.net.URI', 'java.net.http.HttpClient', 'java.net.http.HttpRequest', 'java.net.http.HttpResponse',
    ...(p.basic ? ['java.nio.charset.StandardCharsets', 'java.util.Base64'] : []),
  ];
  const ind = ' '.repeat(12);
  const builder: string[] = [`${ind}.uri(URI.create(${javaString(p.url)}))`];
  for (const [name, value] of p.headers) builder.push(`${ind}.header(${javaString(name)}, ${javaString(value)})`);
  if (p.basic) {
    const cred = javaString(`${p.basic.user}:${p.basic.password}`);
    builder.push(`${ind}.header("Authorization", "Basic " + Base64.getEncoder().encodeToString(${cred}.getBytes(StandardCharsets.UTF_8)))`);
  }
  if (p.body === null) {
    builder.push(`${ind}.method(${javaString(p.method)}, HttpRequest.BodyPublishers.noBody())`);
  } else if (p.body.includes('\n')) {
    const parts = linesKeepingBreaks(p.body).map((l) => `${ind}    ${javaString(l)}`);
    builder.push(`${ind}.method(${javaString(p.method)}, HttpRequest.BodyPublishers.ofString(`, `${parts.join(' +\n')}))`);
  } else {
    builder.push(`${ind}.method(${javaString(p.method)}, HttpRequest.BodyPublishers.ofString(${javaString(p.body)}))`);
  }
  return [
    ...imports.map((i) => `import ${i};`),
    '',
    'public class Main {',
    '    public static void main(String[] args) throws Exception {',
    '        HttpClient client = HttpClient.newHttpClient();',
    '        HttpRequest request = HttpRequest.newBuilder()',
    ...builder,
    `${ind}.build();`,
    '',
    '        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
    '        System.out.println(response.statusCode());',
    '        System.out.println(response.body());',
    '    }',
    '}',
  ].join('\n');
}
