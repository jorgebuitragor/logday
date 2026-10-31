import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { blockIndexAt, changedRange, inlineRunTarget, setBlockCodeTr, setBlockLanguageTr } from './extensionBlockPos';
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

describe('acciones de la barra de un bloque inline (R24: setLanguage, setCode)', () => {
  const apply = (state: EditorState, tr: ReturnType<typeof setBlockCodeTr>) => (tr ? state.apply(tr) : state);

  it('setLanguage cambia solo el lenguaje de ese bloque y deja el cursor', () => {
    const cursor = starts[3] + 5;
    const state = at(cursor);
    const next = apply(state, setBlockLanguageTr(state, starts[3], 'JSON'));
    expect(next.doc.child(3).attrs.language).toBe('json');
    expect(next.doc.child(3).textContent).toBe('GET https://b\nAccept: */*');
    expect(next.doc.child(1).attrs.language).toBe('http');
    expect(next.selection.from).toBe(cursor);
  });

  it('setLanguage: Texto quita el lenguaje; con el cursor fuera, va al código del bloque', () => {
    const state = at(2);
    const next = apply(state, setBlockLanguageTr(state, starts[1], 'plaintext'));
    expect(next.doc.child(1).attrs.language).toBeNull();
    expect(next.selection.from).toBe(starts[1] + 1);
  });

  it('setLanguage: el mismo lenguaje o una posición que no es un bloque, nada', () => {
    const state = at(2);
    expect(setBlockLanguageTr(state, starts[1], 'http')).toBeNull();
    expect(setBlockLanguageTr(state, starts[0], 'json')).toBeNull();
  });

  it('changedRange: solo el tramo distinto', () => {
    expect(changedRange('GET https://a', 'POST https://a')).toEqual({ from: 0, to: 2, text: 'POS' });
    expect(changedRange('x\nGET https://a', 'x\nPUT https://a')).toEqual({ from: 2, to: 4, text: 'PU' });
    expect(changedRange('https://a', 'POST https://a')).toEqual({ from: 0, to: 0, text: 'POST ' });
    expect(changedRange('abc', '')).toEqual({ from: 0, to: 3, text: '' });
    expect(changedRange('igual', 'igual')).toBeNull();
    // No parte un emoji.
    expect(changedRange('a😀', 'a😃')).toEqual({ from: 1, to: 3, text: '😃' });
  });

  it('setCode reemplaza el texto del bloque y el cursor sigue en su sitio', () => {
    // El cursor al final de "GET https://b\nAccept".
    const cursor = starts[3] + 1 + 'GET https://b\nAccept'.length;
    const state = at(cursor);
    const next = apply(state, setBlockCodeTr(state, starts[3], 'DELETE https://b\nAccept: */*'));
    expect(next.doc.child(3).textContent).toBe('DELETE https://b\nAccept: */*');
    expect(next.doc.child(3).attrs.language).toBe('http');
    expect(next.selection.from).toBe(cursor + 'DELETE'.length - 'GET'.length);
    expect(next.doc.child(1).textContent).toBe('GET https://a');
  });

  it('setCode vacío deja el bloque, sin texto; el mismo texto, nada', () => {
    const state = at(2);
    const next = apply(state, setBlockCodeTr(state, starts[1], ''));
    expect(next.doc.childCount).toBe(4);
    expect(next.doc.child(1).type.name).toBe('codeBlock');
    expect(next.doc.child(1).textContent).toBe('');
    expect(setBlockCodeTr(state, starts[1], 'GET https://a')).toBeNull();
  });
});
