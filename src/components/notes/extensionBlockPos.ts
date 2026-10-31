// Dónde está un bloque de extensión dentro del documento de TipTap: su
// índice entre los de su lenguaje y a qué bloque va un ⌘↵. Puro (solo
// ProseMirror), para probarlo sin editor ni DOM.
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';

export const languageOf = (node: PMNode) => (node.type.name === 'codeBlock' ? String(node.attrs.language ?? '') : '');

/** El n-ésimo bloque de `language` (desde 0) que empieza en `pos`. */
export function blockIndexAt(doc: PMNode, pos: number, language: string): number {
  let index = -1;
  doc.descendants((node, nodePos) => {
    if (nodePos > pos) return false;
    if (languageOf(node) === language) index += 1;
    return node.type.name !== 'codeBlock';
  });
  return index;
}

/** ⌘↵ dentro de un bloque inline (specs/cliente-http, design A3.3): a qué
 *  bloque va, o `null` si el cursor no está en uno. */
export function inlineRunTarget(
  state: EditorState,
  isInline: (language: string) => boolean,
): { language: string; index: number; offset: number; pos: number } | null {
  const { $from } = state.selection;
  const parent = $from.parent;
  if (parent.type.name !== 'codeBlock') return null;
  const language = languageOf(parent);
  if (!language || !isInline(language)) return null;
  const pos = $from.before();
  return { language, index: blockIndexAt(state.doc, pos, language), offset: $from.parentOffset, pos };
}

const codeBlockAt = (state: EditorState, pos: number) => {
  const node = state.doc.nodeAt(pos);
  return node && node.type.name === 'codeBlock' ? node : null;
};

/** Cambiar el lenguaje del bloque que empieza en `pos` desde su barra
 *  (`NoteBlockProps.setLanguage`, specs/extensiones R24): lo mismo que el
 *  selector de los bloques de código normales (`handleChangeCodeLanguage`
 *  del NoteEditor): `plaintext` o vacío quitan el lenguaje. Si el cursor
 *  estaba fuera del bloque, va al principio de su código, para que el foco
 *  no se pierda al desaparecer la barra. `null` si no hay nada que cambiar. */
export function setBlockLanguageTr(state: EditorState, pos: number, language: string): Transaction | null {
  const node = codeBlockAt(state, pos);
  if (!node) return null;
  const clean = language.trim().toLowerCase();
  const next = clean && clean !== 'plaintext' ? clean : null;
  if ((node.attrs.language ?? null) === next) return null;
  const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, language: next });
  const { from } = state.selection;
  if (from <= pos || from >= pos + node.nodeSize) tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  return tr;
}

/** El tramo que cambia de `prev` a `next`: lo que tienen en común al
 *  principio y al final se queda. `null` si son iguales. No parte un par
 *  sustituto (un emoji). */
export function changedRange(prev: string, next: string): { from: number; to: number; text: string } | null {
  if (prev === next) return null;
  const max = Math.min(prev.length, next.length);
  let start = 0;
  while (start < max && prev.charCodeAt(start) === next.charCodeAt(start)) start += 1;
  if (start > 0 && /[\uD800-\uDBFF]/.test(prev[start - 1])) start -= 1;
  let end = 0;
  while (end < max - start && prev.charCodeAt(prev.length - 1 - end) === next.charCodeAt(next.length - 1 - end)) end += 1;
  if (end > 0 && /[\uDC00-\uDFFF]/.test(prev[prev.length - end])) end -= 1;
  return { from: start, to: prev.length - end, text: next.slice(start, next.length - end) };
}

/** Reemplazar el texto del bloque que empieza en `pos`
 *  (`NoteBlockProps.setCode`). Solo cambia el tramo distinto, así el cursor
 *  se queda donde estaba (ProseMirror lo mapea) y Deshacer lo revierte en
 *  un paso. `null` si no hay nada que cambiar. */
export function setBlockCodeTr(state: EditorState, pos: number, code: string): Transaction | null {
  const node = codeBlockAt(state, pos);
  if (!node) return null;
  const range = changedRange(node.textContent, code);
  if (!range) return null;
  const from = pos + 1 + range.from;
  const to = pos + 1 + range.to;
  // `insertText('')` borraría el bloque entero si queda vacío
  // (`deleteRange` se extiende al nodo): para borrar, `delete`.
  return range.text ? state.tr.insertText(range.text, from, to) : state.tr.delete(from, to);
}

/** El texto de cada bloque de `language`, en orden
 *  (`NoteBlockProps.blockCodes`). */
export function blockCodesOf(doc: PMNode, language: string): string[] {
  const codes: string[] = [];
  doc.descendants((node) => {
    if (languageOf(node) === language) codes.push(node.textContent);
    return node.type.name !== 'codeBlock';
  });
  return codes;
}

/** Compactar el bloque que empieza en `pos` con el cursor dentro
 *  (`NoteBlockProps.setCompact`): el cursor pasa al primer texto después
 *  del bloque o, si no hay, al último antes; si tampoco, el bloque queda
 *  seleccionado entero. Sin tocar el texto, así Deshacer no lo ve. `null`
 *  si el cursor ya estaba fuera. */
export function selectionOutsideTr(state: EditorState, pos: number): Transaction | null {
  const node = codeBlockAt(state, pos);
  if (!node) return null;
  const end = pos + node.nodeSize;
  const { from, to } = state.selection;
  const inside = (p: number) => p > pos && p < end;
  if (!inside(from) && !inside(to)) return null;
  const outside = (sel: Selection | null) => (sel && !inside(sel.from) ? sel : null);
  const next = outside(Selection.findFrom(state.doc.resolve(end), 1, true))
    ?? outside(Selection.findFrom(state.doc.resolve(pos), -1, true))
    ?? NodeSelection.create(state.doc, pos);
  return state.tr.setSelection(next);
}

/** La selección está en el texto del bloque que empieza en `pos`. */
export function selectionInBlock(state: EditorState, pos: number): boolean {
  const { $from } = state.selection;
  return $from.parent.type.name === 'codeBlock' && $from.before() === pos;
}

/** Si un bloque compacto se expande porque el usuario puso el cursor
 *  dentro: solo con el foco en el editor (no en la barra) y por una
 *  transacción que mueve la selección o cambia el texto. Al abrir o
 *  cambiar de nota la selección de ProseMirror queda al principio del
 *  documento, dentro del bloque si la nota empieza por uno, y eso no es
 *  el usuario; tampoco las transacciones que solo llevan metadatos (el
 *  foco, el guardado). */
export function revealsCompact(state: EditorState, pos: number, focused: boolean, tr: Transaction): boolean {
  if (!focused || !selectionInBlock(state, pos)) return false;
  return tr.selectionSet || tr.docChanged;
}

/** Si el bloque puede arrancar compacto al montarse: no, si el usuario
 *  está escribiendo en él (un bloque recién creado, con el foco y el
 *  cursor dentro). Sin foco, la selección dentro no cuenta. */
export const canStartCompact = (state: EditorState, pos: number, focused: boolean) => !(focused && selectionInBlock(state, pos));
