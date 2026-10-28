import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDaysISO, daysBetweenISO, isDateOnly, localISODate, localISOMonth, nowInstant, parseStamp, stampSortKey, stampToLocalDate } from './localDate';
import { formatDate } from './markdown';

// vitest.config.ts fija TZ=America/Bogota (UTC-5).

afterEach(() => {
  vi.useRealTimers();
});

describe('localISODate', () => {
  it('a las 8 p. m. en Colombia sigue siendo hoy (en UTC ya es mañana)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T01:00:00Z')); // 27 oct, 8 p. m. en Bogotá
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-28');
    expect(localISODate()).toBe('2026-10-27');
    expect(formatDate(new Date())).toBe('2026-10-27');
  });

  it('el último día del mes, de noche, sigue siendo el mismo mes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T02:30:00Z')); // 31 oct, 9:30 p. m. en Bogotá
    expect(localISOMonth()).toBe('2026-10');
  });
});

describe('addDaysISO / daysBetweenISO', () => {
  it('suma días cruzando meses y años', () => {
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('cuenta días entre fechas', () => {
    expect(daysBetweenISO('2026-10-27', '2026-10-27')).toBe(0);
    expect(daysBetweenISO('2026-10-27', '2026-11-03')).toBe(7);
    expect(daysBetweenISO('2026-10-27', '2026-10-20')).toBe(-7);
  });
});

describe('marcas en dos formatos (instante o YYYY-MM-DD legado)', () => {
  // 27 oct 2026, 8 p. m. en Bogotá: en UTC ya es el 28.
  const NIGHT = '2026-10-28T01:00:00.000Z';

  it('nowInstant es el instante actual en formato toISOString', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NIGHT));
    expect(nowInstant()).toBe(NIGHT);
  });

  it('isDateOnly reconoce solo YYYY-MM-DD', () => {
    expect(isDateOnly('2026-10-27')).toBe(true);
    expect(isDateOnly(NIGHT)).toBe(false);
    expect(isDateOnly('2026-10-27 ')).toBe(false);
    expect(isDateOnly('27/10/2026')).toBe(false);
  });

  it('parseStamp lee un YYYY-MM-DD como la medianoche local de ese día', () => {
    const d = parseStamp('2026-10-27')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 27, 0]);
    // new Date('2026-10-27') sería la medianoche UTC: el 26 a las 7 p. m. aquí.
    expect(d.getTime()).not.toBe(new Date('2026-10-27').getTime());
  });

  it('parseStamp lee un instante como su Date', () => {
    expect(parseStamp(NIGHT)!.getTime()).toBe(Date.UTC(2026, 9, 28, 1));
  });

  it('parseStamp da null con vacío, inválido o una fecha que no existe', () => {
    expect(parseStamp('')).toBeNull();
    expect(parseStamp(null)).toBeNull();
    expect(parseStamp(undefined)).toBeNull();
    expect(parseStamp('no es fecha')).toBeNull();
    expect(parseStamp('2026-02-30')).toBeNull();
  });

  it('stampToLocalDate deja el YYYY-MM-DD igual y pasa el instante a su día local', () => {
    expect(stampToLocalDate('2026-10-27')).toBe('2026-10-27');
    expect(stampToLocalDate(NIGHT)).toBe('2026-10-27');
    expect(stampToLocalDate('2026-10-28T05:00:00.000Z')).toBe('2026-10-28'); // medianoche aquí
    expect(stampToLocalDate('')).toBe('');
    expect(stampToLocalDate(undefined)).toBe('');
    expect(stampToLocalDate('basura')).toBe('');
  });

  it('stampSortKey ordena formatos mezclados por el momento, no como string', () => {
    // Como string, "2026-10-27T…" > "2026-10-27" aunque fuera antes; y un
    // instante de la noche del 27 ("2026-10-28T01…") > "2026-10-28".
    expect(stampSortKey(NIGHT)).toBeLessThan(stampSortKey('2026-10-28'));
    expect(stampSortKey(NIGHT)).toBeGreaterThan(stampSortKey('2026-10-27'));
    expect(stampSortKey('')).toBe(0);
    expect(stampSortKey('basura')).toBe(0);
  });
});
