// Prueba de humo de la vista y del panel de Opciones: se dibujan (con
// react-dom/server, sin DOM) y muestran lo que toca. La interacción se
// revisa en la app de QA.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { toItem } from './model';
import { agentSkillsApi, useAgentSkills } from './store';
import { entry } from './testData';
import View from './View';
import Settings from './Settings';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => ({ skills: [], folders: [] })) }));

const app = vi.hoisted(() => ({
  language: 'es',
  extensions: { 'agent-skills': { enabled: true, settings: {} as Record<string, unknown> } },
  updateExtensionSettings: async () => {},
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select: (s: typeof app) => unknown) => select(app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});

// react-dom/server lee el estado inicial del store: aquí, el actual.
agentSkillsApi.getInitialState = agentSkillsApi.getState;

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const ITEMS = [
  toItem(entry({ dirName: 'logday', tools: ['claude', 'codex'] })),
  toItem(entry({
    dirName: 'riesgosa',
    skillMd: '---\nname: riesgosa\ndescription: Corre cosas\nhooks:\n  Stop: []\n---\nHoy: !`date`\n![logo](https://tracker.example/x.png)\n<script>alert(1)</script>\n',
    fileFlags: { scripts: true, binaries: false, symlinks: false, executables: false, truncated: false },
  })),
  toItem(entry({ dirName: 'pdf', origin: 'plugin', plugin: { name: 'documents', marketplace: 'openai-primary-runtime', version: '1' }, tools: ['codex'] })),
];

describe('vista de Skills de agentes', () => {
  beforeEach(() => {
    app.extensions['agent-skills'].settings = {};
    useAgentSkills.setState({ items: ITEMS, folders: [], loading: false, loaded: true, error: null, selectedKey: null });
  });

  it('lista por grupos, con insignias y el punto de riesgo', () => {
    const html = renderToStaticMarkup(<View />);
    const t = text(html);
    expect(t).toContain('Tuyas');
    expect(t).toContain('De plugins');
    expect(t).toContain('logday');
    expect(t).toContain('Claude Codex');
    expect(html).toContain('aria-label="Tiene avisos de seguridad"');
    expect(t).toContain('Elige una skill para ver qué trae.');
  });

  it('con filtros guardados, oculta lo que no toca', () => {
    app.extensions['agent-skills'].settings = { toolFilter: 'claude', showPlugins: false };
    const t = text(renderToStaticMarkup(<View />));
    expect(t).not.toContain('De plugins');
    expect(t).toContain('riesgosa');
  });

  it('el detalle avisa, no carga imágenes y no interpreta HTML', () => {
    useAgentSkills.setState({ selectedKey: 'claude:riesgosa' });
    const html = renderToStaticMarkup(<View />);
    const t = text(html);
    expect(t).toContain('Declara hooks');
    expect(t).toContain('Ejecuta comandos al invocarla');
    expect(t).toContain('Trae scripts');
    expect(t).toContain('Imagen sin cargar: logo');
    expect(html).not.toContain('tracker.example');
    expect(html).not.toContain('<script>');
  });

  it('una skill de plugin dice cómo se gestiona', () => {
    useAgentSkills.setState({ selectedKey: 'claude:pdf' });
    const t = text(renderToStaticMarkup(<View />));
    expect(t).toContain('Plugin documents@openai-primary-runtime');
    expect(t).toContain('Viene de un plugin de Codex');
  });

  it('sin skills', () => {
    useAgentSkills.setState({ items: [] });
    expect(text(renderToStaticMarkup(<View />))).toContain('No hay skills en las carpetas');
  });

  it('Opciones: carpetas que se revisan y si existen', () => {
    useAgentSkills.setState({
      folders: [
        { source: 'claude', path: '~/.claude/skills', exists: true },
        { source: 'agents', path: '~/.agents/skills', exists: false },
      ],
    });
    const t = text(renderToStaticMarkup(<Settings />));
    expect(t).toContain('~/.claude/skills');
    expect(t).toContain('~/.agents/skills · no existe');
    expect(t).toContain('Skills de plugins');
  });
});
