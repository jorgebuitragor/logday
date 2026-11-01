// Probar expresiones regulares (specs/devtools D5). `runRegex` es puro y
// lo corre `regexWorker.ts` en un worker: un patrón catastrófico como
// `(a+)+$` puede tardar minutos, y en el hilo principal congelaría la app.
import { fail, ok, type ToolResult } from './result';

export interface RegexMatch {
  index: number;
  end: number;
  text: string;
  /** Grupos por número (desde 1); `undefined` si el grupo no participó. */
  groups: (string | undefined)[];
  named: Record<string, string | undefined>;
}

export interface RegexRun {
  matches: RegexMatch[];
  /** Se cortó al llegar a `MAX_MATCHES`. */
  truncated: boolean;
}

export const MAX_MATCHES = 1000;
export const REGEX_FLAGS = ['g', 'i', 'm', 's', 'u', 'y'] as const;

export function runRegex(pattern: string, flags: string, text: string): ToolResult<RegexRun> {
  let re: RegExp;
  try {
    // Siempre con `g` por dentro para listar todas; la `g` del usuario
    // solo dice si se muestra una o todas.
    re = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
  } catch (e) {
    return fail('regex-invalid', { detail: (e as Error).message });
  }
  const all = flags.includes('g');
  const matches: RegexMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      text: m[0],
      groups: m.slice(1),
      named: { ...(m.groups ?? {}) },
    });
    if (!all || matches.length >= MAX_MATCHES) break;
    // Una coincidencia vacía no avanza `lastIndex`: sin esto, bucle infinito.
    if (m[0].length === 0) re.lastIndex += flags.includes('u') ? (text.codePointAt(re.lastIndex)! > 0xffff ? 2 : 1) : 1;
  }
  return ok({ matches, truncated: all && matches.length >= MAX_MATCHES });
}

export interface Segment {
  text: string;
  /** Índice de la coincidencia, o `null` si es texto sin coincidir. */
  match: number | null;
}

/** El texto partido en tramos con y sin coincidencia, para resaltarlo. */
export function segments(text: string, matches: RegexMatch[]): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.end === m.index) return; // las vacías no se resaltan
    if (m.index > pos) out.push({ text: text.slice(pos, m.index), match: null });
    out.push({ text: text.slice(m.index, m.end), match: i });
    pos = m.end;
  });
  if (pos < text.length) out.push({ text: text.slice(pos), match: null });
  return out;
}

/** El nombre de cada grupo de captura, en el orden en que JavaScript los
 *  numera (`null` si no tiene nombre). Salta escapes, clases `[…]`, grupos
 *  sin captura `(?:…)` y las aserciones `(?=…)`, `(?<=…)`. */
export function groupNames(pattern: string): (string | null)[] {
  const out: (string | null)[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      continue;
    }
    if (ch !== '(') continue;
    if (pattern[i + 1] !== '?') {
      out.push(null);
      continue;
    }
    const named = /^\?<([A-Za-z_$][\w$]*)>/.exec(pattern.slice(i + 1));
    if (named) out.push(named[1]);
  }
  return out;
}
