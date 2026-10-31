// La semántica de los tiles de tema (specs/onboarding OB10, OB17): radios
// nativos en la bienvenida y en Opciones; el personalizado, un botón.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeTile } from './ThemeTile';

describe('ThemeTile', () => {
  it('con nombre, un radio nativo dentro de su etiqueta', () => {
    const html = renderToStaticMarkup(<ThemeTile name="theme" active label="Sepia" title="Tonos cálidos" onClick={() => {}} />);
    expect(html).toMatch(/^<label title="Tonos cálidos"/);
    expect(html).toContain('<input type="radio" class="sr-only" name="theme" checked=""/>');
    expect(html).not.toContain('<button');
  });

  it('sin nombre, un botón con aria-pressed; el de una acción, sin él', () => {
    expect(renderToStaticMarkup(<ThemeTile active={false} label="Mi tema" onClick={() => {}} />)).toContain('aria-pressed="false"');
    expect(renderToStaticMarkup(<ThemeTile active label="Mi tema" onClick={() => {}} />)).toContain('aria-pressed="true"');
    expect(renderToStaticMarkup(<ThemeTile action active={false} label="Crear" onClick={() => {}} />)).not.toContain('aria-pressed');
  });
});
