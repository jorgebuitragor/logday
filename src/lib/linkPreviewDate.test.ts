import { describe, expect, it } from 'vitest';
import { formatPreviewDate } from './linkPreviewDate';

// vitest.config.ts fija TZ=America/Bogota (UTC-5).

describe('formatPreviewDate', () => {
  it('no lanza con un instante (nota editada en Mobile) y muestra su día local', () => {
    // 27 oct, 8 p. m. en Bogotá. Antes: new Date(updated + 'T00:00:00') daba
    // Invalid Date y Intl.format lanzaba RangeError, que tumbaba la app.
    expect(() => formatPreviewDate('2026-10-28T01:00:00.000Z', 'es')).not.toThrow();
    expect(formatPreviewDate('2026-10-28T01:00:00.000Z', 'en')).toBe('Oct 27, 2026');
    expect(formatPreviewDate('2026-10-28T01:00:00.000Z', 'es')).toBe(formatPreviewDate('2026-10-27', 'es'));
  });

  it('muestra un YYYY-MM-DD legado como ese día', () => {
    expect(formatPreviewDate('2026-10-27', 'en')).toBe('Oct 27, 2026');
  });

  it('con un valor vacío o inválido no muestra fecha y no lanza', () => {
    expect(formatPreviewDate('', 'es')).toBeNull();
    expect(formatPreviewDate(undefined, 'es')).toBeNull();
    expect(formatPreviewDate('basura', 'es')).toBeNull();
    expect(formatPreviewDate('2026-10-27T99:00', 'es')).toBeNull();
  });
});
