import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExtensionBoundary, ExtensionErrorNotice } from './ExtensionBoundary';

// Sin DOM en las pruebas (no hay jsdom): react-dom/server no ejecuta los
// ErrorBoundary, así que se prueba el ciclo a mano, como lo hace React:
// getDerivedStateFromError → render del aviso, y componentDidCatch.
function Boom(): never {
  throw new Error('boom');
}

afterEach(() => vi.restoreAllMocks());

function boundary(onDisable = vi.fn(), children: ReactElement = <Boom />) {
  return new ExtensionBoundary({ id: 'team-chat', language: 'es', onDisable, children });
}

describe('ExtensionBoundary (R15)', () => {
  it('sin error, dibuja la extensión', () => {
    const b = boundary(vi.fn(), <p>hola</p>);
    expect(renderToStaticMarkup(<>{b.render()}</>)).toBe('<p>hola</p>');
  });

  it('un componente que lanza no tumba el árbol: queda el aviso con "Desactivar"', () => {
    const onDisable = vi.fn();
    const b = boundary(onDisable);
    // React llama a esto con el error que lanzó un hijo.
    b.state = ExtensionBoundary.getDerivedStateFromError(new Error('boom'));
    const out = b.render();

    // Lo que dibuja en lugar de la extensión es el aviso, no los hijos.
    expect(isValidElement(out)).toBe(true);
    const notice = out as ReactElement<{ onDisable: () => void }>;
    expect(notice.type).toBe(ExtensionErrorNotice);

    // El resto de la app sigue: el aviso se dibuja dentro del árbol.
    const html = renderToStaticMarkup(<main><nav>menú</nav>{out}</main>);
    expect(html).toContain('<nav>menú</nav>');
    expect(html).toContain('Esta extensión tuvo un error.');
    expect(html).toContain('Desactivar');

    // "Desactivar" desactiva la extensión.
    notice.props.onDisable();
    expect(onDisable).toHaveBeenCalledTimes(1);
  });

  it('un throw sin valor también se trata como error', () => {
    expect(ExtensionBoundary.getDerivedStateFromError(undefined).error).toBeInstanceOf(Error);
  });

  it('registra el error en la consola con el id de la extensión', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    boundary().componentDidCatch(err, { componentStack: '\n    at Boom' });
    expect(log).toHaveBeenCalledWith('[extensión team-chat]', err, '\n    at Boom');
  });

  it('el aviso está en inglés si la app lo está', () => {
    const html = renderToStaticMarkup(<ExtensionErrorNotice language="en" onDisable={() => {}} />);
    expect(html).toContain('This extension ran into an error.');
    expect(html).toContain('Turn off');
  });
});
