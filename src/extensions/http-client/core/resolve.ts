// Variables y entorno → la petición que va a Rust y la vista enmascarada
// (specs/cliente-http HT15, HT16, HT20, HT21, design A5). El webview nunca
// tiene el valor de un secreto: en su lugar va la marca {{$secret:<clave>}}
// y Rust lo pone al enviar. Puro, sin React ni Tauri.
import { parseJson } from '../../devtools/tools/formats';
import { maskOf, trustedHosts, type HttpEnvironment } from './environments';
import { replaceVariables, type HttpMethod, type ParsedRequest } from './parse';

export const SYSTEM_VARIABLES = ['$uuid', '$timestamp', '$isoTimestamp'] as const;

const WRITE_METHODS: readonly HttpMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

export interface ResolveContext {
  env: HttpEnvironment | null;
  now: () => Date;
  uuid: () => string;
  /** "Logday/1.1.0", para la cabecera automática. */
  userAgent: string;
}

export interface WireRequest {
  method: HttpMethod;
  url: string;
  headers: [string, string][];
  body: string | null;
}

export interface PreviewHeader {
  name: string;
  value: string;
  /** Lleva un secreto (se ve su pista). */
  secret: boolean;
  /** "Agregada por Logday". */
  auto: boolean;
}

export interface SentPreview {
  method: HttpMethod;
  url: string;
  headers: PreviewHeader[];
  body: string | null;
}

export type ConfirmReason =
  | { kind: 'protected'; env: string }
  | { kind: 'untrusted_host'; host: string; vars: string[] };

export type UrlError = 'invalid_url' | 'scheme_not_allowed' | 'credentials_in_url';

export type Resolved =
  | {
    ok: true;
    wire: WireRequest;
    preview: SentPreview;
    /** Nombres de las variables secretas que lleva. */
    secrets: string[];
    /** El host después de poner las variables, o `null` si lleva un
     *  secreto (lo comprueba Rust, HT21). */
    host: string | null;
    trustedHosts: string[];
    needsConfirm: ConfirmReason[];
  }
  | {
    ok: false;
    missing: string[];
    emptySecrets: string[];
    unknownSystem: string[];
    urlError?: UrlError;
  };

export const secretMarker = (key: string) => `{{$secret:${key}}}`;

const hasHeader = (headers: readonly { name: string }[], name: string) =>
  headers.some((h) => h.name.toLowerCase() === name.toLowerCase());

/** La URL ya con las variables: solo http y https, sin usuario ni
 *  contraseña. Si un secreto tapa el esquema o el host, la validación es
 *  de Rust y el host queda en `null`. */
export function checkUrl(url: string): { host: string | null; error?: UrlError } {
  const probe = url.replace(/\{\{\$secret:[a-z0-9_]+\}\}/g, 'xsecretx');
  const hasSecret = probe !== url;
  let parsed: URL;
  try {
    parsed = new URL(probe);
  } catch {
    return hasSecret ? { host: null } : { host: null, error: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return hasSecret && /xsecretx/.test(parsed.protocol) ? { host: null } : { host: null, error: 'scheme_not_allowed' };
  }
  if (parsed.username || parsed.password) return { host: null, error: 'credentials_in_url' };
  const host = parsed.hostname.toLowerCase();
  if (!host) return { host: null, error: 'invalid_url' };
  if (host.includes('xsecretx')) return { host: null };
  return { host };
}

export function resolveRequest(req: ParsedRequest, ctx: ResolveContext): Resolved {
  const { env } = ctx;
  const missing: string[] = [];
  const emptySecrets: string[] = [];
  const unknownSystem: string[] = [];
  const secrets: string[] = [];
  const now = ctx.now();
  // Una sola vez por petición: el mismo {{$uuid}} en la URL y en el cuerpo
  // es el mismo valor.
  let uuid: string | null = null;

  const system = (name: string): string | null => {
    if (name === '$uuid') return (uuid ??= ctx.uuid());
    if (name === '$timestamp') return String(Math.floor(now.getTime() / 1000));
    if (name === '$isoTimestamp') return now.toISOString();
    return null;
  };

  // `wire` lleva la marca del secreto; `preview`, su pista.
  const fill = (text: string, forPreview: boolean, onSecret?: () => void): string =>
    replaceVariables(text, (name) => {
      if (name.startsWith('$')) {
        const value = system(name);
        if (value === null && !unknownSystem.includes(name)) unknownSystem.push(name);
        return value;
      }
      const v = env?.vars.find((x) => x.name === name);
      if (!v) {
        if (!missing.includes(name)) missing.push(name);
        return null;
      }
      if (!v.secret) return v.value;
      if (v.hint === null) {
        if (!emptySecrets.includes(name)) emptySecrets.push(name);
        return null;
      }
      if (!secrets.includes(name)) secrets.push(name);
      onSecret?.();
      return forPreview ? maskOf(v.hint) : secretMarker(v.key);
    });

  const wireUrl = fill(req.url, false);
  const previewUrl = fill(req.url, true);
  const wireHeaders: [string, string][] = [];
  const previewHeaders: PreviewHeader[] = [];
  for (const h of req.headers) {
    let secret = false;
    wireHeaders.push([h.name, fill(h.value, false, () => { secret = true; })]);
    previewHeaders.push({ name: h.name, value: fill(h.value, true), secret, auto: false });
  }
  // HT5: con HEAD el cuerpo no se envía.
  const rawBody = req.method === 'HEAD' ? null : req.body;
  const wireBody = rawBody === null ? null : fill(rawBody, false);
  const previewBody = rawBody === null ? null : fill(rawBody, true);

  if (missing.length || emptySecrets.length || unknownSystem.length) {
    return { ok: false, missing, emptySecrets, unknownSystem };
  }

  const url = checkUrl(wireUrl);
  if (url.error) return { ok: false, missing, emptySecrets, unknownSystem, urlError: url.error };

  // Cabeceras automáticas (decisión 6), marcadas en la vista.
  if (wireBody !== null && !hasHeader(req.headers, 'content-type') && parseJson(wireBody).ok) {
    wireHeaders.push(['Content-Type', 'application/json']);
    previewHeaders.push({ name: 'Content-Type', value: 'application/json', secret: false, auto: true });
  }
  if (!hasHeader(req.headers, 'user-agent')) {
    wireHeaders.push(['User-Agent', ctx.userAgent]);
    previewHeaders.push({ name: 'User-Agent', value: ctx.userAgent, secret: false, auto: true });
  }

  const trusted = trustedHosts(env).map((h) => h.host);
  const needsConfirm: ConfirmReason[] = [];
  if (env?.protected && WRITE_METHODS.includes(req.method)) needsConfirm.push({ kind: 'protected', env: env.name });
  if (secrets.length > 0 && url.host !== null && !trusted.includes(url.host)) {
    needsConfirm.push({ kind: 'untrusted_host', host: url.host, vars: [...secrets] });
  }

  return {
    ok: true,
    wire: { method: req.method, url: wireUrl, headers: wireHeaders, body: wireBody },
    preview: { method: req.method, url: previewUrl, headers: previewHeaders, body: previewBody },
    secrets,
    host: url.host,
    trustedHosts: trusted,
    needsConfirm,
  };
}
