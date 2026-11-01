import { describe, expect, it } from 'vitest';
import { contrastRatio, deriveAccentPalette } from './themeColor';

// El repo no tiene los tipos de Node: `node:fs` se importa sin ellos.
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (path: URL, encoding: 'utf8') => string };

// El botón principal relleno (`--accent-solid` + `--accent-on`) tiene que
// leerse en todos los temas: los predefinidos lo fijan en App.css y los
// personalizados lo derivan del acento.
describe('botón principal con el acento del tema', () => {
  it('en los temas predefinidos, el texto contrasta al menos 4.5:1', () => {
    const css = readFileSync(new URL('../App.css', import.meta.url), 'utf8');
    const solids = [...css.matchAll(/--accent-solid:\s*(#[0-9a-f]{6});\s*\n\s*--accent-on:\s*(#[0-9a-f]{6});/gi)];
    expect(solids.length).toBe(7);
    for (const [, solid, on] of solids) {
      expect(contrastRatio(solid, on)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ['#22c55e', 'dark'],
    ['#facc15', 'dark'],
    ['#0ea5e9', 'light'],
    ['#7c3aed', 'light'],
    ['#f97316', 'dark'],
  ] as const)('en un tema personalizado (%s, %s), elige el texto que más contrasta', (hex, base) => {
    const p = deriveAccentPalette(hex, base);
    expect(p['--accent-solid']).toBe(p['--accent-strong']);
    const other = p['--accent-on'] === '#ffffff' ? '#111827' : '#ffffff';
    expect(contrastRatio(p['--accent-solid'], p['--accent-on'])).toBeGreaterThanOrEqual(
      contrastRatio(p['--accent-solid'], other),
    );
  });
});
