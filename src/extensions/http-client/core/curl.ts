// Un comando cURL pegado → el texto de un bloque ```http (specs/cliente-http
// HT39, design §13). Es lo contrario de `toCurl` (codegen.ts). Puro: sin React
// ni DOM. Ante la duda no convierte (`null`): el texto se pega tal cual,
// que es lo que pasaba antes, y nunca se pierde nada de lo pegado.
import { HTTP_METHODS, hasErrors, parseHttpBlock } from './parse';
import { shellWords } from './shell';

export { shellWords };

export interface FromCurlResult {
  /** El texto del bloque: `MÉTODO URL`, cabeceras, línea en blanco y cuerpo. */
  code: string;
  /** Las variables `{{nombre}}` que reemplazan valores sensibles, en orden. */
  replaced: string[];
}

// ── Opciones de curl ─────────────────────────────────────────────────────

/** Las opciones cortas que llevan valor (`curl --help all`). */
const SHORT_WITH_VALUE: Record<string, string> = {
  A: 'user-agent', b: 'cookie', c: 'cookie-jar', C: 'continue-at', d: 'data', D: 'dump-header', e: 'referer',
  E: 'cert', F: 'form', H: 'header', K: 'config', m: 'max-time', o: 'output', P: 'ftp-port', Q: 'quote',
  r: 'range', t: 'telnet-option', T: 'upload-file', u: 'user', U: 'proxy-user', w: 'write-out', x: 'proxy',
  X: 'request', y: 'speed-time', Y: 'speed-limit', z: 'time-cond',
};
const SHORT_FLAGS: Record<string, string> = { G: 'get', I: 'head', ':': 'next' };

/** Las opciones largas que llevan valor. Una que no está aquí se toma como
 *  interruptor: si en verdad llevaba valor, ese valor queda como una
 *  segunda URL y el comando no se convierte (`null`), que es lo seguro. */
const LONG_WITH_VALUE = new Set([
  ...Object.values(SHORT_WITH_VALUE),
  'url', 'data-raw', 'data-binary', 'data-ascii', 'data-urlencode', 'json', 'form-string', 'url-query',
  'oauth2-bearer', 'aws-sigv4', 'variable', 'request-target', 'unix-socket', 'abstract-unix-socket',
  'connect-timeout', 'retry', 'retry-delay', 'retry-max-time', 'cacert', 'capath', 'key', 'cert-type',
  'key-type', 'pass', 'resolve', 'connect-to', 'interface', 'limit-rate', 'max-filesize', 'max-redirs',
  'trace', 'trace-ascii', 'trace-config', 'stderr', 'keepalive-time', 'expect100-timeout', 'dns-servers',
  'dns-interface', 'dns-ipv4-addr', 'dns-ipv6-addr', 'doh-url', 'proto', 'proto-redir', 'proto-default',
  'local-port', 'ciphers', 'tls13-ciphers', 'curves', 'tls-max', 'output-dir', 'create-file-mode',
  'etag-save', 'etag-compare', 'happy-eyeballs-timeout-ms', 'proxy-header', 'socks4', 'socks4a', 'socks5',
  'socks5-hostname', 'noproxy', 'preproxy', 'crlfile', 'pinnedpubkey', 'proxy-cacert', 'proxy-capath',
  'proxy-cert', 'proxy-key', 'proxy-cert-type', 'proxy-key-type', 'proxy-pass', 'proxy-ciphers',
  'proxy-crlfile', 'proxy-pinnedpubkey', 'proxy-service-name', 'proxy-tls13-ciphers', 'proxy-tlsuser',
  'proxy-tlspassword', 'proxy-tlsauthtype', 'tlsuser', 'tlspassword', 'tlsauthtype', 'sasl-authzid',
  'login-options', 'mail-from', 'mail-rcpt', 'mail-auth', 'service-name', 'krb', 'delegation', 'engine',
  'random-file', 'egd-file', 'hostpubmd5', 'hostpubsha256', 'pubkey', 'alt-svc', 'hsts', 'netrc-file',
  'parallel-max', 'rate', 'ech', 'ipfs-gateway', 'max-time', 'ip-tos', 'vlan-priority', 'header-file',
]);

/** Opciones que hacen una petición que el bloque no sabe escribir: un
 *  formulario multipart o un archivo (el bloque no los envía), otra
 *  autenticación, otra conexión o varias peticiones. */
