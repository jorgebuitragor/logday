// La vista dividida de notas con HTML malicioso dentro del Markdown
// (specs/blindaje-seguridad BS4–BS7), dibujada con react-dom/server.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../lib/invoke', () => ({ fs: { openUrl: vi.fn(), readBinary: vi.fn() } }));
vi.mock('../../store/appStore', () => ({ useAppStore: { getState: () => ({ notes: [] }) } }));
vi.mock('./MermaidBlock', () => ({ MermaidBlock: () => null }));
vi.mock('../../lib/mermaid', () => ({ parseMermaidBlocks: () => [] }));

const { MarkdownPreview } = await import('./MarkdownPreview');
const render = (markdown: string) => renderToStaticMarkup(<MarkdownPreview markdown={markdown} />);

describe('MarkdownPreview: saneo del HTML de la nota', () => {
  it('quita el iframe con srcdoc (el XSS de la auditoría S-01)', () => {
    const html = render('Hola\n\n<iframe srcdoc="<script>parent.__TAURI_INTERNALS__.invoke(\'read_file\')</script>"></iframe>');
    expect(html).toContain('Hola');
    expect(html).not.toMatch(/iframe|srcdoc|script/i);
  });

  it('quita script, object, embed, form, base, meta, link y style', () => {
    const html = render([
      '<script>alert(1)</script>',
      '<object data="x"></object><embed src="x">',
      '<form action="https://x"><input name="a"></form>',
      '<base href="https://evil/"><meta http-equiv="refresh" content="0;url=https://evil">',
      '<link rel="stylesheet" href="https://evil/a.css"><style>body{display:none}</style>',
      '<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>',
    ].join('\n'));
    // React agrega un <link rel="preload"> propio por cada <img> al dibujar
    // en el servidor; el de la nota es el rel="stylesheet".
    expect(html).not.toMatch(/<(script|object|embed|form|base|meta|style|svg|foreignObject)\b/i);
    expect(html).not.toMatch(/rel="stylesheet"|evil|onerror|alert\(1\)|http-equiv/i);
  });

  it('quita manejadores de eventos y javascript: en enlaces', () => {
    const html = render('<a href="javascript:alert(1)" onclick="alert(2)">x</a> <img src="x" onerror="alert(3)">');
    expect(html).not.toMatch(/javascript:|onclick|onerror/i);
  });

  it('conserva el formato que guarda el editor', () => {
    const html = render('<span style="color: #ef4444">rojo</span> <mark style="background-color: #fde047">marca</mark> <u>sub</u>\n\n<div style="text-align: center">centro</div>');
    expect(html).toContain('<span style="color:#ef4444">rojo</span>');
    expect(html).toContain('<mark style="background-color:#fde047">marca</mark>');
    expect(html).toContain('<u>sub</u>');
    expect(html).toContain('style="text-align:center"');
  });

  it('deja en style solo color, fondo y alineación', () => {
    const html = render('<span style="position: fixed; inset: 0; color: red; background: url(https://evil/x.png)">x</span>');
    expect(html).toContain('style="color:red"');
    expect(html).not.toMatch(/position|inset|url\(/);
  });

  it('conserva imágenes, enlaces normales y tablas', () => {
    const html = render('![logo](https://ejemplo.com/logo.png)\n\n[sitio](https://ejemplo.com)\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('src="https://ejemplo.com/logo.png"');
    expect(html).toContain('href="https://ejemplo.com"');
    expect(html).toContain('<table>');
  });
});
