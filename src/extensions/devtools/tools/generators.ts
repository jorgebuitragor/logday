// Generadores: UUID, contraseñas y lorem ipsum (specs/devtools D3). Todo
// lo aleatorio sale de `crypto.getRandomValues`, nunca de `Math.random`.

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const formatUuid = (bytes: Uint8Array) => {
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export function uuidV4(): string {
  return crypto.randomUUID();
}

/** UUID v7 (RFC 9562): los primeros 48 bits son los milisegundos Unix,
 *  así que se ordenan por fecha de creación. */
export function uuidV7(now: number = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ms = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

/** Un entero uniforme en [0, max), sin el sesgo del módulo. */
function randomBelow(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  /** Sin 0/O, 1/l/I: para dictarla o copiarla a mano. */
  avoidAmbiguous: boolean;
}

export const PASSWORD_LIMITS = { min: 4, max: 128 } as const;

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/',
} as const;
const AMBIGUOUS = /[0O1lI]/g;

/** Al menos un carácter de cada juego elegido. `null` si no hay ninguno. */
export function generatePassword(opts: PasswordOptions): string | null {
  const length = Math.min(PASSWORD_LIMITS.max, Math.max(PASSWORD_LIMITS.min, Math.round(opts.length)));
  const sets = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => opts[k])
    .map((k) => (opts.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]));
  if (!sets.length) return null;
  const all = sets.join('');
  const chars = sets.map((s) => s[randomBelow(s.length)]);
  while (chars.length < length) chars.push(all[randomBelow(all.length)]);
  // Fisher-Yates: que los obligatorios no queden siempre al principio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Bits de entropía aproximados, para la etiqueta de fortaleza. */
export function passwordEntropy(opts: PasswordOptions): number {
  const pool = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => opts[k])
    .reduce((n, k) => n + (opts.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]).length, 0);
  return pool ? Math.round(opts.length * Math.log2(pool)) : 0;
}

// ── Lorem ipsum ──────────────────────────────────────────────────────

const WORDS = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et ' +
  'dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea ' +
  'commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur ' +
  'excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum ' +
  'praesent elementum facilisis leo vel fringilla morbi tristique senectus netus malesuada fames ac turpis ' +
  'egestas integer feugiat scelerisque varius vitae purus faucibus ornare suspendisse sed nisi lacus'
).split(' ');

export type LoremUnit = 'paragraphs' | 'sentences' | 'words';
export const LOREM_LIMITS = { min: 1, max: 100 } as const;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const randomWords = (n: number) => Array.from({ length: n }, () => WORDS[randomBelow(WORDS.length)]);
const sentence = () => `${capitalize(randomWords(6 + randomBelow(9)).join(' '))}.`;
const paragraph = () => Array.from({ length: 3 + randomBelow(4) }, sentence).join(' ');

/** Empieza por "Lorem ipsum dolor sit amet", como se espera, salvo que
 *  `classic` sea `false`. */
export function lorem(unit: LoremUnit, count: number, classic = true): string {
  const n = Math.min(LOREM_LIMITS.max, Math.max(LOREM_LIMITS.min, Math.round(count)));
  const opening = 'Lorem ipsum dolor sit amet';
  if (!classic) {
    if (unit === 'words') return capitalize(randomWords(n).join(' '));
    if (unit === 'sentences') return Array.from({ length: n }, sentence).join(' ');
    return Array.from({ length: n }, paragraph).join('\n\n');
  }
  if (unit === 'words') {
    const words = [...opening.toLowerCase().split(' '), ...randomWords(Math.max(0, n - 5))].slice(0, n);
    return capitalize(words.join(' '));
  }
  if (unit === 'sentences') {
    const list = Array.from({ length: n }, sentence);
    list[0] = `${opening}, ${list[0].charAt(0).toLowerCase()}${list[0].slice(1)}`;
    return list.join(' ');
  }
  const list = Array.from({ length: n }, paragraph);
  list[0] = `${opening}, ${list[0].charAt(0).toLowerCase()}${list[0].slice(1)}`;
  return list.join('\n\n');
}