const UNSUPPORTED = new Set([
  'form', 'form-string', 'upload-file', 'config', 'next', 'variable', 'request-target', 'unix-socket',
  'abstract-unix-socket', 'aws-sigv4', 'digest', 'ntlm', 'ntlm-wb', 'negotiate', 'anyauth', 'header-file',
  'continue-at',
]);

interface Piece {
  text: string;
  /** `--json` se concatena sin separador; los demás `-d`, con `&`. */
  json: boolean;
}

interface Command {
  urls: string[];
  method: string | null;
  head: boolean;
  get: boolean;
  headers: { name: string; value: string }[];
  /** Cabeceras que el comando quita (`-H 'Nombre:'`), en minúsculas. */
  removed: Set<string>;
  data: Piece[];
  json: boolean;
  user: string | null;
  bearer: string | null;
  query: string[];
}

/** curl codifica todo menos letras, dígitos y `-._~` (`curl_easy_escape`). */
const curlEscape = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** `--data-urlencode` (y `--url-query`): `contenido`, `=contenido`,
 *  `nombre=contenido`. Con `@` lee un archivo: `null`. */
function urlencodeArg(arg: string): string | null {
  const at = arg.search(/[=@]/);
  if (at < 0) return curlEscape(arg);
  if (arg[at] === '@') return null;
  const name = arg.slice(0, at);
  const content = curlEscape(arg.slice(at + 1));
  return name ? `${name}=${content}` : content;
}

/** Aplica una opción (por su nombre largo) con su valor. `false` si el
 *  comando no se puede convertir. */
function applyOption(cmd: Command, name: string, value: string | null): boolean {
  if (UNSUPPORTED.has(name)) return false;
  const v = value ?? '';
  switch (name) {
    case 'url':
      cmd.urls.push(v);
      return true;
    case 'request':
      cmd.method = v;
      return true;
    case 'get':
      cmd.get = true;
      return true;
    case 'head':
      cmd.head = true;
      return true;
    case 'header': {
      if (v.startsWith('@')) return false;
      const colon = v.indexOf(':');
      if (colon < 0) {
        // `Nombre;` envía la cabecera vacía; sin `:` ni `;` curl la ignora.
        if (v.endsWith(';') && v.length > 1) cmd.headers.push({ name: v.slice(0, -1).trim(), value: '' });
        return true;
      }
      const hName = v.slice(0, colon).trim();
      const hValue = v.slice(colon + 1).trim();
      // `Nombre:` sin valor quita la cabecera que curl pondría.
      if (!hValue) cmd.removed.add(hName.toLowerCase());
      else cmd.headers.push({ name: hName, value: hValue });
      return true;
    }
    case 'data':
    case 'data-ascii':
    case 'data-binary':
      if (v.startsWith('@')) return false;
      cmd.data.push({ text: v, json: false });
      return true;
    case 'data-raw':
      cmd.data.push({ text: v, json: false });
      return true;
    case 'data-urlencode': {
      const text = urlencodeArg(v);
      if (text === null) return false;
      cmd.data.push({ text, json: false });
      return true;
    }
    case 'json':
      if (v.startsWith('@')) return false;
      cmd.data.push({ text: v, json: true });
      cmd.json = true;
      return true;
    case 'url-query': {
      const text = v.startsWith('+') ? v.slice(1) : urlencodeArg(v);
      if (text === null) return false;
      cmd.query.push(text);
      return true;
    }
    case 'user':
      cmd.user = v;
      return true;
    case 'oauth2-bearer':
      cmd.bearer = v;
      return true;
    case 'user-agent':
      cmd.headers.push({ name: 'User-Agent', value: v });
      return true;
    case 'referer': {
      // `;auto` es una opción de curl, no parte del Referer.
      const ref = v.replace(/;auto$/, '');
      if (ref && ref !== 'auto') cmd.headers.push({ name: 'Referer', value: ref });
      return true;
    }
    case 'cookie':
      // Sin `=` es un archivo de cookies: no se lee.
      if (v.includes('=')) cmd.headers.push({ name: 'Cookie', value: v });
      return true;
    case 'range':
      cmd.headers.push({ name: 'Range', value: `bytes=${v}` });
      return true;
    default:
      // El resto no cambia la petición (-L, -s, -k, -o, --compressed…).
      return true;
  }
}

