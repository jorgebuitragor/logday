// Utilidades de color para el sistema de temas: conversión hex/HSL,
// contraste WCAG 2.1, y derivación de la paleta de acento de un tema
// personalizado a partir de un único color elegido por el usuario.
// Ver specs/temas-personalizacion/design.md §3.4 para el razonamiento.

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** h: 0-360, s/l: 0-100 */
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l * 100];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4; break;
  }
  h *= 60;

  return [h, s * 100, l * 100];
}

/** h: cualquier número (se normaliza mod 360), s/l: 0-100 */
export function hslToHex(h: number, s: number, l: number): string {
  const H = ((h % 360) + 360) % 360;
  const S = clamp(s, 0, 100) / 100;
  const L = clamp(l, 0, 100) / 100;

  if (S === 0) {
    const v = L * 255;
    return rgbToHex(v, v, v);
  }

  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const hueToRgb = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const r = hueToRgb(H / 360 + 1 / 3) * 255;
  const g = hueToRgb(H / 360) * 255;
  const b = hueToRgb(H / 360 - 1 / 3) * 255;
  return rgbToHex(r, g, b);
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function relativeLuminance(hex: string): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG 2.1 entre dos colores hex. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface AccentPalette {
  '--accent': string;
  '--accent-strong': string;
  '--accent-soft': string;
  '--accent-ink': string;
  '--accent-inline': string;
  '--accent-link': string;
  '--accent-code': string;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

// Fondos base reales de los temas dark/light (post-fix de contraste,
// ver specs/temas-consistencia-visual y specs/temas-personalizacion),
// usados solo para verificar contraste al derivar un tema personalizado.
const DARK_BG_BASE = '#121212';
const LIGHT_BG_BASE = '#f4f4f5';

/**
 * Deriva las 7 variables de acento de un tema a partir de un único color
 * elegido por el usuario, calibrado contra cómo se relacionan esas
 * variables entre sí en los temas predefinidos (dark/light/visual-rest).
 * `intensity` (0-100, default 50) controla la saturación del acento
 * resultante — 0 da un acento apagado/grisáceo, 100 uno muy vívido —
 * independiente de la saturación del color de entrada, para que el
 * control se sienta predecible sin importar qué color elija el usuario.
 */
export function deriveAccentPalette(hex: string, base: 'dark' | 'light', intensity = 50): AccentPalette {
  const [h, , l] = hexToHsl(hex);
  const t = clamp(intensity, 0, 100) / 100;

  if (base === 'dark') {
    const S = lerp(30, 90, t);
    const L = clamp(l, 58, 78);
    const accent = hslToHex(h, S, L);
    const strong = hslToHex(h, S, clamp(L - 9, 42, 100));
    const ink = hslToHex(h + 10, clamp(S, 55, 100), clamp(L + 16, 0, 92));
    const inline = hslToHex(h + 18, S, clamp(L + 12, 0, 88));
    const code = hslToHex(h + 22, S, clamp(L + 6, 0, 85));
    return {
      '--accent': accent,
      '--accent-strong': strong,
      '--accent-soft': hexToRgba(accent, 0.22),
      '--accent-ink': ink,
      '--accent-inline': inline,
      '--accent-link': accent,
      '--accent-code': code,
    };
  }

  // base === 'light'
  const S = lerp(40, 90, t);
  const L = clamp(l, 55, 68);
  const accent = hslToHex(h, S, L);

  let strongL = clamp(L - 8, 30, 100);
  let strong = hslToHex(h + 4, clamp(S - 9, 0, 100), strongL);
  // Ajuste iterativo: si el color elegido por el usuario es débil, el
  // delta fijo no siempre alcanza 4.5:1 contra el fondo claro — se sigue
  // oscureciendo hasta pasarlo (o hasta un piso razonable de luminosidad).
  while (contrastRatio(strong, LIGHT_BG_BASE) < 4.5 && strongL > 20) {
    strongL -= 4;
    strong = hslToHex(h + 4, clamp(S - 9, 0, 100), strongL);
  }

  const inline = hslToHex(h + 24, clamp(S - 14, 0, 100), clamp(L - 17, 20, 100));
  const code = hslToHex(h + 23, clamp(S - 1, 0, 100), clamp(L - 9, 20, 100));
  return {
    '--accent': accent,
    '--accent-strong': strong,
    '--accent-soft': hexToRgba(accent, 0.18),
    '--accent-ink': accent,
    '--accent-inline': inline,
    '--accent-link': strong,
    '--accent-code': code,
  };
}

// Escalas de referencia: los valores reales de los temas dark/light ya
// afinados (contraste verificado, ver specs/temas-consistencia-visual).
// Se reutiliza únicamente su luminosidad (L) por cada escalón, re-coloreada
// con el tono/saturación que el usuario elige para su tema personalizado —
// así un tema custom hereda la misma jerarquía de contraste probada, solo
// con un tinte distinto.
const DARK_BG_REF = ['#121212', '#141414', '#1c1c1c', '#242424', '#181818', '#161616', '#2a2a2a', '#333333', '#4a4a4a'];
const LIGHT_BG_REF = ['#f4f4f5', '#ffffff', '#f9f9fb', '#f0f0f2', '#ffffff', '#fafafa', '#e4e4e7', '#d4d4d8', '#a1a1aa'];
const DARK_TEXT_REF = ['#f2f2f2', '#e4e4e4', '#c8c8c8', '#aaaaaa', '#888888', '#848484', '#7e7e7e'];
const LIGHT_TEXT_REF = ['#09090b', '#18181b', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8'];

function scaleFromRef(ref: string[], h: number, s: number): string[] {
  return ref.map((hex) => hslToHex(h, s, hexToHsl(hex)[2]));
}

export interface BackgroundScale {
  '--bg-base': string;
  '--bg-panel': string;
  '--bg-surface': string;
  '--bg-secondary': string;
  '--bg-hover': string;
  '--bg-elevated': string;
  '--bg-input': string;
  '--border': string;
  '--border-card': string;
  '--border-high': string;
}

/** Deriva la escala de fondos/bordes (10 variables) a partir de un tinte. */
export function deriveBackgroundScale(bgTintHex: string, base: 'dark' | 'light'): BackgroundScale {
  const [h, s] = hexToHsl(bgTintHex);
  const S = clamp(s, 8, 20);
  const ref = base === 'dark' ? DARK_BG_REF : LIGHT_BG_REF;
  const [bgBase, bgPanel, bgSurface, bgHover, bgElevated, bgInput, border, borderCard, borderHigh] = scaleFromRef(ref, h, S);
  return {
    '--bg-base': bgBase,
    '--bg-panel': bgPanel,
    '--bg-surface': bgSurface,
    '--bg-secondary': bgSurface,
    '--bg-hover': bgHover,
    '--bg-elevated': bgElevated,
    '--bg-input': bgInput,
    '--border': border,
    '--border-card': borderCard,
    '--border-high': borderHigh,
  };
}

export interface TextScale {
  '--text-primary': string;
  '--text-body': string;
  '--text-secondary': string;
  '--text-tertiary': string;
  '--text-muted': string;
  '--text-hint': string;
  '--text-faint': string;
}

/**
 * Deriva la escala de texto (7 variables) a partir de un tinte, verificando
 * contraste ≥4.5:1 de cada escalón contra el `bgBaseHex` ya derivado —
 * si el tinte elegido produce un escalón ilegible, se ajusta su
 * luminosidad automáticamente (aclarando en tema oscuro, oscureciendo en
 * tema claro) hasta pasar el mínimo de WCAG AA.
 */
export function deriveTextScale(textTintHex: string, base: 'dark' | 'light', bgBaseHex: string): TextScale {
  const [h, rawS] = hexToHsl(textTintHex);
  const S = clamp(rawS * 0.6, 4, 16);
  const ref = base === 'dark' ? DARK_TEXT_REF : LIGHT_TEXT_REF;
  const direction = base === 'dark' ? 1 : -1;

  const hexes = ref.map((refHex) => {
    let l = hexToHsl(refHex)[2];
    let value = hslToHex(h, S, l);
    let guard = 0;
    while (contrastRatio(value, bgBaseHex) < 4.5 && guard < 30) {
      l = clamp(l + direction * 2, 0, 100);
      value = hslToHex(h, S, l);
      guard += 1;
    }
    return value;
  });

  const [primary, body, secondary, tertiary, muted, hint, faint] = hexes;
  return {
    '--text-primary': primary,
    '--text-body': body,
    '--text-secondary': secondary,
    '--text-tertiary': tertiary,
    '--text-muted': muted,
    '--text-hint': hint,
    '--text-faint': faint,
  };
}

export interface CustomThemeSeed {
  base: 'dark' | 'light';
  accent: string;
  bgTint: string;
  textTint: string;
  intensity: number;
}

/** Deriva las ~23 variables completas de un tema personalizado a partir de sus 3 colores semilla + intensidad. */
export function deriveCustomThemeVars(seed: CustomThemeSeed): Record<string, string> {
  const bg = deriveBackgroundScale(seed.bgTint, seed.base);
  const text = deriveTextScale(seed.textTint, seed.base, bg['--bg-base']);
  const accent = deriveAccentPalette(seed.accent, seed.base, seed.intensity);
  return { ...bg, ...text, ...accent };
}

// Exportado para posibles tests/depuración manual.
export const THEME_CONTRAST_BASES = { dark: DARK_BG_BASE, light: LIGHT_BG_BASE };
