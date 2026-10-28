import { describe, expect, it } from 'vitest';
import { Puzzle } from 'lucide-react';
import type { ExtensionDefinition, ExtensionsConfig } from './types';
import {
  enabledExtensions, extensionIdOfSection, isExtensionEnabled, needsConsent, parseExtensionsConfig,
  resolveSection, withExtensionEnabled, withExtensionSettings, withoutExtension,
} from './state';

// Un registro falso: una integración sin vista y una herramienta con vista.
const chat = {
  id: 'team-chat', category: 'integration', icon: Puzzle, apps: ['desktop'],
  sendsDataExternally: { to: 'Chat' }, load: async () => ({}),
} as ExtensionDefinition;
const agenda = {
  id: 'agenda', category: 'tool', icon: Puzzle, apps: ['desktop'], view: true, load: async () => ({}),
} as unknown as ExtensionDefinition;
const REGISTRY = [chat, agenda];

describe('activar y desactivar', () => {
  it('todas vienen apagadas en una instalación nueva (R3)', () => {
    expect(isExtensionEnabled({}, 'team-chat')).toBe(false);
    expect(enabledExtensions({}, REGISTRY)).toEqual([]);
  });

  it('desactivar conserva la configuración y el aviso (R7)', () => {
    let cfg: ExtensionsConfig = withExtensionEnabled({}, 'team-chat', true, '2026-10-28T13:00:00.000Z');
    cfg = withExtensionSettings(cfg, 'team-chat', { provider: 'slack' });
    cfg = withExtensionEnabled(cfg, 'team-chat', false);
    expect(cfg['team-chat']).toEqual({
      enabled: false, consentAt: '2026-10-28T13:00:00.000Z', settings: { provider: 'slack' },
    });
    // Al reactivarla sigue igual, sin pisar el aviso.
    cfg = withExtensionEnabled(cfg, 'team-chat', true);
    expect(cfg['team-chat']?.consentAt).toBe('2026-10-28T13:00:00.000Z');
    expect(cfg['team-chat']?.settings).toEqual({ provider: 'slack' });
  });

  it('solo cuenta las extensiones del registro', () => {
    const cfg = { 'team-chat': { enabled: true }, otra: { enabled: true } } as unknown as ExtensionsConfig;
    expect(enabledExtensions(cfg, REGISTRY).map((d) => d.id)).toEqual(['team-chat']);
  });

  it('pide el aviso solo si envía datos fuera y no se aceptó (R6)', () => {
    expect(needsConsent(chat, undefined)).toBe(true);
    expect(needsConsent(chat, { enabled: false })).toBe(true);
    expect(needsConsent(chat, { enabled: false, consentAt: '2026-10-28T13:00:00.000Z' })).toBe(false);
    expect(needsConsent(agenda, undefined)).toBe(false);
  });
});

describe('configuración', () => {
  it('mezcla y borra claves con undefined', () => {
    let cfg = withExtensionSettings({}, 'team-chat', { provider: 'slack', hint: 'h' });
    cfg = withExtensionSettings(cfg, 'team-chat', { hint: undefined, last: { status: 'ok' } });
    expect(cfg['team-chat']).toEqual({ enabled: false, settings: { provider: 'slack', last: { status: 'ok' } } });
  });

  it('"Quitar configuración" deja la extensión como recién instalada (R8)', () => {
    const cfg = withExtensionEnabled({}, 'team-chat', true, '2026-10-28T13:00:00.000Z');
    expect(withoutExtension(cfg, 'team-chat')).toEqual({});
  });

  it('lee config.json con datos raros sin romperse', () => {
    expect(parseExtensionsConfig(undefined)).toEqual({});
    expect(parseExtensionsConfig([])).toEqual({});
    expect(parseExtensionsConfig({
      'team-chat': { enabled: 'sí', consentAt: 5, settings: [] },
      futura: { enabled: true, settings: { a: 1 } },
      rota: null,
    })).toEqual({
      'team-chat': { enabled: false },
      // Un id que esta versión no conoce se conserva para no perderlo al guardar.
      futura: { enabled: true, settings: { a: 1 } },
    });
  });
});

describe('pantalla de inicio y secciones (R13)', () => {
  const on = { agenda: { enabled: true } } as unknown as ExtensionsConfig;

  it('las secciones fijas pasan tal cual', () => {
    expect(resolveSection('dailys', {}, REGISTRY)).toBe('dailys');
    expect(resolveSection('dashboard', {}, REGISTRY)).toBe('dashboard');
  });

  it('la vista de una extensión activa se respeta', () => {
    expect(resolveSection('ext:agenda', on, REGISTRY)).toBe('ext:agenda');
  });

  it('una extensión desactivada abre en Inicio', () => {
    expect(resolveSection('ext:agenda', {}, REGISTRY)).toBe('dashboard');
    expect(resolveSection('ext:agenda', { agenda: { enabled: false } } as unknown as ExtensionsConfig, REGISTRY)).toBe('dashboard');
  });

  it('una extensión que no existe en Desktop, o sin vista, abre en Inicio', () => {
    expect(resolveSection('ext:jira', { jira: { enabled: true } } as unknown as ExtensionsConfig, REGISTRY)).toBe('dashboard');
    expect(resolveSection('ext:team-chat', { 'team-chat': { enabled: true } }, REGISTRY)).toBe('dashboard');
  });

  it('reconoce las secciones de extensión', () => {
    expect(extensionIdOfSection('ext:team-chat')).toBe('team-chat');
    expect(extensionIdOfSection('notes')).toBeNull();
  });
});
