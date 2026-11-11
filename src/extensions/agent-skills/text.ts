// Textos de la extensión: la sección `agentSkills` de i18n, con `{x}` y
// plurales `{n|uno|varios}` (como Pomodoro y DevTools).
import { t, type AgentSkillsKey, type Language } from '../../lib/i18n';
import { interpolate, type TextVars } from '../../lib/interpolate';
import { localeOf } from './model';

export type Tr = (key: AgentSkillsKey, vars?: TextVars) => string;

export function makeTr(language: Language): Tr {
  const num = new Intl.NumberFormat(localeOf(language));
  return (key, vars) => interpolate(t(language, 'agentSkills', key), vars, (v) => num.format(v));
}

/** Una clave armada con un código (`err.not_found`, `warn.hooks`): si no
 *  existe, la genérica. */
export function trCode(tr: Tr, prefix: 'err' | 'warn' | 'warnHelp' | 'origin' | 'source', code: string, fallback: AgentSkillsKey): string {
  const key = `${prefix}.${code}` as AgentSkillsKey;
  const text = tr(key);
  return text === key ? tr(fallback) : text;
}

export const dateTime = (ms: number, language: Language) =>
  new Intl.DateTimeFormat(localeOf(language), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

export const isMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
