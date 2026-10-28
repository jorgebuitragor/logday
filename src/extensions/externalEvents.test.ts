import { beforeEach, describe, expect, it } from 'vitest';
import { groupByDate, useExternalEvents, type ExternalEvent } from './externalEvents';

const ev = (over: Partial<ExternalEvent>): ExternalEvent => ({ id: 'x', source: 'google-calendar', title: 'T', date: '2026-10-28', time: '', ...over });

describe('eventos externos (R22)', () => {
  beforeEach(() => useExternalEvents.setState({ range: null, bySource: {} }));

  it('agrupa por fecha, con los de todo el día primero', () => {
    const byDate = groupByDate({ 'google-calendar': [ev({ id: 'b', time: '09:00' }), ev({ id: 'a' }), ev({ id: 'c', date: '2026-10-29' })] });
    expect(byDate['2026-10-28'].map((e) => e.id)).toEqual(['a', 'b']);
    expect(byDate['2026-10-29'].map((e) => e.id)).toEqual(['c']);
  });

  it('cada fuente reemplaza y borra solo lo suyo', () => {
    const s = useExternalEvents.getState();
    s.setSource('google-calendar', [ev({ id: 'a' })]);
    s.setSource('google-calendar', [ev({ id: 'b' })]);
    expect(useExternalEvents.getState().bySource['google-calendar']?.map((e) => e.id)).toEqual(['b']);
    useExternalEvents.getState().clearSource('google-calendar');
    expect(useExternalEvents.getState().bySource).toEqual({});
  });

  it('el mismo rango no avisa otra vez', () => {
    const s = useExternalEvents.getState();
    s.setRange({ from: '2026-10-01', to: '2026-11-01' });
    const first = useExternalEvents.getState().range;
    s.setRange({ from: '2026-10-01', to: '2026-11-01' });
    expect(useExternalEvents.getState().range).toBe(first);
  });
});
