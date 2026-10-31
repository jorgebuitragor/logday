// Los comandos de Rust (`http_client_send` y `http_client_cancel`, design
// A7) y la traducción de sus errores a los textos de §8.5. Los errores
// solo traen un código y el host: nunca la URL, las cabeceras, el cuerpo
// ni un secreto (HT26).
import { invoke } from '@tauri-apps/api/core';
import type { ResponseBody } from './body';
import type { WireRequest } from './resolve';
import type { HttpClientKey } from '../../../lib/i18n';
import type { Tr } from './text';

export interface SendInput extends WireRequest {
  requestId: string;
  timeoutMs: number;
  maxResponseBytes: number;
  followRedirects: boolean;
  insecureTls: boolean;
  trustedHosts: string[];
  allowUntrustedHost: boolean;
}

export interface RedirectHop {
  status: number;
  location: string;
}

export interface SendOutput {
  status: number;
  reason: string;
  headers: [string, string][];
  body: ResponseBody;
  bodyBytes: number;
  contentLength: number | null;
  truncated: boolean;
  elapsedMs: number;
  finalUrl: string;
  redirects: RedirectHop[];
  tlsUnverified: boolean;
  droppedHeaders: string[];
}

export type SendErrorCode =
  | 'invalid_method' | 'body_too_large' | 'invalid_header' | 'too_many_in_flight' | 'secret_missing'
  | 'keychain_error' | 'invalid_url' | 'scheme_not_allowed' | 'credentials_in_url' | 'secret_host_not_allowed'
  | 'timeout' | 'dns' | 'tls' | 'connect' | 'network' | 'too_many_redirects' | 'cancelled';

export type TlsReason = 'expired' | 'not_valid_for_name' | 'unknown_issuer' | 'other';

export interface SendError {
  code: SendErrorCode;
  host: string | null;
  secretKey: string | null;
  tlsReason: TlsReason | null;
}

const KNOWN: readonly SendErrorCode[] = [
  'invalid_method', 'body_too_large', 'invalid_header', 'too_many_in_flight', 'secret_missing', 'keychain_error',
  'invalid_url', 'scheme_not_allowed', 'credentials_in_url', 'secret_host_not_allowed', 'timeout', 'dns', 'tls',
  'connect', 'network', 'too_many_redirects', 'cancelled',
];

/** Lo que rechaza `invoke` (un `SendError` de Rust, o algo raro si falló
 *  el puente), como un `SendError` conocido. */
export function toSendError(raw: unknown): SendError {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const code = typeof r.code === 'string' && (KNOWN as readonly string[]).includes(r.code) ? (r.code as SendErrorCode) : 'network';
  const tls = r.tlsReason ?? r.tls_reason;
  return {
    code,
    host: typeof r.host === 'string' ? r.host : null,
    secretKey: typeof (r.secretKey ?? r.secret_key) === 'string' ? String(r.secretKey ?? r.secret_key) : null,
    tlsReason: tls === 'expired' || tls === 'not_valid_for_name' || tls === 'unknown_issuer' || tls === 'other' ? tls : null,
  };
}

export async function sendHttp(input: SendInput): Promise<SendOutput> {
  try {
    return await invoke<SendOutput>('http_client_send', { input });
  } catch (err) {
    throw toSendError(err);
  }
}

/** Devuelve si había algo que cancelar. */
export function cancelHttp(requestId: string): Promise<boolean> {
  return invoke<boolean>('http_client_cancel', { requestId }).catch(() => false);
}

export interface ErrorContext {
  /** El entorno con el que se envió, o "Sin entorno". */
  envName: string;
  timeoutSec: number;
}

/** El texto de un error para el bloque y la región viva. */
export function sendErrorMessage(tr: Tr, err: SendError, ctx: ErrorContext): string {
  const host = err.host ?? '—';
  if (err.code === 'tls') return tr('err.tls', { host, reason: tr(`tls.${err.tlsReason ?? 'other'}` as HttpClientKey) });
  if (err.code === 'timeout') return tr('err.timeout', { s: ctx.timeoutSec });
  return tr(`err.${err.code}` as HttpClientKey, { host, env: ctx.envName });
}