function parseCommand(words: string[]): Command | null {
  const cmd: Command = {
    urls: [], method: null, head: false, get: false, headers: [], removed: new Set(), data: [], json: false,
    user: null, bearer: null, query: [],
  };
  let i = 1;
  let optionsDone = false;
  while (i < words.length) {
    const w = words[i];
    i += 1;
    if (optionsDone || !w.startsWith('-') || w === '-') {
      cmd.urls.push(w);
      continue;
    }
    if (w === '--') {
      optionsDone = true;
      continue;
    }
    if (w.startsWith('--')) {
      let name = w.slice(2);
      let value: string | null = null;
      const eq = name.indexOf('=');
      if (eq > 0 && LONG_WITH_VALUE.has(name.slice(0, eq))) {
        value = name.slice(eq + 1);
        name = name.slice(0, eq);
      } else if (LONG_WITH_VALUE.has(name)) {
        if (i >= words.length) return null;
        value = words[i];
        i += 1;
      }
      if (!applyOption(cmd, name, value)) return null;
      continue;
    }
    // Cortas, también juntas (`-sSL`, `-XPOST`, `-sX POST`).
    for (let k = 1; k < w.length; k += 1) {
      const ch = w[k];
      const long = SHORT_WITH_VALUE[ch];
      if (long) {
        let value = w.slice(k + 1);
        if (!value) {
          if (i >= words.length) return null;
          value = words[i];
          i += 1;
        }
        if (!applyOption(cmd, long, value)) return null;
        break;
      }
      if (SHORT_FLAGS[ch] && !applyOption(cmd, SHORT_FLAGS[ch], null)) return null;
    }
  }
  return cmd;
}

// ── Valores sensibles ────────────────────────────────────────────────────

/** Nombres de cabecera, de parámetro de la query o de campo del cuerpo
 *  cuyo valor no debe quedar escrito en la nota. */
const SENSITIVE_NAME_RE = /token|api[-_.]?key|secret|passw(?:or)?d|session|credential|signature|^(?:x-)?auth$|^key$|^pwd$|^pass$/i;

const hasVariable = (value: string) => value.includes('{{');

/** `X-API-Key` → `x_api_key`: un nombre de variable válido (A6). */
function variableName(base: string): string {
  let name = base.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!name) name = 'secret';
  if (/^[0-9]/.test(name)) name = `_${name}`;
  return name.slice(0, 64);
}

/** Las variables que reemplazan los valores sensibles. El mismo valor
 *  reusa su variable; otro con el mismo nombre lleva `_2`, `_3`… */
class Secrets {
  private values = new Map<string, string>();
  readonly replaced: string[] = [];

  take(base: string, value: string): string {
    const root = variableName(base);
    let name = root;
    for (let k = 2; this.values.has(name) && this.values.get(name) !== value; k += 1) name = `${root}_${k}`;
    if (!this.values.has(name)) {
      this.values.set(name, value);
      this.replaced.push(name);
    }
    return `{{${name}}}`;
  }
}

/** `Authorization: Bearer x` → `Bearer {{token}}`: el esquema se ve. */
function redactAuthorization(value: string, secrets: Secrets, prefix: string): string {
  if (hasVariable(value)) return value;
  const m = /^(\S+)\s+(\S.*)$/.exec(value);
  if (!m) return secrets.take(`${prefix}authorization`, value);
  const scheme = m[1].toLowerCase();
  const base = scheme === 'bearer' || scheme === 'token' ? 'token' : scheme === 'basic' ? 'basic_auth' : 'authorization';
  return `${m[1]} ${secrets.take(prefix + base, m[2])}`;
}

function redactHeader(name: string, value: string, secrets: Secrets): string {
  const lower = name.toLowerCase();
  if (lower === 'authorization') return redactAuthorization(value, secrets, '');
  if (lower === 'proxy-authorization') return redactAuthorization(value, secrets, 'proxy_');
  if (hasVariable(value)) return value;
  if (lower === 'cookie') return secrets.take('cookie', value);
  return SENSITIVE_NAME_RE.test(name) ? secrets.take(name, value) : value;
}

const decode = (text: string) => {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
};

/** `a=1&token=x` → `a=1&token={{token}}`. */
function redactPairs(text: string, secrets: Secrets): string {
  return text.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq <= 0) return pair;
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (!value || hasVariable(value) || !SENSITIVE_NAME_RE.test(decode(key))) return pair;
    return `${key}=${secrets.take(decode(key), decode(value))}`;
  }).join('&');
}

