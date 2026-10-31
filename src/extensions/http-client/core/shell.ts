// Las palabras de un comando de sh, bash o zsh pegado, para `fromCurl`
// (curl.ts, specs/cliente-http HT39, design §13.1). Puro.

const NAME_AT = /[A-Za-z_][A-Za-z0-9_]*/y;
const CONTINUATION_AT = /[ \t]*\n/y;
const BRACED_NAME_AT = /\{([A-Za-z_][A-Za-z0-9_]*)\}/y;

/** `re` (con la bandera `y`) justo en `at`, sin copiar el texto: un
 *  cuerpo de Chrome puede tener cientos de KB. */
function matchAt(re: RegExp, s: string, at: number): RegExpExecArray | null {
  re.lastIndex = at;
  return re.exec(s);
}

/** Las palabras de un único comando, con las comillas, los escapes y las
 *  continuaciones resueltos como lo haría sh. `null` si no es un único
 *  comando simple: dos comandos (`;`, `&&`, `||`, otra línea), una tubería
 *  o una redirección, una sustitución (`$(…)`, comillas invertidas), una
 *  comilla sin cerrar o la sintaxis de `cmd.exe` (`^"`).
 *
 *  - Continuaciones: `\` al final de la línea (también con espacios
 *    detrás, que se cuelan al copiar), y `` ` `` (PowerShell) o `^`
 *    (cmd) al final de la línea.
 *  - `$NOMBRE` y `${NOMBRE}` fuera de comillas simples pasan a
 *    `{{NOMBRE}}`: una variable del shell es una variable del entorno.
 *  - Un `&` pegado a texto por los dos lados (una URL sin comillas) se
 *    toma como parte de la palabra. */
export function shellWords(input: string): string[] | null {
  const s = input.replace(/\r\n?/g, '\n');
  const n = s.length;
  const words: string[] = [];
  let word = '';
  let inWord = false;
  let i = 0;
  const push = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  // Lo que queda tras el final del comando: solo espacios y comentarios.
  const onlyTrailing = (from: number) => s.slice(from).split('\n').every((line) => /^\s*(#.*)?$/.test(line));
  // `$NOMBRE` o `${NOMBRE}` en `s[at]`: cuánto ocupa y el nombre. Tras
  // `{{` (p. ej. `{{$uuid}}` de Logday) el `$` es literal.
  const variableAt = (at: number): { length: number; name: string } | null => {
    if (word.endsWith('{{')) return null;
    if (s[at + 1] === '{') {
      const m = matchAt(BRACED_NAME_AT, s, at + 1);
      return m ? { length: m[0].length + 1, name: m[1] } : null;
    }
    const m = matchAt(NAME_AT, s, at + 1);
    return m ? { length: m[0].length + 1, name: m[0] } : null;
  };

  while (i < n) {
    const c = s[i];
    // Continuación de línea fuera de comillas.
    const cont = c === '\\' ? matchAt(CONTINUATION_AT, s, i + 1) : null;
    if (cont) {
      i += 1 + cont[0].length;
      continue;
    }
    if ((c === '`' || c === '^') && s[i + 1] === '\n' && !inWord) {
      i += 2;
      continue;
    }
    if (c === ' ' || c === '\t') {
      push();
      i += 1;
      continue;
    }
    if (c === '\n') {
      push();
      return onlyTrailing(i) ? words : null;
    }
    if (c === '#' && !inWord) {
      const end = s.indexOf('\n', i);
      return end < 0 || onlyTrailing(end) ? (push(), words) : null;
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      if (end < 0) return null;
      word += s.slice(i + 1, end);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (c === '$' && s[i + 1] === "'") {
      const r = ansiC(s, i + 2);
      if (!r) return null;
      word += r.text;
      inWord = true;
      i = r.end;
      continue;
    }
    if (c === '"' || (c === '$' && s[i + 1] === '"')) {
      i += c === '$' ? 2 : 1;
      inWord = true;
      let closed = false;
      while (i < n) {
        const d = s[i];
        if (d === '"') {
          closed = true;
          i += 1;
          break;
        }
        if (d === '\\' && i + 1 < n) {
          const e = s[i + 1];
          if (e === '\n') i += 2;
          else if ('$`"\\'.includes(e)) {
            word += e;
            i += 2;
          } else {
            word += d;
            i += 1;
          }
          continue;
        }
        if (d === '`' || (d === '$' && s[i + 1] === '(')) return null;
        if (d === '$') {
          const v = variableAt(i);
          if (v) {
            word += `{{${v.name}}}`;
            i += v.length;
            continue;
          }
        }
        word += d;
        i += 1;
      }
      if (!closed) return null;
      continue;
    }
    if (c === '\\') {
      if (i + 1 < n) word += s[i + 1];
      inWord = true;
      i += 2;
      continue;
    }
    if (c === '$') {
      if (s[i + 1] === '(') return null;
      const v = variableAt(i);
      word += v ? `{{${v.name}}}` : '$';
      inWord = true;
      i += v ? v.length : 1;
      continue;
    }
    if (c === '^' && s[i + 1] === '"') return null;
    if (c === '`') return null;
    if (c === ';') {
      push();
      return onlyTrailing(i + 1) ? words : null;
    }
    if (c === '&') {
      if (inWord && i + 1 < n && !/[\s&|;<>()]/.test(s[i + 1])) {
        word += c;
        i += 1;
        continue;
      }
      return null;
    }
    if ('|<>()'.includes(c)) return null;
    word += c;
    inWord = true;
    i += 1;
  }
  push();
  return words;
}

const HEX_AT: Record<number, RegExp> = { 2: /[0-9A-Fa-f]{1,2}/y, 4: /[0-9A-Fa-f]{1,4}/y, 8: /[0-9A-Fa-f]{1,8}/y };
const OCT_AT = /[0-7]{1,3}/y;

/** El contenido de `$'…'` desde `start` (tras la comilla) con sus escapes
 *  (los de bash; Chrome lo usa con `\'`, `\n` y `\uXXXX`). */
function ansiC(s: string, start: number): { text: string; end: number } | null {
  let out = '';
  let i = start;
  const SIMPLE: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };
  while (i < s.length) {
    const c = s[i];
    if (c === "'") return { text: out, end: i + 1 };
    if (c !== '\\' || i + 1 >= s.length) {
      out += c;
      i += 1;
      continue;
    }
    const e = s[i + 1];
    if (e in SIMPLE) {
      out += SIMPLE[e];
      i += 2;
      continue;
    }
    const hex = e === 'x' ? 2 : e === 'u' ? 4 : e === 'U' ? 8 : 0;
    if (hex) {
      const m = matchAt(HEX_AT[hex], s, i + 2);
      const code = m ? parseInt(m[0], 16) : NaN;
      if (m && code <= 0x10ffff) {
        out += String.fromCodePoint(code);
        i += 2 + m[0].length;
        continue;
      }
    }
    const oct = matchAt(OCT_AT, s, i + 1);
    if (oct) {
      out += String.fromCharCode(parseInt(oct[0], 8) & 0xff);
      i += 1 + oct[0].length;
      continue;
    }
    // Un escape que no existe queda tal cual, como en bash.
    out += c + e;
    i += 2;
  }
  return null;
}
