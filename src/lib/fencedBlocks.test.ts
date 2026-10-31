import { describe, expect, it } from 'vitest';
import { formatFence, parseFencedBlocks, stripFencedBlocks } from './fencedBlocks';

describe('bloques con cerca de un lenguaje (R24)', () => {
  const md = 'Texto\n\n```excalidraw\n{"a":1}\n```\n\n```js\nx()\n```\n\n```excalidraw\n{"b":2}\n```\n';

  it('encuentra solo los del lenguaje, en orden y con su posición', () => {
    const blocks = parseFencedBlocks(md, 'excalidraw');
    expect(blocks.map((b) => b.code)).toEqual(['{"a":1}', '{"b":2}']);
    expect(md.slice(blocks[0].start, blocks[0].end)).toBe('```excalidraw\n{"a":1}\n```');
    expect(parseFencedBlocks(md, 'excalidraw-x')).toEqual([]);
  });

  it('quita los bloques de esos lenguajes y deja el resto', () => {
    expect(stripFencedBlocks(md, ['excalidraw'])).toBe('Texto\n\n\n\n```js\nx()\n```\n\n\n');
    expect(stripFencedBlocks(md, [])).toBe(md);
  });

  it('formatea y vuelve a leer igual', () => {
    const fence = formatFence('excalidraw', '\n{"c":3}\n');
    expect(fence).toBe('```excalidraw\n{"c":3}\n```');
    expect(parseFencedBlocks(fence, 'excalidraw')[0].code).toBe('{"c":3}');
  });

  it('el lenguaje es exacto: ```http no toma ```https ni ```http-x (hallazgo 2)', () => {
    const text = '```https\nGET a\n```\n\n```http-x\nGET b\n```\n\n```http title\nGET c\n```\n\n```http\nGET d\n```';
    expect(parseFencedBlocks(text, 'http').map((b) => b.code)).toEqual(['GET c', 'GET d']);
    expect(parseFencedBlocks(text, 'https').map((b) => b.code)).toEqual(['GET a']);
  });

  it('acepta cercas de 4 comillas, con una línea ``` dentro', () => {
    const text = '````http\nPOST https://x\n\n```\ncuerpo\n```\n````\n\nfin';
    const [block] = parseFencedBlocks(text, 'http');
    expect(block.code).toBe('POST https://x\n\n```\ncuerpo\n```');
    expect(text.slice(block.start, block.end)).toBe(text.slice(0, text.indexOf('\n\nfin')));
  });

  it('un bloque vacío y uno sin cerrar', () => {
    expect(parseFencedBlocks('```http\n```', 'http').map((b) => b.code)).toEqual(['']);
    expect(parseFencedBlocks('```http\nGET x\n', 'http')).toEqual([]);
  });

  it('formatFence alarga la cerca si el contenido trae comillas invertidas', () => {
    const fence = formatFence('http', 'POST https://x\n\n```\nhola\n```');
    expect(fence.startsWith('````http\n')).toBe(true);
    expect(fence.endsWith('\n````')).toBe(true);
    expect(parseFencedBlocks(fence, 'http')[0].code).toBe('POST https://x\n\n```\nhola\n```');
  });
});
