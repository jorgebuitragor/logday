// Comparar dos textos por líneas (specs/devtools D5). Usa fast-diff, que
// la app ya trae para el sync, con el truco de siempre: cada línea
// distinta se cambia por un carácter, se compara a nivel de caracteres y
// se vuelve a líneas.
import fastDiff from 'fast-diff';

export type DiffKind = 'same' | 'added' | 'removed';

export interface DiffLine {
  kind: DiffKind;
  text: string;
  /** Número de línea en el texto original (las quitadas y las iguales). */
  left?: number;
  /** Número de línea en el texto nuevo (las agregadas y las iguales). */
  right?: number;
}

export interface DiffOptions {
  ignoreWhitespace: boolean;
}

export function lineDiff(before: string, after: string, opts: DiffOptions = { ignoreWhitespace: false }): DiffLine[] {
  const key = (line: string) => (opts.ignoreWhitespace ? line.trim().replace(/\s+/g, ' ') : line);
  const codes = new Map<string, string>();
  const lines: string[] = [];
  const encode = (text: string) => {
    let out = '';
    for (const line of text.split('\n')) {
      const k = key(line);
      let code = codes.get(k);
      if (code === undefined) {
        // Una unidad UTF-16 por línea, saltando los sustitutos (fast-diff
        // podría partir un par): alcanza para ~63 000 líneas distintas,
        // más que el tope de entrada de la vista (MAX_INPUT_CHARS).
        const n = 0x100 + lines.length;
        code = String.fromCharCode(n >= 0xd800 ? n + 0x800 : n);
        codes.set(k, code);
        lines.push(line);
      }
      out += code;
    }
    return out;
  };
  const a = encode(before);
  const b = encode(after);
  const leftLines = before.split('\n');
  const rightLines = after.split('\n');
  const out: DiffLine[] = [];
  let left = 0;
  let right = 0;
  for (const [op, chunk] of fastDiff(a, b)) {
    const count = chunk.length;
    for (let i = 0; i < count; i++) {
      if (op === fastDiff.EQUAL) {
        // El texto de la derecha: si se ignoran espacios, el nuevo.
        out.push({ kind: 'same', text: rightLines[right], left: left + 1, right: right + 1 });
        left++;
        right++;
      } else if (op === fastDiff.DELETE) {
        out.push({ kind: 'removed', text: leftLines[left], left: left + 1 });
        left++;
      } else {
        out.push({ kind: 'added', text: rightLines[right], right: right + 1 });
        right++;
      }
    }
  }
  return out;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return lines.reduce(
    (acc, l) => ({ added: acc.added + (l.kind === 'added' ? 1 : 0), removed: acc.removed + (l.kind === 'removed' ? 1 : 0) }),
    { added: 0, removed: 0 },
  );
}
