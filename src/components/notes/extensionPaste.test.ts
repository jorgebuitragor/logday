import { describe, expect, it, vi } from 'vitest';
import { Schema, type Node as PMNode } from '@tiptap/pm/model';
import { AllSelection, EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { history, undo } from '@tiptap/pm/history';
import {
  convertPastedTr, handleExtensionPaste, pasteContext, pasteRawTr, planPaste, type PasteConverter, type PastePlan, type PasteView,
} from './extensionPaste';
import type { NotePasteConversion } from '../../extensions/types';
import { fromCurl } from '../../extensions/http-client/core/curl';

// Un esquema mínimo con párrafos, bloques de código e imágenes, como el de TipTap.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    codeBlock: { group: 'block', content: 'text*', code: true, marks: '', attrs: { language: { default: null } } },
    image: { group: 'block', atom: true },
    text: {},
  },
});

const para = (text: string) => schema.node('paragraph', null, text ? schema.text(text) : []);
const code = (language: string | null, text: string) => schema.node('codeBlock', { language }, text ? schema.text(text) : []);
const docOf = (...blocks: PMNode[]) => schema.node('doc', null, blocks);

const stateAt = (doc: PMNode, pos: number, to = pos) =>
  EditorState.create({ doc, selection: TextSelection.create(doc, pos, to), plugins: [history()] });

const CURL = "curl -H 'Authorization: Bearer abc' https://x.com/a";
const http: PasteConverter = { language: 'http', convert: (text) => (fromCurl(text) ? { code: fromCurl(text)!.code } : null) };

/** Los dos pasos del pegado, como los hace `handleExtensionPaste`. */
function paste(state: EditorState, text: string, plan: PastePlan) {
  const raw = pasteRawTr(state, text, plan.into === 'text');
  const pasted = state.apply(raw.tr);
  const tr = convertPastedTr(pasted, raw.from, raw.to, plan);
  expect(tr).not.toBeNull();
  return { pasted, converted: pasted.apply(tr!) };
}

const blocks = (doc: PMNode) => {
  const out: string[] = [];
  doc.forEach((n) => out.push(n.type.name === 'codeBlock' ? `code(${n.attrs.language ?? ''}):${n.textContent}` : `${n.type.name}:${n.textContent}`));
  return out;
};

describe('dónde se pega (pasteContext)', () => {
  const doc = docOf(para('hola'), code('http', 'GET https://a'), code('bash', 'ls'), schema.node('image'));
  const starts: number[] = [];
  doc.forEach((_n, offset) => starts.push(offset));

  it('fuera de un bloque, dentro de uno con su lenguaje, o nada', () => {
    expect(pasteContext(stateAt(doc, 2))).toBeNull();
    expect(pasteContext(stateAt(doc, starts[1] + 3))).toBe('http');
    expect(pasteContext(stateAt(doc, starts[2] + 1))).toBe('bash');
    // Una selección que sale del bloque, o una imagen seleccionada: nada.
    expect(pasteContext(stateAt(doc, 2, starts[1] + 3))).toBeUndefined();
    expect(pasteContext(EditorState.create({ doc, selection: NodeSelection.create(doc, starts[3]) }))).toBeUndefined();
    // ⌘A: todo el documento cuenta como fuera de un bloque.
    expect(pasteContext(EditorState.create({ doc, selection: new AllSelection(doc) }))).toBeNull();
  });
});