function redactUrl(url: string, secrets: Secrets): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const hash = url.indexOf('#', q);
  const query = hash < 0 ? url.slice(q + 1) : url.slice(q + 1, hash);
  return `${url.slice(0, q + 1)}${redactPairs(query, secrets)}${hash < 0 ? '' : url.slice(hash)}`;
}

const FORM_PAIRS_RE = /^[^=&\s]+=[^&\n]*(?:&[^=&\s]+=[^&\n]*)*$/;

// ── JSON ─────────────────────────────────────────────────────────────────

const JSON_TOKEN_RE = /\s*("(?:[^"\\]|\\.)*"|[{}[\],:]|[^\s{}[\],:"]+)/gy;

/** El JSON con sangría de 2 espacios, como `JSON.stringify(…, null, 2)`,
 *  pero sin pasar por `JSON.parse`: los números y las cadenas quedan tal
 *  cual (un id de 20 dígitos no pierde precisión). Los valores de cadena
 *  de las claves sensibles pasan a `"{{clave}}"`. `null` si no es JSON. */
export function formatJsonBody(text: string, secrets?: { take: (base: string, value: string) => string }): string | null {
  try {
    JSON.parse(text);
  } catch {
    return null;
  }
  const tokens: string[] = [];
  JSON_TOKEN_RE.lastIndex = 0;
  for (let m = JSON_TOKEN_RE.exec(text); m; m = JSON_TOKEN_RE.exec(text)) tokens.push(m[1]);
  let out = '';
  let depth = 0;
  const pad = () => `\n${'  '.repeat(depth)}`;
  // Por nivel: si es un objeto y si lo que viene es una clave.
  const stack: { object: boolean; expectKey: boolean }[] = [];
  let lastKey: string | null = null;
  for (let k = 0; k < tokens.length; k += 1) {
    const t = tokens[k];
    const top = stack[stack.length - 1];
    if (t === '{' || t === '[') {
      const close = t === '{' ? '}' : ']';
      if (tokens[k + 1] === close) {
        out += t + close;
        k += 1;
        if (top) top.expectKey = false;
        continue;
      }
      stack.push({ object: t === '{', expectKey: t === '{' });
      depth += 1;
      out += t + pad();
    } else if (t === '}' || t === ']') {
      stack.pop();
      depth -= 1;
      out += pad() + t;
    } else if (t === ',') {
      if (top?.object) top.expectKey = true;
      out += `,${pad()}`;
    } else if (t === ':') {
      out += ': ';
    } else if (top?.object && top.expectKey) {
      lastKey = JSON.parse(t) as string;
      top.expectKey = false;
      out += t;
    } else {
      const sensitive = secrets && top?.object && lastKey !== null && t.startsWith('"') && SENSITIVE_NAME_RE.test(lastKey);
      const value = sensitive ? (JSON.parse(t) as string) : '';
      out += sensitive && value && !hasVariable(value) ? `"${secrets.take(lastKey!, value)}"` : t;
    }
  }
  return out;
}

// ── El bloque ────────────────────────────────────────────────────────────

const CURL_RE = /^(?:.*\/)?curl(?:\.exe)?$/i;
const SCHEME_RE = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//;

/** La URL como la entiende curl: sin esquema, `http://`. Solo http y
 *  https (HT23). Una que empieza por `{{` (una variable) se deja. */
function normalizeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url || /\s/.test(url)) return null;
  if (url.startsWith('{{')) return url;
  const scheme = SCHEME_RE.exec(url);
  if (scheme) return /^https?$/i.test(scheme[1]) ? url : null;
  // curl adivina el protocolo por el host; `ftp.` sería FTP.
  if (/^ftp\./i.test(url)) return null;
  return `http://${url}`;
}

/** `curl …` pegado → el texto de un bloque `http` equivalente, con los
 *  valores sensibles cambiados por variables `{{nombre}}` (HT39). `null`
 *  si el texto no es un único comando curl que el bloque pueda escribir. */
