// "Chat del equipo" en modo local (logday-server/specs/daily-al-chat,
// fase 1). Lógica sin React: la configuración no secreta y los mensajes
// de error. La URL del webhook no pasa por aquí: está en el llavero.
import { t } from '../../lib/i18n';
import { localISODate } from '../../lib/localDate';
import type { Language } from '../../types/common';

export const TEAM_CHAT_ID = 'team-chat' as const;
export const WEBHOOK_SECRET_KEY = 'webhook';
/** Secreto del cliente OAuth de la organización (specs/chat-como-usuario).
 *  El token de renovación (`google_refresh`) lo escribe y lee solo Rust. */
export const GOOGLE_CLIENT_SECRET_KEY = 'google_client_secret';

export type ChatProvider = 'google_chat' | 'slack' | 'teams';
export const CHAT_PROVIDERS: readonly ChatProvider[] = ['google_chat', 'slack', 'teams'];

/** Error de un comando Rust de la extensión: solo un código y, si el
 *  proveedor respondió, su código HTTP. Nunca la URL (R11). */
export interface ChatSendError {
  code: string;
  status?: number | null;
}

/** Último envío (R21). */
export interface ChatLastResult {
  /** Instante ISO del intento. */
  sentAt: string;
  /** Fecha del daily enviado; no está en el mensaje de prueba. */
  date?: string;
  test?: boolean;
  status: 'ok' | 'error';
  error?: ChatSendError;
}

/** Cómo se envía: por el webhook (bot) o como el usuario (solo Google
 *  Chat, specs/chat-como-usuario C1, C2). */
export type SendAs = 'bot' | 'user';

/** "Como yo" en Google Chat. Sin secretos: el del cliente y el token de
 *  renovación están en el llavero. */
export interface GoogleUserSettings {
  clientId?: string;
  /** Pista del secreto del cliente guardado. */
  secretHint?: string;
  /** `spaces/<id>`, sacado del enlace (C8). */
  space?: string;
  spaceLink?: string;
  /** Correo de la cuenta conectada (C6). */
  account?: string;
  /** Aviso propio aceptado (C7). */
  consentAt?: string;
}

/** Configuración no secreta, en `AppConfig.extensions['team-chat'].settings`. */
export interface TeamChatSettings {
  provider?: ChatProvider;
  /** Pista de la URL guardada ("chat.googleapis.com …a1b2"). */
  hint?: string;
  sendAs?: SendAs;
  google?: GoogleUserSettings;
  last?: ChatLastResult;
}

function isProvider(v: unknown): v is ChatProvider {
  return typeof v === 'string' && (CHAT_PROVIDERS as readonly string[]).includes(v);
}

function parseError(v: unknown): ChatSendError | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const e = v as Record<string, unknown>;
  if (typeof e.code !== 'string') return undefined;
  return { code: e.code, status: typeof e.status === 'number' ? e.status : null };
}

function parseLast(v: unknown): ChatLastResult | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const l = v as Record<string, unknown>;
  if (typeof l.sentAt !== 'string' || (l.status !== 'ok' && l.status !== 'error')) return undefined;
  const last: ChatLastResult = { sentAt: l.sentAt, status: l.status };
  if (typeof l.date === 'string') last.date = l.date;
  if (l.test === true) last.test = true;
  const error = parseError(l.error);
  if (error) last.error = error;
  return last;
}

function parseGoogle(v: unknown): GoogleUserSettings | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const g = v as Record<string, unknown>;
  const out: GoogleUserSettings = {};
  for (const key of ['clientId', 'secretHint', 'space', 'spaceLink', 'account', 'consentAt'] as const) {
    const value = g[key];
    if (typeof value === 'string' && value) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function readTeamChatSettings(raw: Record<string, unknown> | undefined): TeamChatSettings {
  const out: TeamChatSettings = {};
  if (!raw) return out;
  if (isProvider(raw.provider)) out.provider = raw.provider;
  if (typeof raw.hint === 'string' && raw.hint) out.hint = raw.hint;
  if (raw.sendAs === 'user' || raw.sendAs === 'bot') out.sendAs = raw.sendAs;
  const google = parseGoogle(raw.google);
  if (google) out.google = google;
  const last = parseLast(raw.last);
  if (last) out.last = last;
  return out;
}

/** Si se envía como el usuario: solo con Google Chat (C1). */
export function sendsAsUser(s: TeamChatSettings): boolean {
  return s.provider === 'google_chat' && s.sendAs === 'user';
}

/** Lo que falta para poder enviar "como yo", en orden; vacío si nada. */
export function googleUserMissing(g: GoogleUserSettings | undefined): ('consent' | 'client' | 'account' | 'space')[] {
  const missing: ('consent' | 'client' | 'account' | 'space')[] = [];
  if (!g?.consentAt) missing.push('consent');
  if (!g?.clientId || !g.secretHint) missing.push('client');
  if (!g?.account) missing.push('account');
  if (!g?.space) missing.push('space');
  return missing;
}

/** Si el botón "Enviar al chat" tiene con qué enviar (R31). */
export function isReadyToSend(s: TeamChatSettings): boolean {
  if (!s.provider) return false;
  return sendsAsUser(s) ? googleUserMissing(s.google).length === 0 : !!s.hint;
}

/** Normaliza lo que rechaza `invoke`: el comando devuelve `{code, status}`
 *  o un string con el código. */
export function toChatError(err: unknown): ChatSendError {
  if (typeof err === 'string') return { code: err };
  return parseError(err) ?? { code: 'unknown' };
}

const KNOWN_ERRORS = new Set([
  'invalid_url', 'not_https', 'host_not_allowed', 'path_not_allowed', 'invalid_provider',
  'needs_reconfig', 'rate_limited', 'timeout', 'network', 'provider_error', 'empty_text',
  'text_too_long', 'keychain_error',
  // "Como yo" (specs/chat-como-usuario C4, C11, C12).
  'needs_client', 'needs_reconnect', 'not_allowed', 'space_not_found', 'invalid_space', 'cancelled',
  'state_mismatch', 'token_error', 'browser_error', 'server_error',
]);

/** Mensaje para el usuario; con el código HTTP del proveedor si lo hubo (R18). */
export function chatErrorMessage(language: Language, err: ChatSendError): string {
  const code = KNOWN_ERRORS.has(err.code) ? err.code : 'unknown';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = t(language, 'teamChat', `err_${code}` as any);
  return err.status ? `${text} (${err.status})` : text;
}

/** Si ese daily ya se envió bien hoy (fecha local), para pedir confirmar
 *  antes de mandarlo otra vez. */
export function wasSentToday(last: ChatLastResult | undefined, date: string, today: string): boolean {
  if (!last || last.status !== 'ok' || last.test || last.date !== date) return false;
  const sent = new Date(last.sentAt);
  if (Number.isNaN(sent.getTime())) return false;
  return localISODate(sent) === today;
}
