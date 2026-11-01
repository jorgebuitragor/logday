// Listas: pasar valores a un IN de SQL y de vuelta, y comparar dos listas
// (specs/devtools D13, D14).

export type ListSeparator = 'auto' | 'newline' | 'comma' | 'semicolon' | 'tab';

export interface CleanOptions {
  trim: boolean;
  skipEmpty: boolean;
  dedupe: boolean;
  /** Para comparar y quitar duplicados sin distinguir mayúsculas. */
  ignoreCase?: boolean;
}

/** Parte un texto en valores. En `auto`: si hay saltos de línea, uno por
 *  línea; si no, por tab, punto y coma o coma, en ese orden. */
export function splitValues(text: string, separator: ListSeparator = 'auto'): string[] {
  const t = text.replace(/\r\n?/g, '\n');
  if (!t) return [];
  const by = (sep: string | RegExp) => t.split(sep);
  switch (separator) {
    case 'newline': return by('\n');
    case 'comma': return by(',');
    case 'semicolon': return by(';');
    case 'tab': return by('\t');
    default:
      if (t.includes('\n')) return by('\n');
      if (t.includes('\t')) return by('\t');
      if (t.includes(';')) return by(';');
      return by(',');
  }
}

/** El separador que usa `splitValues` en `auto`, para decírselo al usuario. */
export function detectSeparator(text: string): Exclude<ListSeparator, 'auto'> {
  const t = text.replace(/\r\n?/g, '\n');
  if (t.includes('\n')) return 'newline';
  if (t.includes('\t')) return 'tab';
  if (t.includes(';')) return 'semicolon';
  return 'comma';
}

