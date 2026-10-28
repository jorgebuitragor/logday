import { describe, expect, it } from 'vitest';
import { formatFence, parseFencedBlocks } from './fencedBlocks';

describe('bloques con cerca de un lenguaje (R24)', () => {
  const md = 'Texto\n\n```excalidraw\n{"a":1}\n```\n\n```js\nx()\n```\n\n```excalidraw\n{"b":2}\n```\n';

  it('encuentra solo los del lenguaje, en orden y con su posición', () => {
    const blocks = parseFencedBlocks(md, 'excalidraw');
    expect(blocks.map((b) => b.code)).toEqual(['{"a":1}', '{"b":2}']);
    expect(md.slice(blocks[0].start, blocks[0].end)).toBe('```excalidraw\n{"a":1}\n```');
    expect(parseFencedBlocks(md, 'excalidraw-x')).toEqual([]);
  });

  it('formatea y vuelve a leer igual', () => {
    const fence = formatFence('excalidraw', '\n{"c":3}\n');
    expect(fence).toBe('```excalidraw\n{"c":3}\n```');
    expect(parseFencedBlocks(fence, 'excalidraw')[0].code).toBe('{"c":3}');
  });
});
