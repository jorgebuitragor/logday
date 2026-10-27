import type { EditorView } from '@tiptap/pm/view';
import type { Fragment, Node as PMNode, NodeType } from '@tiptap/pm/model';

// Arrastre de bloques en el editor de notas.
//
// El handle del margen movía solo bloques de primer nivel del documento,
// y una lista entera es un único bloque: no había forma de mover un ítem.
// Ahora la unidad que se arrastra puede ser un bloque de primer nivel o
// un ítem de lista (viñeta, número o casilla). Un ítem se puede soltar
// dentro de su lista, en otra lista (se convierte al tipo de esa lista)
// o entre bloques, donde queda como su contenido (un párrafo).

const LIST_ITEM_TYPES = new Set(['listItem', 'taskItem']);

export type DragUnit =
  | { kind: 'block'; index: number; el: HTMLElement }
  | { kind: 'item'; pos: number; el: HTMLElement };

export type DropTarget =
  | { kind: 'block'; index: number; line: DropLine }
  | { kind: 'item'; pos: number; itemType: NodeType; line: DropLine };

/** Línea de destino, en coordenadas de cliente. */
export interface DropLine {
  y: number;
  left: number;
  right: number;
}

function topLevelElement(root: HTMLElement, el: Element | null): HTMLElement | null {
  let node = el as HTMLElement | null;
  while (node && node.parentElement !== root) node = node.parentElement;
  return node && node.parentElement === root ? node : null;
}

function listItemElement(root: HTMLElement, el: Element | null): HTMLElement | null {
  const li = el?.closest('li');
  return li && root.contains(li) ? (li as HTMLElement) : null;
}

/** Posición (justo antes) del nodo de ítem de lista que dibuja `li`. */
function itemPosFromElement(view: EditorView, li: HTMLElement): number | null {
  try {
    const $pos = view.state.doc.resolve(view.posAtDOM(li, 0));
    for (let d = $pos.depth; d > 0; d -= 1) {
      if (LIST_ITEM_TYPES.has($pos.node(d).type.name)) return $pos.before(d);
    }
  } catch {
    return null;
  }
  return null;
}

export function topLevelPosAtIndex(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return pos;
}

function topLevelIndexOf(view: EditorView, el: HTMLElement): number {
  const raw = view.posAtDOM(el, 0);
  const doc = view.state.doc;
  return doc.resolve(Math.max(0, Math.min(raw, doc.content.size))).index(0);
}

/** Qué se arrastraría desde este punto: el ítem de lista más interno, o
 *  el bloque de primer nivel. `probeOffsetX` permite detectar desde el
 *  margen izquierdo, donde está el handle. */
export function dragUnitAtCoords(view: EditorView, clientX: number, clientY: number, probeOffsetX = 0): DragUnit | null {
  const root = view.dom as HTMLElement;
  for (const el of document.elementsFromPoint(clientX + probeOffsetX, clientY)) {
    const li = listItemElement(root, el);
    if (li) {
      const pos = itemPosFromElement(view, li);
      if (pos !== null) return { kind: 'item', pos, el: li };
    }
    const block = topLevelElement(root, el);
    if (block) return { kind: 'block', index: topLevelIndexOf(view, block), el: block };
  }
  return null;
}

function blockGapTarget(view: EditorView, block: HTMLElement, clientY: number): DropTarget {
  const index = topLevelIndexOf(view, block);
  const rect = block.getBoundingClientRect();
  const before = clientY < rect.top + rect.height / 2;
  const rootRect = (view.dom as HTMLElement).getBoundingClientRect();
  return {
    kind: 'block',
    index: before ? index : index + 1,
    line: { y: before ? rect.top : rect.bottom, left: rootRect.left, right: rootRect.right },
  };
}

