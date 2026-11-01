import { describe, expect, it, vi } from 'vitest';
import { Puzzle } from 'lucide-react';
import { createExtensionActions } from './actions';
import { withExtensionEnabled } from './state';
import type { ExtensionDefinition, ExtensionId, ExtensionsConfig } from './types';

const NOW = '2026-10-28T13:00:00.000Z';
const chat = {
  id: 'team-chat', category: 'integration', icon: Puzzle, apps: ['desktop'],
  sendsDataExternally: { to: 'Chat' }, load: async () => ({}),
} as ExtensionDefinition;
const tool = {
  id: 'agenda', category: 'tool', icon: Puzzle, apps: ['desktop'], load: async () => ({}),
} as unknown as ExtensionDefinition;

// Lo que hace useExtensions, con un store en memoria.
function setup(initial: ExtensionsConfig = {}) {
  let config = initial;
  const setEnabled = vi.fn(async (id: ExtensionId, enabled: boolean, consentAt?: string) => {
    config = withExtensionEnabled(config, id, enabled, consentAt);
  });
  const actions = createExtensionActions({
    getConfig: () => config,
    getDefinition: (id) => [chat, tool].find((d) => d.id === id),
    setEnabled,
    now: () => NOW,
  });
  return { actions, setEnabled, config: () => config, replace: (next: ExtensionsConfig) => { config = next; } };
}

describe('useExtensions: activar con aviso (R6)', () => {
  it('si envía datos fuera, la primera vez pide el aviso y no activa nada', async () => {
    const { actions, setEnabled, config } = setup();
    expect(await actions.requestEnable('team-chat')).toBe('needs-consent');
    expect(setEnabled).not.toHaveBeenCalled();
    expect(config()).toEqual({});
  });

  it('al aceptar el aviso guarda la fecha y activa', async () => {
    const { actions, config } = setup();
    await actions.acceptConsent('team-chat');
    expect(config()['team-chat']).toEqual({ enabled: true, consentAt: NOW });
  });

  it('con el aviso ya aceptado, activa sin preguntar', async () => {
    const { actions, config } = setup({ 'team-chat': { enabled: false, consentAt: NOW } });
    expect(await actions.requestEnable('team-chat')).toBe('enabled');
    expect(config()['team-chat']?.enabled).toBe(true);
  });

  it('una herramienta que no envía datos se activa directamente', async () => {
    const { actions, config } = setup();
    expect(await actions.requestEnable('agenda' as ExtensionId)).toBe('enabled');
    expect(config()['agenda' as ExtensionId]).toEqual({ enabled: true });
  });

  it('desactivar conserva el aviso aceptado (R7)', async () => {
    const { actions, config } = setup({ 'team-chat': { enabled: true, consentAt: NOW, settings: { a: 1 } } });
    await actions.disable('team-chat');
    expect(config()['team-chat']).toEqual({ enabled: false, consentAt: NOW, settings: { a: 1 } });
  });

  it('una extensión que no está en el registro no se activa (R4)', async () => {
    const { actions, setEnabled } = setup();
    expect(await actions.requestEnable('jira' as ExtensionId)).toBe('unknown');
    await actions.acceptConsent('jira' as ExtensionId);
    expect(setEnabled).not.toHaveBeenCalled();
  });
});

describe('desactivar desde su apartado de Opciones, con Deshacer (R28)', () => {
  const targets = () => ({ reopen: vi.fn(), needsConsent: vi.fn() });

  it('desactiva conservando la configuración y el aviso aceptado (R7)', async () => {
    const { actions, config } = setup({ 'team-chat': { enabled: true, consentAt: NOW, settings: { a: 1 } } });
    await actions.disableWithUndo('team-chat', targets());
    expect(config()['team-chat']).toEqual({ enabled: false, consentAt: NOW, settings: { a: 1 } });
  });

  it('Deshacer la reactiva sin volver a pedir el aviso y reabre su apartado', async () => {
    const { actions, setEnabled, config } = setup({ 'team-chat': { enabled: true, consentAt: NOW, settings: { a: 1 } } });
    const t = targets();
    const undo = await actions.disableWithUndo('team-chat', t);
    expect(await undo()).toBe('enabled');
    expect(config()['team-chat']).toEqual({ enabled: true, consentAt: NOW, settings: { a: 1 } });
    // Sin fecha nueva: el aviso aceptado se conserva tal cual.
    expect(setEnabled).toHaveBeenLastCalledWith('team-chat', true);
    expect(t.reopen).toHaveBeenCalledWith('team-chat');
    expect(t.needsConsent).not.toHaveBeenCalled();
  });

  it('si entretanto se quitó la configuración, Deshacer no salta el aviso (R6)', async () => {
    const { actions, config, replace } = setup({ 'team-chat': { enabled: true, consentAt: NOW } });
    const t = targets();
    const undo = await actions.disableWithUndo('team-chat', t);
    // Lo que deja "Quitar configuración" (R8): sin su entrada ni `consentAt`.
    replace({});
    expect(await undo()).toBe('needs-consent');
    expect(config()).toEqual({});
    expect(t.needsConsent).toHaveBeenCalledWith('team-chat');
    expect(t.reopen).not.toHaveBeenCalled();
  });
});
