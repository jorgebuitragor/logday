// Prueba de humo de la vista y del panel de Opciones: se dibujan (con
// react-dom/server, sin DOM) y muestran lo que toca. La interacción se
// revisa en la app de QA.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { toItem } from './model';
import { agentSkillsApi, useAgentSkills } from './store';
import { entry } from './testData';
import View from './View';
import { skillActions } from './actions';
import { SkillContextMenu } from './SkillContextMenu';
import { makeTr } from './text';
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
    expect(t).toContain('Importar una carpeta');
    expect(t).toContain('O arrastra aquí una carpeta o un .zip');
    // La que tiene avisos aparece para revisarla.
    expect(t).toContain('Tuyas con avisos');
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
    const t = text(renderToStaticMarkup(<View />));
    expect(t).toContain('No hay skills en las carpetas');
    expect(t).toContain('Crear una skill');
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

  it('la skill elegida se distingue del hover', () => {
    useAgentSkills.setState({ selectedKey: ITEMS[0].key });
    const html = renderToStaticMarkup(<View />);
    const row = html.match(/<div[^>]*aria-selected="true"[^>]*>/)?.[0] ?? '';
    expect(row).toContain('bg-[var(--accent-soft)]');
    expect(row).toContain('aria-haspopup="menu"');
  });
});

describe('menú del clic derecho en una skill', () => {
  const tr = makeTr('es');
  const noop = () => {};
  const opts = { tr, language: 'es' as const, run: noop, onEdit: noop, onDelete: noop };

  it('una skill propia: editar, compartir, desactivar y borrar al final', () => {
    const own = toItem(entry({ dirName: 'logday' }));
    expect(skillActions(own, opts).map((a) => a.id)).toEqual(['edit', 'share', 'disable', 'delete']);
    expect(skillActions(own, opts).slice(-1)[0].danger).toBe(true);
  });

  it('una desactivada se puede activar; una de plugin no tiene acciones', () => {
    const off = toItem(entry({ dirName: 'vieja', origin: 'disabled', tools: ['claude', 'codex'] }));
    expect(skillActions(off, opts).map((a) => a.id)).toEqual(['edit', 'enable', 'delete']);
    expect(skillActions(toItem(entry({ dirName: 'pdf', origin: 'plugin', editable: false })), opts)).toEqual([]);
  });

  it('pinta las acciones, "Mostrar" y borrar aparte', () => {
    const own = toItem(entry({ dirName: 'logday' }));
    const html = renderToStaticMarkup(
      <SkillContextMenu anchor={{ x: 10, y: 10 }} name="logday" actions={skillActions(own, opts)} tr={tr} onReveal={noop} onClose={noop} />,
    );
    const t = text(html);
    expect(html).toContain('role="menu"');
    expect(html).toContain('aria-label="Acciones de logday"');
    expect(t).toMatch(/Editar .*Desactivar .*Mostrar .*Borrar/);
    expect(html.match(/role="separator"/g)?.length).toBe(2);
  });

  it('una de plugin solo ofrece mostrarla', () => {
    const html = renderToStaticMarkup(
      <SkillContextMenu anchor={{ x: 10, y: 10 }} name="pdf" actions={[]} tr={tr} onReveal={noop} onClose={noop} />,
    );
    expect(html.match(/role="menuitem"/g)?.length).toBe(1);
    expect(html).not.toContain('role="separator"');
  });
});
