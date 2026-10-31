// Rellena un texto de i18n: `{x}` con su valor y `{n|singular|plural}` con
// la forma según la cantidad ("1 valor", "2 valores"). Los números van con
// `formatNumber` (separadores del idioma). Lo usan DevTools y Pomodoro.
export type TextVars = Record<string, string | number>;

export function interpolate(text: string, vars: TextVars | undefined, formatNumber: (n: number) => string = String): string {
  if (!vars) return text;
  // Las formas pueden llevar `{n}` dentro ("{n|Hay 1 más|Hay {n} más}"):
  // primero se elige la forma y después se rellena.
  const plural = text.replace(/\{(\w+)\|([^|{}]*(?:\{\w+\}[^|{}]*)*)\|([^|{}]*(?:\{\w+\}[^|{}]*)*)\}/g, (whole, name: string, one: string, many: string) => {
    const v = vars[name];
    return typeof v === 'number' ? (v === 1 ? one : many) : whole;
  });
  return plural.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name];
    if (v === undefined) return whole;
    return typeof v === 'number' ? formatNumber(v) : v;
  });
}
