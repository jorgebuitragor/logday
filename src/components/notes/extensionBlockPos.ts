// Dónde está un bloque de extensión dentro del documento de TipTap: su
// índice entre los de su lenguaje y a qué bloque va un ⌘↵. Puro (solo
// ProseMirror), para probarlo sin editor ni DOM.
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';

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
