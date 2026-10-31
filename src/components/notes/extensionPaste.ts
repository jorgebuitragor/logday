// Pegar en una nota un texto que es de una extensión (specs/extensiones R24,
// `convertPaste`): un comando cURL, con Cliente HTTP activa, pasa a ser un
// bloque ```http (specs/cliente-http HT39, design §13). Puro (solo
// ProseMirror), para probarlo sin editor ni DOM.
//
// Se hace en dos pasos, cada uno en su paso de Deshacer: primero se pega el
// texto tal cual y después se convierte. Así ⌘Z justo después deja el texto
// original pegado, y un segundo ⌘Z lo quita.
import { Fragment, Slice } from '@tiptap/pm/model';
import { AllSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import type { EditorView } from '@tiptap/pm/view';
import type { NotePasteConversion } from '../../extensions/types';
import { languageOf } from './extensionBlockPos';

export interface PasteConverter {
  /** El lenguaje del bloque de la extensión (`noteBlock.language`). */
  language: string;
  convert: (text: string) => NotePasteConversion | null;
}

export interface PastePlan {
  /** `block`: fuera de un bloque de código, se crea uno. `text`: dentro de
   *  un bloque de ese lenguaje, se pega el código convertido. */
  into: 'block' | 'text';
  language: string;
  conversion: NotePasteConversion;
}

/** Dónde se pega: `null` fuera de un bloque de código, su lenguaje (`''`
 *  sin lenguaje) dentro de uno, o `undefined` si la selección no es de
 *  texto (una imagen, celdas de una tabla) o sale del bloque: ahí no se
 *  convierte nada. */
export function pasteContext(state: EditorState): string | null | undefined {
  const sel = state.selection;
  if (sel instanceof AllSelection) return null;
  if (!(sel instanceof TextSelection)) return undefined;
  const { $from, $to } = sel;
  const fromCode = !!$from.parent.type.spec.code;
  const toCode = !!$to.parent.type.spec.code;
  if (!fromCode && !toCode) return null;
  if (!$from.sameParent($to)) return undefined;
  return languageOf($from.parent);
}

/** Qué hacer con el texto pegado. `null` (pegar como siempre) con "Pegar
 *  sin formato", si ninguna extensión lo reconoce o dentro de un bloque de
 *  código de otro lenguaje (bash, JSON…): ahí el texto va tal cual. Un
 *  error de la extensión no rompe el pegado (R15). */
export function planPaste(
  text: string,
  context: string | null | undefined,
  converters: readonly PasteConverter[],
  plain: boolean,
): PastePlan | null {
  if (plain || context === undefined || !text.trim()) return null;
  const candidates = context === null ? converters : converters.filter((c) => c.language === context);
  for (const c of candidates) {
    let conversion: NotePasteConversion | null = null;
    try {
      conversion = c.convert(text);
    } catch (err) {
      console.error(`[pegar ${c.language}]`, err);
    }
    if (conversion?.code) return { into: context === null ? 'block' : 'text', language: c.language, conversion };
  }
  return null;
}

const normalize = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');

/** Paso 1: el texto tal cual, como texto (un párrafo por línea) o, dentro
 *  de un bloque de código, como código. Devuelve dónde quedó. */
export function pasteRawTr(state: EditorState, text: string, inCode: boolean): { tr: Transaction; from: number; to: number } {
  const clean = normalize(text);
  const start = state.selection.from;
  let tr: Transaction;
  if (inCode) {
    tr = state.tr.insertText(clean);
  } else {
    const { schema } = state;
    const lines = clean.split('\n').map((line) => schema.nodes.paragraph.create(null, line ? schema.text(line) : null));
    tr = state.tr.replaceSelection(new Slice(Fragment.from(lines), 1, 1));
  }
  return { tr, from: tr.mapping.map(start, -1), to: tr.selection.from };
}

/** Paso 2: lo pegado entre `from` y `to` pasa a ser lo convertido, en otro
 *  paso de Deshacer (`closeHistory`). Fuera de un bloque, un bloque de
 *  código nuevo que ocupa los párrafos enteros si lo pegado los llenaba, y
 *  el cursor al final de su código. `null` si no se puede. */
export function convertPastedTr(state: EditorState, from: number, to: number, plan: PastePlan): Transaction | null {
  const { code } = plan.conversion;
  const { language } = plan;
  try {
    let tr: Transaction;
    if (plan.into === 'text') {
      tr = state.tr.insertText(code, from, to);
    } else {
      const { schema } = state;
      const node = schema.nodes.codeBlock.create({ language }, schema.text(code));
      const $from = state.doc.resolve(from);
      const $to = state.doc.resolve(to);
      // Si lo pegado empieza o acaba en el borde de su párrafo, el bloque
      // reemplaza el párrafo y no deja uno vacío delante o detrás.
      const start = $from.depth > 0 && $from.parentOffset === 0 ? $from.before() : from;
      const end = $to.depth > 0 && $to.parentOffset === $to.parent.content.size ? $to.after() : to;
      tr = state.tr.replaceWith(start, end, node);
      const lo = Math.max(0, tr.mapping.map(start, -1) - 1);
      const hi = Math.min(tr.doc.content.size, lo + node.nodeSize + 4);
      let blockPos = -1;
      tr.doc.nodesBetween(lo, hi, (n, pos) => {
        if (blockPos >= 0) return false;
        if (n.type.name === 'codeBlock' && languageOf(n) === language && n.textContent === code) {
          blockPos = pos;
          return false;
        }
        return true;
      });
      if (blockPos < 0) return null;
      tr.setSelection(TextSelection.create(tr.doc, blockPos + 1 + code.length));
    }
    return closeHistory(tr).scrollIntoView();
  } catch {
    return null;
  }
}

/** El pegado del editor de notas (`handlePaste`): `true` si lo atendió. */
export function handleExtensionPaste(
  view: EditorView,
  text: string,
  plain: boolean,
  converters: readonly PasteConverter[],
): boolean {
  const context = pasteContext(view.state);
  const plan = planPaste(text, context, converters, plain);
  if (!plan) return false;
  const raw = pasteRawTr(view.state, text, plan.into === 'text');
  view.dispatch(raw.tr);
  const converted = convertPastedTr(view.state, raw.from, raw.to, plan);
  // Si no se pudo convertir, queda el texto pegado: no se pierde nada.
  if (!converted) return true;
  view.dispatch(converted);
  try {
    plan.conversion.onInserted?.();
  } catch (err) {
    console.error(`[pegar ${plan.language}]`, err);
  }
  return true;
}
