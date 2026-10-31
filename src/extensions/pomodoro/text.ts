// Textos y formatos del Pomodoro: la sección `pomodoro` de i18n con `{x}` y
// plurales `{n|uno|varios}` (como DevTools), y las horas en el idioma de la app.
import { t, type Language, type PomodoroKey } from '../../lib/i18n';
import { interpolate, type TextVars } from '../../lib/interpolate';
import type { Phase } from './model';

export type Tr = (key: PomodoroKey, vars?: TextVars) => string;

export const localeOf = (language: Language) => (language === 'es' ? 'es-CO' : 'en-US');

export function makeTr(language: Language): Tr {
  const num = new Intl.NumberFormat(localeOf(language));
  return (key, vars) => interpolate(t(language, 'pomodoro', key), vars, (v) => num.format(v));
}

const PHASE_KEY: Record<Phase, PomodoroKey> = { work: 'phaseWork', short: 'phaseShort', long: 'phaseLong' };

export const phaseName = (tr: Tr, phase: Phase) => tr(PHASE_KEY[phase]);

/** "Descanso listo", "Trabajo listo". */
export const readyName = (tr: Tr, phase: Phase) => tr(phase === 'work' ? 'readyWork' : 'readyBreak');

/** `{phase}` dentro de una frase ("Saltaste a descanso corto"): en
 *  español va en minúscula (design §9). */
export const phaseInSentence = (tr: Tr, phase: Phase, language: Language) =>
  language === 'es' ? phaseName(tr, phase).toLowerCase() : phaseName(tr, phase);

/** "25 min", "1 h 40 min", "2 h". */
export function formatFocus(tr: Tr, minutes: number): string {
  if (minutes < 60) return tr('focusMin', { m: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? tr('focusHoursExact', { h }) : tr('focusHours', { h, m });
}

/** "09:35", con el idioma de la app. */
export const timeOfDay = (ms: number, language: Language) =>
  new Intl.DateTimeFormat(localeOf(language), { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

export const shortDate = (ms: number, language: Language) =>
  new Intl.DateTimeFormat(localeOf(language), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

/** El título de la tarea en la notificación: 60 caracteres como mucho. */
export const clipTitle = (title: string, max = 60) => (title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title);

export const isMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

/** "⌘⇧→" en macOS, "Ctrl+Shift+→" fuera. */
export const shortcutLabel = (key: string, mac: boolean) => (mac ? `⌘⇧${key}` : `Ctrl+Shift+${key}`);

/** Para buscar sin tildes ni mayúsculas. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
