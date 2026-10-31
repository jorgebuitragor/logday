import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { blockIndexAt, inlineRunTarget } from './extensionBlockPos';
import { emitNoteBlockRun, subscribeNoteBlockRun, type NoteBlockRunEvent } from '../../extensions/noteBlockEvents';

// Un esquema mínimo con párrafos y bloques de código, como el de TipTap.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    codeBlock: { group: 'block', content: 'text*', code: true, attrs: { language: { default: null } } },
    text: {},
  },
});

const code = (language: string, text: string) => schema.node('codeBlock', { language }, text ? schema.text(text) : []);
const para = (text: string) => schema.node('paragraph', null, text ? schema.text(text) : []);
const doc = schema.node('doc', null, [
  para('hola'),
  code('http', 'GET https://a'),
  code('js', 'x()'),
  code('http', 'GET https://b\nAccept: */*'),
]);

// Posiciones de inicio de cada bloque de nivel superior.
const starts: number[] = [];
doc.forEach((_node, offset) => starts.push(offset));

const at = (pos: number) => EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
const isHttp = (language: string) => language === 'http';

describe('⌘↵ en un bloque inline (design A3.3)', () => {
  it('cuenta los bloques de cada lenguaje por separado', () => {
    expect(blockIndexAt(doc, starts[1], 'http')).toBe(0);
    expect(blockIndexAt(doc, starts[3], 'http')).toBe(1);
    expect(blockIndexAt(doc, starts[2], 'js')).toBe(0);
  });

  it('dentro de un bloque inline lo atiende, con el índice y el cursor', () => {
    // El cursor en el segundo bloque http, tras "GET https://b\nAc".
    const pos = starts[3] + 1 + 'GET https://b\nAc'.length;
    expect(inlineRunTarget(at(pos), isHttp)).toEqual({ language: 'http', index: 1, offset: 16, pos: starts[3] });
  });

  it('fuera de un bloque inline, no: en un párrafo o en otro lenguaje', () => {
    expect(inlineRunTarget(at(2), isHttp)).toBeNull();
    expect(inlineRunTarget(at(starts[2] + 2), isHttp)).toBeNull();
    // Con la extensión apagada ningún lenguaje es inline.
    expect(inlineRunTarget(at(starts[1] + 2), () => false)).toBeNull();
  });

  it('el bus reparte el evento a los oyentes y dice si alguien lo atendió', () => {
    const got: NoteBlockRunEvent[] = [];
    const event: NoteBlockRunEvent = { language: 'http', noteId: 'n1', index: 0, offset: 3, dom: null };
    expect(emitNoteBlockRun(event)).toBe(false);
    const off = subscribeNoteBlockRun((e) => got.push(e));
    expect(emitNoteBlockRun(event)).toBe(true);
    off();
    emitNoteBlockRun(event);
    expect(got).toEqual([event]);
  });
});
