// Textos del Cliente HTTP: la sección `httpClient` de i18n con `{x}` y
// plurales `{n|uno|varios}` (como DevTools y el Pomodoro), y los formatos
// de tiempo, tamaño y listas en el idioma de la app.
import { t, type HttpClientKey, type Language } from '../../../lib/i18n';
import { interpolate, type TextVars } from '../../../lib/interpolate';

export type Tr = (key: HttpClientKey, vars?: TextVars) => string;

export const localeOf = (language: Language) => (language === 'es' ? 'es-CO' : 'en-US');

export function makeTr(language: Language): Tr {
  const num = new Intl.NumberFormat(localeOf(language));
  return (key, vars) => interpolate(t(language, 'httpClient', key), vars, (v) => num.format(v));
}

/** "143 ms" por debajo de 1 s, "2,4 s" por encima (Interfaz §2). */
export function formatElapsed(ms: number, language: Language): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const fmt = new Intl.NumberFormat(localeOf(language), { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return `${fmt.format(ms / 1000)} s`;
}

/** "3,2 KB", "2,3 MB" (el mismo formato de DevTools). */
export function formatSize(bytes: number, language: Language): string {
  const fmt = new Intl.NumberFormat(localeOf(language), { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${fmt.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${fmt.format(bytes / 1024)} KB`;
  return `${fmt.format(bytes / (1024 * 1024))} MB`;
}

/** "{{a}}", "{{a}} y {{b}}", "{{a}}, {{b}} y {{c}}". */
export function listVars(tr: Tr, names: readonly string[]): string {
  const items = names.map((n) => `{{${n}}}`);
  if (items.length <= 1) return items[0] ?? '';
  return tr('listAnd', { a: items.slice(0, -1).join(', '), b: items[items.length - 1] });
}

/** "hace 2 minutos", "hace un momento". */
export function formatAgo(tr: Tr, at: number, now: number, language: Language): string {
  const sec = Math.round((now - at) / 1000);
  if (sec < 45) return tr('justNow');
  const rtf = new Intl.RelativeTimeFormat(localeOf(language), { numeric: 'always' });
  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  return rtf.format(-Math.round(h / 24), 'day');
}

/** "14:05", en el idioma de la app. */
export const timeOfDay = (ms: number, language: Language) =>
  new Intl.DateTimeFormat(localeOf(language), { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

export const isMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

/** "⌘↵" en macOS, "Ctrl+Enter" fuera. */
export const sendShortcut = (mac: boolean) => (mac ? '⌘↵' : 'Ctrl+Enter');
