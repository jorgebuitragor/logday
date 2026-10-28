import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDaysISO, daysBetweenISO, localISODate, localISOMonth } from './localDate';
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
