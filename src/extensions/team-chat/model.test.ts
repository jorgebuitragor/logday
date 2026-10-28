import { describe, expect, it } from 'vitest';
import { chatErrorMessage, readTeamChatSettings, toChatError, wasSentToday } from './model';

describe('configuración de team-chat', () => {
  it('lee la configuración guardada e ignora valores raros', () => {
    expect(readTeamChatSettings(undefined)).toEqual({});
    expect(readTeamChatSettings({ provider: 'discord', hint: '', last: { status: 'meh' } })).toEqual({});
    expect(readTeamChatSettings({
      provider: 'slack',
      hint: 'hooks.slack.com …XXXX',
      last: { sentAt: '2026-10-28T13:00:00.000Z', status: 'error', date: '2026-10-28', error: { code: 'provider_error', status: 500 } },
    })).toEqual({
      provider: 'slack',
      hint: 'hooks.slack.com …XXXX',
      last: { sentAt: '2026-10-28T13:00:00.000Z', status: 'error', date: '2026-10-28', error: { code: 'provider_error', status: 500 } },
    });
  });

  it('nunca guarda una URL: la configuración no tiene dónde ponerla (R11)', () => {
    const s = readTeamChatSettings({ provider: 'slack', hint: 'h', url: 'https://hooks.slack.com/services/T/B/X' });
    expect(JSON.stringify(s)).not.toContain('https://');
  });
});

describe('errores del envío', () => {
  it('normaliza lo que rechaza invoke', () => {
    expect(toChatError('host_not_allowed')).toEqual({ code: 'host_not_allowed' });
    expect(toChatError({ code: 'provider_error', status: 403 })).toEqual({ code: 'provider_error', status: 403 });
    expect(toChatError(new Error('x'))).toEqual({ code: 'unknown' });
  });

  it('muestra el código HTTP del proveedor (R18)', () => {
    expect(chatErrorMessage('es', { code: 'provider_error', status: 403 })).toBe('El chat respondió con un error (403)');
    expect(chatErrorMessage('en', { code: 'rate_limited' })).toContain('20 sends per hour');
    expect(chatErrorMessage('es', { code: 'algo_nuevo' })).toBe('Ocurrió un error inesperado.');
  });
});

describe('ya enviado hoy', () => {
  const ok = { sentAt: '2026-10-28T13:50:00.000Z', status: 'ok' as const, date: '2026-10-28' };

  it('pide confirmar si ese daily ya salió bien hoy', () => {
    expect(wasSentToday(ok, '2026-10-28', '2026-10-28')).toBe(true);
  });

  it('no pide confirmar para otro daily, otro día, un fallo o una prueba', () => {
    expect(wasSentToday(ok, '2026-10-27', '2026-10-28')).toBe(false);
    expect(wasSentToday(ok, '2026-10-28', '2026-10-29')).toBe(false);
    expect(wasSentToday({ ...ok, status: 'error' }, '2026-10-28', '2026-10-28')).toBe(false);
    expect(wasSentToday({ ...ok, test: true }, '2026-10-28', '2026-10-28')).toBe(false);
    expect(wasSentToday(undefined, '2026-10-28', '2026-10-28')).toBe(false);
  });

  it('usa la fecha local del envío, no la de UTC', () => {
    // 28 oct, 8 p. m. en Bogotá = 29 oct en UTC.
    const night = { ...ok, sentAt: '2026-10-29T01:00:00.000Z' };
    expect(wasSentToday(night, '2026-10-28', '2026-10-28')).toBe(true);
  });
});
