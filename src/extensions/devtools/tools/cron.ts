// Cron → palabras y próximas ejecuciones (specs/devtools D4). La
// descripción sale de cronstrue (con el español cargado aparte, para no
// traer los 30 idiomas); las próximas ejecuciones se calculan aquí, en la
// hora local, para el cron clásico de 5 campos.
import cronstrue from 'cronstrue';
import 'cronstrue/locales/es';
import { fail, ok, type ToolResult } from './result';

export type CronLanguage = 'es' | 'en';

export function describeCron(expression: string, language: CronLanguage): ToolResult {
  try {
    return ok(
      cronstrue.toString(expression.trim(), {
        locale: language,
        use24HourTimeFormat: true,
        throwExceptionOnParseError: true,
        verbose: false,
      }),
    );
  } catch (e) {
    return fail('cron-invalid', { detail: String(e instanceof Error ? e.message : e) });
  }
}

interface FieldSpec {
  min: number;
  max: number;
  names?: string[];
}

const FIELDS: FieldSpec[] = [
  { min: 0, max: 59 }, // minuto
  { min: 0, max: 23 }, // hora
  { min: 1, max: 31 }, // día del mes
  { min: 1, max: 12, names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] },
  { min: 0, max: 7, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] }, // 0 y 7 = domingo
];

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
};

function parseField(raw: string, spec: FieldSpec): Set<number> | null {
  const values = new Set<number>();
  const toNumber = (s: string) => {
    const idx = spec.names?.indexOf(s.toUpperCase()) ?? -1;
    if (idx >= 0) return idx + (spec.min === 1 ? 1 : 0);
    return /^\d+$/.test(s) ? Number(s) : NaN;
  };
  for (const part of raw.split(',')) {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) return null;
    let from: number, to: number;
    if (range === '*' || range === '?') {
      from = spec.min;
      to = spec.max === 7 ? 6 : spec.max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      from = toNumber(a);
      to = toNumber(b);
    } else {
      from = toNumber(range);
      to = stepRaw === undefined ? from : spec.max;
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < spec.min || to > spec.max || from > to) return null;
    for (let v = from; v <= to; v += step) values.add(spec.max === 7 && v === 7 ? 0 : v);
  }
  return values;
}

/** Cuántos campos tiene: 5 (estándar) o 6 (con segundos, de Spring y
 *  Quartz). Otro número, `null`. */
export function cronFieldCount(expression: string): 5 | 6 | null {
  const expr = MACROS[expression.trim().toLowerCase()] ?? expression.trim();
  const n = expr.split(/\s+/).length;
  return n === 5 || n === 6 ? n : null;
}

/** Las próximas `count` ejecuciones después de `from`, en hora local, para
 *  5 campos o 6 (el primero, los segundos). `null` si no se puede leer:
 *  los de 7 campos (con año) o con `L`, `W` y `#` de Quartz se describen,
 *  pero no se calculan. */
export function nextRuns(expression: string, from: number, count: number): number[] | null {
  const expr = MACROS[expression.trim().toLowerCase()] ?? expression.trim();
  let raw = expr.split(/\s+/);
  let seconds: number[] = [0];
  if (raw.length === 6) {
    const set = parseField(raw[0], { min: 0, max: 59 });
    if (!set) return null;
    seconds = [...set].sort((a, b) => a - b);
    raw = raw.slice(1);
  }
  if (raw.length !== 5) return null;
  const sets = raw.map((r, i) => parseField(r, FIELDS[i]));
  if (sets.some((s) => s === null)) return null;
  const [minutes, hours, days, months, weekdays] = sets as Set<number>[];
  // Como en cron: si día del mes y día de la semana están restringidos
  // los dos, basta con que se cumpla uno.
  const domAny = raw[2] === '*' || raw[2] === '?';
  const dowAny = raw[4] === '*' || raw[4] === '?';
  const dayMatches = (d: Date) => {
    const dom = days.has(d.getDate());
    const dow = weekdays.has(d.getDay());
    if (domAny && dowAny) return true;
    if (domAny) return dow;
    if (dowAny) return dom;
    return dom || dow;
  };

  const out: number[] = [];
  const d = new Date(from);
  d.setSeconds(0, 0);
  // En el minuto actual todavía pueden quedar segundos por venir.
  if (seconds.every((s) => d.getTime() + s * 1000 <= from)) d.setMinutes(d.getMinutes() + 1);
  // Tope: 5 años de búsqueda (un 30 de febrero nunca llega).
  const limit = from + 5 * 366 * 86_400_000;
  while (out.length < count && d.getTime() <= limit) {
    if (!months.has(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(d)) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!hours.has(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!minutes.has(d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
      continue;
    }
    for (const s of seconds) {
      const at = d.getTime() + s * 1000;
      if (at > from && out.length < count) out.push(at);
    }
    d.setMinutes(d.getMinutes() + 1, 0, 0);
  }
  return out;
}