export function fromCurl(text: string): FromCurlResult | null {
  // Un prompt delante (`$ curl …`, `% curl …`) se quita.
  const src = text.replace(/^\s*[$%][ \t]+(?=curl)/, '');
  if (!/^\s*\S*curl(?:\.exe)?[\s]/i.test(src)) return null;
  const words = shellWords(src);
  if (!words || words.length < 2 || !CURL_RE.test(words[0])) return null;
  const cmd = parseCommand(words);
  if (!cmd || cmd.urls.length !== 1) return null;

  let url = normalizeUrl(cmd.urls[0]);
  if (!url) return null;
  const secrets = new Secrets();
  const headers: { name: string; value: string }[] = [];
  for (const h of cmd.headers) {
    // El bloque no admite saltos de línea ni nombres raros (HT23).
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(h.name) || /[\r\n]/.test(h.value)) return null;
    headers.push({ name: h.name, value: h.value });
  }
  const has = (name: string) => headers.some((h) => h.name.toLowerCase() === name) || cmd.removed.has(name);

  // Usuario y contraseña en la URL (HT23 no los admite) o con -u: Basic.
  // Van con su valor aquí y se ocultan con las demás cabeceras, abajo.
  const userinfo = /^(https?:\/\/)([^/?#@]*)@/i.exec(url);
  if (userinfo) {
    url = userinfo[1] + url.slice(userinfo[0].length);
    if (userinfo[2] && !has('authorization')) headers.push({ name: 'Authorization', value: `Basic ${userinfo[2]}` });
  }
  if (cmd.user !== null && !has('authorization')) headers.push({ name: 'Authorization', value: `Basic ${cmd.user}` });
  if (cmd.bearer !== null && !has('authorization')) headers.push({ name: 'Authorization', value: `Bearer ${cmd.bearer}` });

  // El cuerpo: los -d unidos con `&`, los --json sin separador.
  let data: string | null = null;
  for (const p of cmd.data) data = data === null ? p.text : `${data}${p.json ? '' : '&'}${p.text}`;

  let method: string;
  if (cmd.get) {
    if (data !== null) url += (url.includes('?') ? '&' : '?') + data;
    data = null;
    method = cmd.method ?? (cmd.head ? 'HEAD' : 'GET');
  } else {
    // -I con datos: curl lo rechaza ("only one HTTP request method").
    if (cmd.head && data !== null && !cmd.method) return null;
    method = cmd.method ?? (cmd.head ? 'HEAD' : data !== null ? 'POST' : 'GET');
  }
  if (cmd.query.length) url += (url.includes('?') ? '&' : '?') + cmd.query.join('&');
  method = method.toUpperCase();
  if (!(HTTP_METHODS as readonly string[]).includes(method)) return null;
  if (method === 'HEAD') data = null;

  if (cmd.json) {
    if (!has('content-type')) headers.push({ name: 'Content-Type', value: 'application/json' });
    if (!has('accept')) headers.push({ name: 'Accept', value: 'application/json' });
  }

  let body = data;
  let json: string | null = null;
  let form = false;
  if (body !== null) {
    // Una línea `###` empezaría otra petición en el bloque.
    if (/^###/m.test(body)) return null;
    json = /^\s*[[{]/.test(body) ? formatJsonBody(body) : null;
    form = json === null && FORM_PAIRS_RE.test(body);
    // curl pone este Content-Type con -d. Con un cuerpo JSON no hace
    // falta: Logday pone el de JSON (decisión 6), que es lo que se quería.
    if (form && !has('content-type')) headers.push({ name: 'Content-Type', value: 'application/x-www-form-urlencoded' });
  }

  // Los valores sensibles, en el orden en que se leen en el bloque.
  url = redactUrl(url, secrets);
  const headerLines = headers.map((h) => `${h.name}: ${redactHeader(h.name, h.value, secrets)}`);
  if (body !== null) {
    const contentType = headers.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? '';
    if (json !== null) body = formatJsonBody(body, secrets) ?? json;
    else if (form && /x-www-form-urlencoded/i.test(contentType)) body = redactPairs(body, secrets);
    if (!body.trim()) body = null;
  }

  const lines = [`${method} ${url}`, ...headerLines];
  if (body !== null) lines.push('', body);
  const code = lines.join('\n');
  // Nunca un bloque con errores: si el parser no lo entiende, no se convierte.
  const parsed = parseHttpBlock(code);
  if (parsed.requests.length !== 1 || hasErrors(parsed.issues) || hasErrors(parsed.requests[0].issues)) return null;
  return { code, replaced: secrets.replaced };
}

