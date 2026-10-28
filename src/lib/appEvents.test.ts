import { describe, expect, it, vi } from 'vitest';
import { emitAppEvent, onAppEvent } from './appEvents';

describe('eventos de la app (R23)', () => {
  it('llegan a los oyentes, y uno que falla no corta a los demás', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: string[] = [];
    const off1 = onAppEvent(() => { throw new Error('boom'); });
    const off2 = onAppEvent((e) => seen.push(e.type));
    emitAppEvent({ type: 'overtime.saved', entry: {} as never });
    expect(seen).toEqual(['overtime.saved']);
    off2();
    emitAppEvent({ type: 'overtime.saved', entry: {} as never });
    expect(seen).toEqual(['overtime.saved']);
    off1();
    errorSpy.mockRestore();
  });
});
