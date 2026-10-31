// Timestamp Unix ↔ fecha (specs/devtools D4).
import { fail, ok, type ToolResult } from './result';

export type TimestampUnit = 'seconds' | 'milliseconds';

export interface ParsedTimestamp {
  ms: number;
  /** La unidad detectada (o la elegida). */
  unit: TimestampUnit;
}

// Un timestamp en segundos de hoy tiene 10 cifras y en milisegundos 13.
// Desde 1e11 (año 5138 en segundos, 1973 en ms) se toma como ms.
const MS_THRESHOLD = 1e11;
// Lo que `Date` admite: ±8.64e15 ms.
const MAX_MS = 8.64e15;

export function parseTimestamp(input: string, unit: TimestampUnit | 'auto' = 'auto'): ToolResult<ParsedTimestamp> {
  const clean = input.trim().replace(/[_\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return fail('timestamp-invalid');
  const n = Number(clean);
  const detected: TimestampUnit = unit === 'auto' ? (Math.abs(n) >= MS_THRESHOLD ? 'milliseconds' : 'seconds') : unit;
  const ms = detected === 'seconds' ? n * 1000 : n;
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_MS) return fail('timestamp-invalid');
  return ok({ ms: Math.round(ms), unit: detected });
}

/** Una fecha escrita a mano: ISO 8601 (con o sin hora y zona) o
 *  `YYYY-MM-DD HH:mm[:ss]`. Sin zona, se entiende en la hora local, como
 *  la escribiría quien la mira. */
export function parseDateInput(input: string): ToolResult<number> {
  const s = input.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m) return fail('date-invalid');
  const [, y, mo, d, h = '0', mi = '0', sec = '0', frac = '0', zone] = m;
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec), Number(frac.padEnd(3, '0'))] as const;
  let ms: number;
  if (zone) {
    ms = Date.UTC(...parts);
    if (zone !== 'Z') {
      const z = /^([+-])(\d{2}):?(\d{2})$/.exec(zone)!;
      const offset = (Number(z[2]) * 60 + Number(z[3])) * (z[1] === '+' ? 1 : -1);
      ms -= offset * 60_000;
    }
  } else {
    ms = new Date(...parts).getTime();
  }
  // Rechaza 2026-02-31 y similares: Date los corre al mes siguiente.
  const check = zone ? new Date(Date.UTC(...parts)) : new Date(...parts);
  const [cy, cm, cd] = zone
    ? [check.getUTCFullYear(), check.getUTCMonth(), check.getUTCDate()]
    : [check.getFullYear(), check.getMonth(), check.getDate()];
  if (cy !== parts[0] || cm !== parts[1] || cd !== parts[2] || Number(h) > 23 || Number(mi) > 59 || Number(sec) > 59) {
    return fail('date-invalid');
  }
  return Number.isFinite(ms) ? ok(ms) : fail('date-invalid');
}

/** La zona horaria del equipo (por ejemplo, America/Bogota). */
export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Fecha y hora completas en una zona, en el idioma de la app. */
export function formatInZone(ms: number, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(ms));
}

/** "hace 3 horas", "en 2 días". */
export function relativeTime(ms: number, now: number, locale: string): string {
  const diff = (ms - now) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60], ['second', 1],
  ];
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, seconds] of units) {
    if (Math.abs(diff) >= seconds || unit === 'second') return fmt.format(Math.round(diff / seconds), unit);
  }
  return fmt.format(0, 'second');
}