describe('qué se hace (planPaste)', () => {
  it('fuera de un bloque, un bloque http; dentro de uno http, el texto convertido', () => {
    expect(planPaste(CURL, null, [http], false)).toMatchObject({ into: 'block', language: 'http' });
    expect(planPaste(CURL, 'http', [http], false)).toMatchObject({ into: 'text', language: 'http' });
  });

  it('dentro de otro bloque de código, con la extensión apagada o sin formato: tal cual', () => {
    expect(planPaste(CURL, 'bash', [http], false)).toBeNull();
    expect(planPaste(CURL, '', [http], false)).toBeNull();
    // Extensión apagada (o sin cargar): no hay convertidores.
    expect(planPaste(CURL, null, [], false)).toBeNull();
    // ⇧⌘V.
    expect(planPaste(CURL, null, [http], true)).toBeNull();
    expect(planPaste(CURL, undefined, [http], false)).toBeNull();
  });

  it('un texto que no es un cURL, o un error de la extensión, pega como siempre', () => {
    expect(planPaste('hola mundo', null, [http], false)).toBeNull();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken: PasteConverter = { language: 'http', convert: () => { throw new Error('boom'); } };
    expect(planPaste(CURL, null, [broken], false)).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('las transacciones (dos pasos de Deshacer)', () => {
  const converted = fromCurl(CURL)!.code;
  const plan: PastePlan = { into: 'block', language: 'http', conversion: { code: converted } };

  it('en un párrafo vacío: el párrafo pasa a ser el bloque, con el cursor al final del código', () => {
    const doc = docOf(para('antes'), para(''), para('después'));
    const { converted: s } = paste(stateAt(doc, 8), CURL, plan);
    expect(blocks(s.doc)).toEqual(['paragraph:antes', `code(http):${converted}`, 'paragraph:después']);
    expect(s.selection.$from.parent.type.name).toBe('codeBlock');
    expect(s.selection.$from.parentOffset).toBe(converted.length);
    // El valor del token nunca llega al documento.
    expect(s.doc.textContent).not.toContain('abc');
  });

  it('⌘Z deja el texto original pegado; otro ⌘Z, la nota como estaba', () => {
    const doc = docOf(para(''));
    const multi = "curl 'https://x.com' \\\n  -H 'Accept: */*'\n";
    const { pasted, converted: s } = paste(stateAt(doc, 1), multi, { ...plan, conversion: { code: fromCurl(multi)!.code } });
    expect(blocks(pasted.doc)).toEqual(["paragraph:curl 'https://x.com' \\", "paragraph:  -H 'Accept: */*'"]);
    let after = s;
    expect(undo(after, (tr) => { after = after.apply(tr); })).toBe(true);
    expect(after.doc.eq(pasted.doc)).toBe(true);
    expect(undo(after, (tr) => { after = after.apply(tr); })).toBe(true);
    expect(after.doc.eq(doc)).toBe(true);
  });

  it('en medio de un párrafo: lo parte, sin perder el texto de alrededor', () => {
    const doc = docOf(para('ab'));
    const { converted: s } = paste(stateAt(doc, 2), CURL, plan);
    expect(blocks(s.doc)).toEqual(['paragraph:a', `code(http):${converted}`, 'paragraph:b']);
  });

  it('con texto seleccionado, lo reemplaza', () => {
    const doc = docOf(para('reemplázame'));
    const { converted: s } = paste(stateAt(doc, 1, 12), CURL, plan);
    expect(blocks(s.doc)).toEqual([`code(http):${converted}`]);
  });

  it('⌘A y pegar: la nota entera pasa a ser el bloque', () => {
    const doc = docOf(para('uno'), para('dos'));
    const state = EditorState.create({ doc, selection: new AllSelection(doc), plugins: [history()] });
    const { converted: s } = paste(state, CURL, plan);
    expect(blocks(s.doc)).toEqual([`code(http):${converted}`]);
  });

  it('dentro de un bloque http: el código convertido como texto, y ⌘Z deja el cURL', () => {
    const doc = docOf(code('http', ''));
    const textPlan: PastePlan = { into: 'text', language: 'http', conversion: { code: converted } };
    const { pasted, converted: s } = paste(stateAt(doc, 1), CURL, textPlan);
    expect(blocks(pasted.doc)).toEqual([`code(http):${CURL}`]);
    expect(blocks(s.doc)).toEqual([`code(http):${converted}`]);
    let after = s;
    undo(after, (tr) => { after = after.apply(tr); });
    expect(blocks(after.doc)).toEqual([`code(http):${CURL}`]);
  });
});

describe('preguntar antes de insertar (specs/cliente-http HT71)', () => {
  const variables = fromCurl(CURL)!.code;
  const keep = fromCurl(CURL, { keepValues: true })!.code;

  /** Una vista mínima: el estado, `dispatch` y `focus`. */
  function fakeView(state: EditorState) {
    const view = {
      state,
      dispatch(tr: Parameters<PasteView['dispatch']>[0]) {
        view.state = view.state.apply(tr);
      },
      focus: vi.fn(),
      isDestroyed: false,
    };
    return view;
  }

  /** Un conversor que pregunta, y la respuesta que dará. */
  function asking(answer: NotePasteConversion | null) {
    let resolve!: (a: NotePasteConversion | null) => void;
    const pending = new Promise<NotePasteConversion | null>((r) => {
      resolve = r;
    });
    const converter: PasteConverter = { language: 'http', convert: () => ({ code: variables, ask: () => pending }) };
    return { converter, answer: () => resolve(answer) };
  }

  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('mientras pregunta, la nota no cambia (el texto con el valor solo está en memoria)', async () => {
    const doc = docOf(para(''));
    const view = fakeView(stateAt(doc, 1));
    const ask = asking({ code: variables });
    expect(handleExtensionPaste(view, CURL, false, [ask.converter])).toBe(true);
    expect(view.state.doc.eq(doc)).toBe(true);
    expect(view.state.doc.textContent).not.toContain('abc');
    ask.answer();
    await settle();
    expect(blocks(view.state.doc)).toEqual([`code(http):${variables}`]);
    expect(view.focus).toHaveBeenCalled();
  });

  it('"Cambiar por variables" y "Dejar los valores": dos pasos de Deshacer, como siempre', async () => {
    for (const code of [variables, keep]) {
      const doc = docOf(para(''));
      const view = fakeView(stateAt(doc, 1));
      const ask = asking({ code });
      handleExtensionPaste(view, CURL, false, [ask.converter]);
      ask.answer();
      await settle();
      expect(blocks(view.state.doc)).toEqual([`code(http):${code}`]);
      let after = view.state;
      undo(after, (tr) => { after = after.apply(tr); });
      expect(blocks(after.doc)).toEqual([`paragraph:${CURL}`]);
      undo(after, (tr) => { after = after.apply(tr); });
      expect(after.doc.eq(doc)).toBe(true);
    }
  });

  it('Esc (null): el texto tal cual, sin convertir, en un solo paso', async () => {
    const doc = docOf(para(''));
    const view = fakeView(stateAt(doc, 1));
    const ask = asking(null);
    handleExtensionPaste(view, CURL, false, [ask.converter]);
    ask.answer();
    await settle();
    expect(blocks(view.state.doc)).toEqual([`paragraph:${CURL}`]);
    let after = view.state;
    undo(after, (tr) => { after = after.apply(tr); });
    expect(after.doc.eq(doc)).toBe(true);
  });

  it('si el editor se cerró mientras preguntaba, no hace nada', async () => {
    const doc = docOf(para(''));
    const view = fakeView(stateAt(doc, 1));
    const ask = asking({ code: variables });
    handleExtensionPaste(view, CURL, false, [ask.converter]);
    view.isDestroyed = true;
    ask.answer();
    await settle();
    expect(view.state.doc.eq(doc)).toBe(true);
  });
});