export function cleanValues(values: string[], opts: CleanOptions): string[] {
  let out = opts.trim ? values.map((v) => v.trim()) : values;
  if (opts.skipEmpty) out = out.filter((v) => v.trim() !== '');
  if (opts.dedupe) {
    const seen = new Set<string>();
    out = out.filter((v) => {
      const k = opts.ignoreCase ? v.toLowerCase() : v;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return out;
}

// ── A SQL ────────────────────────────────────────────────────────────

export type SqlQuote = 'single' | 'double' | 'none';

export interface SqlListOptions extends CleanOptions {
  quote: SqlQuote;
  /** Deja sin comillas los que son números (`42`, `-3.5`). */
  numbersUnquoted: boolean;
  /** `,` o `, `. */
  compact: boolean;
  /** Un valor por línea en la salida. */
  onePerLine: boolean;
  /** Envuelve en `(…)`. */
  parentheses: boolean;
  /** Si hay columna: `col IN (…)`. */
  column: string;
  /** Grupos de como mucho N valores unidos con `OR col IN (…)` (el límite
   *  de 1000 de Oracle). 0 = sin partir. */
  chunkSize: number;
}

const NUMBER = /^-?\d+(\.\d+)?$/;
/** `007` o `0123`: parecen números, pero sin comillas perderían los ceros. */
const LEADING_ZERO = /^-?0\d/;

/** Si un valor va sin comillas con "Números sin comillas": los números
 *  sin ceros a la izquierda y `NULL` tal cual (en mayúsculas). */
export const isUnquotedValue = (v: string) => v === 'NULL' || (NUMBER.test(v) && !LEADING_ZERO.test(v));
/** Valores que parecen números pero van como texto por sus ceros. */
export const hasLeadingZero = (v: string) => NUMBER.test(v) && LEADING_ZERO.test(v);

function quoteValue(v: string, opts: Pick<SqlListOptions, 'quote' | 'numbersUnquoted'>): string {
  if (opts.quote === 'none' || (opts.numbersUnquoted && isUnquotedValue(v))) return v;
  // El escape estándar de SQL: la comilla se dobla (O'Brien → 'O''Brien').
  if (opts.quote === 'single') return `'${v.replace(/'/g, "''")}'`;
  return `"${v.replace(/"/g, '""')}"`;
}

export interface SqlListResult {
  sql: string;
  count: number;
  /** Cuántos valores repetidos o vacíos se quitaron. */
  removed: number;
  groups: number;
}

export function toSqlList(text: string, separator: ListSeparator, opts: SqlListOptions): SqlListResult {
  const raw = splitValues(text, separator);
  const values = cleanValues(raw, opts);
  const joiner = opts.onePerLine ? ',\n' : opts.compact ? ',' : ', ';
  const quoted = values.map((v) => quoteValue(v, opts));
  const size = opts.chunkSize > 0 ? opts.chunkSize : quoted.length || 1;
  const chunks: string[][] = [];
  for (let i = 0; i < quoted.length; i += size) chunks.push(quoted.slice(i, i + size));
  const column = opts.column.trim();
  const wrap = (items: string[]) => {
    const body = opts.onePerLine ? `\n${items.map((q) => `  ${q}`).join(joiner)}\n` : items.join(joiner);
    if (column) return `${column} IN (${body})`;
    return opts.parentheses ? `(${body})` : body;
  };
  let sql: string;
  if (!chunks.length) sql = '';
  else if (!column) sql = chunks.map(wrap).join('\n\n'); // sin columna, cada grupo aparte
  else if (chunks.length === 1) sql = wrap(chunks[0]);
  else sql = `(${chunks.map(wrap).join(opts.onePerLine ? '\n  OR ' : ' OR ')})`;
  return { sql, count: values.length, removed: raw.length - values.length, groups: chunks.length };
}

// ── De SQL a lista ───────────────────────────────────────────────────

/** De `'a', 'b'`, `IN ('a','b')` o `col IN (1, 2) OR col IN (3)` a los
 *  valores, uno por elemento. Respeta las comillas dobladas (`''`) y las
 *  comas dentro de un valor entre comillas. */
export function fromSqlList(text: string): string[] {
  // Fuera lo que no son valores: lo de antes del primer `IN (` (`WHERE
  // col`), los `) OR col IN (` entre grupos y los paréntesis.
  const first = text.search(/\bIN\s*\(/i);
  const s = (first >= 0 ? text.slice(first) : text)
    .replace(/\)\s*(?:OR|AND)?\s*(?:[\w."[\]]+\s+)?(?:NOT\s+)?IN\s*\(/gi, ',')
    .replace(/^\s*IN\s*\(/i, ',');
  const out: string[] = [];
  let i = 0;
  let current = '';
  let hasValue = false;
  const push = () => {
    const v = hasValue ? current : current.trim();
    if (hasValue || v) out.push(v);
    current = '';
    hasValue = false;
  };
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'" || ch === '"') {
      const q = ch;
      let value = '';
      i++;
      while (i < s.length) {
        if (s[i] === q && s[i + 1] === q) {
          value += q;
          i += 2;
        } else if (s[i] === q) {
          i++;
          break;
        } else value += s[i++];
      }
      current = value;
      hasValue = true;
      continue;
    }
    if (ch === ',' || ch === '\n') {
      push();
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      i++;
      continue;
    }
    if (!hasValue) current += ch;
    i++;
  }
  push();
  return out;
}

/** Posición (desde 1) de una comilla que abre un valor y no se cierra, o
 *  `null`. Una comilla doblada (`''`) dentro del valor no lo cierra. */
export function findUnclosedQuote(text: string): number | null {
  let i = 0;
  while (i < text.length) {
    const q = text[i];
    if (q !== "'" && q !== '"') {
      i++;
      continue;
    }
    const start = i;
    i++;
    let closed = false;
    while (i < text.length) {
      if (text[i] === q && text[i + 1] === q) i += 2;
      else if (text[i] === q) {
        closed = true;
        i++;
        break;
      } else i++;
    }
    if (!closed) return start + 1;
  }
  return null;
}

// ── Comparar dos listas ──────────────────────────────────────────────

export interface ListComparison {
  onlyA: string[];
  onlyB: string[];
  both: string[];
  union: string[];
  /** Valores repetidos dentro de cada lista (una vez cada uno). */
  duplicatesA: string[];
  duplicatesB: string[];
  countA: number;
  countB: number;
}

export interface CompareOptions {
  trim: boolean;
  ignoreCase: boolean;
}

/** Conserva el orden de aparición y la forma en que se escribió cada valor
 *  la primera vez (en A si está en las dos). */
export function compareLists(a: string[], b: string[], opts: CompareOptions): ListComparison {
  const prep = (list: string[]) => cleanValues(list, { trim: opts.trim, skipEmpty: true, dedupe: false });
  const key = (v: string) => (opts.ignoreCase ? v.toLowerCase() : v);
  const index = (list: string[]) => {
    const first = new Map<string, string>();
    const dups = new Map<string, string>();
    for (const v of list) {
      const k = key(v);
      if (first.has(k)) dups.set(k, first.get(k)!);
      else first.set(k, v);
    }
    return { first, dups: [...dups.values()] };
  };
  const listA = prep(a);
  const listB = prep(b);
  const A = index(listA);
  const B = index(listB);
  const onlyA = [...A.first].filter(([k]) => !B.first.has(k)).map(([, v]) => v);
  const both = [...A.first].filter(([k]) => B.first.has(k)).map(([, v]) => v);
  const onlyB = [...B.first].filter(([k]) => !A.first.has(k)).map(([, v]) => v);
  return {
    onlyA,
    onlyB,
    both,
    union: [...A.first.values(), ...onlyB],
    duplicatesA: A.dups,
    duplicatesB: B.dups,
    countA: A.first.size,
    countB: B.first.size,
  };
}

/** Cuántas veces aparece cada valor repetido de una lista, con la forma de
 *  la primera vez, en el orden de aparición. Para "▸ 3 duplicados". */
export function duplicateCounts(list: string[], opts: CompareOptions): { value: string; times: number }[] {
  const counts = new Map<string, { value: string; times: number }>();
  for (const raw of list) {
    const v = opts.trim ? raw.trim() : raw;
    if (!v.trim()) continue;
    const k = opts.ignoreCase ? v.toLowerCase() : v;
    const entry = counts.get(k);
    if (entry) entry.times++;
    else counts.set(k, { value: v, times: 1 });
  }
  return [...counts.values()].filter((e) => e.times > 1);
}
