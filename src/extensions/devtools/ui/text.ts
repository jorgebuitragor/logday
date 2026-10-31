// Textos y formatos de DevTools: la sección `devtools` de i18n con
// interpolación `{x}` (como `tasks.nTasks`), y los números, tamaños y
// fechas en el idioma de la app.
import { t, type DevtoolsKey, type Language } from '../../../lib/i18n';
import type { ToolId } from '../model';

export type Tr = (key: DevtoolsKey, vars?: Record<string, string | number>) => string;

export const localeOf = (language: Language) => (language === 'es' ? 'es-CO' : 'en-US');

export function makeTr(language: Language): Tr {
  const num = new Intl.NumberFormat(localeOf(language));
  return (key, vars) => {
    const text = t(language, 'devtools', key);
    if (!vars) return text;
    // `{n|singular|plural}`: la forma según la cantidad ("1 valor", "2 valores").
    const plural = text.replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (whole, name: string, one: string, many: string) => {
      const v = vars[name];
      return typeof v === 'number' ? (v === 1 ? one : many) : whole;
    });
    return plural.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const v = vars[name];
      if (v === undefined) return whole;
      return typeof v === 'number' ? num.format(v) : v;
    });
  };
}

/** Las claves que se arman con el id de la herramienta (Adenda A). */
export const toolKey = (tool: ToolId, part: 'name' | 'desc' | 'placeholder' | 'keywords') => `${tool}.${part}` as DevtoolsKey;

export const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** "3,2 KB", "2,3 MB". */
export function formatSize(bytes: number, language: Language): string {
  const fmt = new Intl.NumberFormat(localeOf(language), { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${fmt.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${fmt.format(bytes / 1024)} KB`;
  return `${fmt.format(bytes / (1024 * 1024))} MB`;
}

/** "30 oct 2026, 14:05", para el título de la nota. */
export const shortDateTime = (ms: number, language: Language) =>
  new Intl.DateTimeFormat(localeOf(language), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));

/** Atajo como lo ve el usuario. `spec`: 'mod+shift+C', 'alt+mod+down'… */
export function shortcutLabel(spec: string, mac: boolean): string {
  const parts = spec.split('+');
  const key = parts.pop() ?? '';
  const keyNames: Record<string, [string, string]> = {
    enter: ['↵', 'Enter'], backspace: ['⌫', 'Backspace'], down: ['↓', '↓'], up: ['↑', '↑'],
  };
  const keyLabel = keyNames[key] ? keyNames[key][mac ? 0 : 1] : key.toUpperCase();
  const mods: Record<string, [string, string]> = { mod: ['⌘', 'Ctrl'], shift: ['⇧', 'Shift'], alt: ['⌥', 'Alt'] };
  // En macOS el orden de los símbolos es ⌥⇧⌘; fuera, Ctrl+Alt+Shift.
  const order = mac ? ['alt', 'shift', 'mod'] : ['mod', 'alt', 'shift'];
  const names = order.filter((m) => parts.includes(m)).map((m) => mods[m][mac ? 0 : 1]);
  return mac ? names.join('') + keyLabel : [...names, keyLabel].join('+');
}

export const isMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

/** Para buscar sin tildes ni mayúsculas ("codificacion" encuentra "Codificación"). */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
