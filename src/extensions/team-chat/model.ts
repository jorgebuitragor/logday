// "Chat del equipo" en modo local (logday-server/specs/daily-al-chat,
// fase 1). Lógica sin React: la configuración no secreta y los mensajes
// de error. La URL del webhook no pasa por aquí: está en el llavero.
import { t } from '../../lib/i18n';
import { localISODate } from '../../lib/localDate';
import type { Language } from '../../types/common';

export const TEAM_CHAT_ID = 'team-chat' as const;
export const WEBHOOK_SECRET_KEY = 'webhook';

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

/** Configuración no secreta, en `AppConfig.extensions['team-chat'].settings`. */
export interface TeamChatSettings {
  provider?: ChatProvider;
  /** Pista de la URL guardada ("chat.googleapis.com …a1b2"). */
  hint?: string;
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

export function readTeamChatSettings(raw: Record<string, unknown> | undefined): TeamChatSettings {
  const out: TeamChatSettings = {};
  if (!raw) return out;
  if (isProvider(raw.provider)) out.provider = raw.provider;
  if (typeof raw.hint === 'string' && raw.hint) out.hint = raw.hint;
  const last = parseLast(raw.last);
  if (last) out.last = last;
  return out;
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