/** Dónde caería `unit` si se suelta en este punto. */
export function dropTargetAtCoords(view: EditorView, unit: DragUnit, clientX: number, clientY: number): DropTarget | null {
  const root = view.dom as HTMLElement;
  for (const el of document.elementsFromPoint(clientX + 40, clientY)) {
    if (unit.kind === 'item') {
      const li = listItemElement(root, el);
      if (li && !unit.el.contains(li)) {
        const pos = itemPosFromElement(view, li);
        if (pos === null) continue;
        const node = view.state.doc.nodeAt(pos);
        if (!node) continue;
        const rect = li.getBoundingClientRect();
        // Un ítem con sububítems: el medio se mide sobre su primera línea,
        // no sobre todo el bloque con la lista anidada.
        const firstChild = li.querySelector(':scope > p, :scope > div > p, :scope > label + div') as HTMLElement | null;
        const head = firstChild?.getBoundingClientRect() ?? rect;
        const before = clientY < head.top + head.height / 2;
        return {
          kind: 'item',
          pos: before ? pos : pos + node.nodeSize,
          itemType: node.type,
          line: { y: before ? rect.top : rect.bottom, left: rect.left, right: rect.right },
        };
      }
      if (li && unit.el.contains(li)) return null; // sobre sí mismo
    }
    const block = topLevelElement(root, el);
    if (block) return blockGapTarget(view, block, clientY);
  }
  return null;
}

/** Mueve un bloque de primer nivel. Devuelve false si no hubo cambio. */
export function moveTopLevelBlock(view: EditorView, sourceIndex: number, targetIndex: number): boolean {
  let insertionIndex = targetIndex;
  if (insertionIndex > sourceIndex) insertionIndex -= 1;
  if (insertionIndex === sourceIndex) return false;

  const doc = view.state.doc;
  const sourceNode = doc.child(sourceIndex);
  const from = topLevelPosAtIndex(doc, sourceIndex);
  let tr = view.state.tr.delete(from, from + sourceNode.nodeSize);
  const clamped = Math.max(0, Math.min(insertionIndex, tr.doc.childCount));
  tr = tr.insert(topLevelPosAtIndex(tr.doc, clamped), sourceNode);
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** Convierte un ítem al tipo de la lista destino (viñeta/número ↔ casilla). */
function itemAs(node: PMNode, type: NodeType): PMNode | null {
  if (node.type === type) return node;
  try {
    const attrs = type.name === 'taskItem' ? { checked: false } : null;
    const converted = type.createChecked(attrs, node.content);
    return converted;
  } catch {
    return null;
  }
}

/** Mueve un ítem de lista. Devuelve false si no hubo cambio o no se pudo. */
export function moveListItem(view: EditorView, sourcePos: number, target: DropTarget): boolean {
  const { state } = view;
  const source = state.doc.nodeAt(sourcePos);
  if (!source || !LIST_ITEM_TYPES.has(source.type.name)) return false;
  const sourceEnd = sourcePos + source.nodeSize;

  const insertAt = target.kind === 'item' ? target.pos : topLevelPosAtIndex(state.doc, target.index);
  // Soltarlo justo donde está no cambia nada.
  if (insertAt === sourcePos || insertAt === sourceEnd) return false;

  // Si era el único ítem, se va la lista entera (no dejar una lista vacía).
  const $source = state.doc.resolve(sourcePos);
  const onlyChild = $source.parent.childCount === 1;
  const deleteFrom = onlyChild ? $source.before($source.depth) : sourcePos;
  const deleteTo = onlyChild ? $source.after($source.depth) : sourceEnd;
  // No se puede soltar dentro de sí mismo (en una sublista suya).
  if (insertAt > deleteFrom && insertAt < deleteTo) return false;

  let content: PMNode | Fragment | null;
  if (target.kind === 'item') content = itemAs(source, target.itemType);
  else content = source.content; // entre bloques: queda como párrafo(s)
  if (!content) return false;

  const tr = state.tr.delete(deleteFrom, deleteTo);
  tr.insert(tr.mapping.map(insertAt), content);
  view.dispatch(tr.scrollIntoView());
  return true;
}

