import { useEffect, useState, type MutableRefObject } from 'react';
import CodeBlockLowlight, { type CodeBlockLowlightOptions } from '@tiptap/extension-code-block-lowlight';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { MermaidBlock } from './MermaidBlock';
import { ExtensionSlot } from '../../extensions/ExtensionSlot';
import type { ExtensionId } from '../../extensions/types';
import { emitNoteBlockRun } from '../../extensions/noteBlockEvents';
import { blockIndexAt, inlineRunTarget, languageOf, setBlockCodeTr, setBlockLanguageTr } from './extensionBlockPos';

// Bloques de código con lenguaje `mermaid`, dibujados dentro del documento.
//
// Antes el diagrama era una capa con posición absoluta sobre un <pre>
// vacío al que se le fijaba la altura a mano, y las posiciones se
// recalculaban solo en algunos eventos: cuando otro bloque cambiaba de
// alto (una imagen que carga, texto que se agrega arriba), la capa quedaba
// desfasada y tapaba el contenido. Como NodeView, el diagrama ocupa su
// espacio real en el flujo del documento y no puede solaparse.
//
// Los demás bloques de código se dibujan igual que antes (<pre><code>),
// sin React.

export interface MermaidActions {
  edit: (index: number) => void;
  moveUp: (index: number) => void;
  moveDown: (index: number) => void;
  duplicate: (index: number) => void;
  remove: (index: number) => void;
}

/** Bloques propios de las extensiones activas (R24 de specs/extensiones):
 *  qué extensión dibuja cada lenguaje y cómo abrir su editor. */
export interface ExtensionBlocks {
  byLanguage: Record<string, ExtensionId>;
  /** Lenguajes de los bloques en modo inline (`noteBlock.inline`): el
   *  código se edita en la nota y la extensión pone barra y franja. */
  inline: Record<string, boolean>;
  /** La nota abierta, para que el bloque sepa de cuál es. */
  noteId?: string;
  /** `index`: el n-ésimo bloque de ese lenguaje en el documento. */
  edit: (language: string, index: number) => void;
}

interface Options extends CodeBlockLowlightOptions {
  /** Acciones del NoteEditor, por índice de diagrama en el documento (el
   *  mismo orden que parseMermaidBlocks sobre el markdown). Es un ref para
   *  leer siempre las versiones actuales de los handlers. */
  mermaidActions: MutableRefObject<MermaidActions | null>;
  extensionBlocks: MutableRefObject<ExtensionBlocks | null>;
}

const isMermaid = (node: PMNode) => node.type.name === 'codeBlock' && node.attrs.language === 'mermaid';

function mermaidIndexAt(doc: PMNode, pos: number): number {
  let index = -1;
  doc.descendants((node, nodePos) => {
    if (nodePos > pos) return false;
    if (isMermaid(node)) index += 1;
    return !isMermaid(node);
  });
  return index;
}

function mermaidCount(doc: PMNode): number {
  let count = 0;
  doc.descendants((node) => {
    if (isMermaid(node)) count += 1;
    return !isMermaid(node);
  });
  return count;
}

const posOf = (getPos: NodeViewProps['getPos']) => (typeof getPos === 'function' ? getPos() : undefined);

/** El contenedor con scroll del editor (el panel de la nota). */
function scrollParent(el: Element | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/** Un bloque de extensión: lo dibuja su `NoteBlock`, aislado en su
 *  ExtensionBoundary; el código sigue en el documento, oculto. En el modo
 *  inline el código se ve y se edita, entre la barra y la franja de la
 *  extensión. */
function ExtensionCodeBlockView({ node, editor, getPos, extension }: NodeViewProps) {
  const blocks = (extension.options as Options).extensionBlocks.current;
  const language = languageOf(node);
  const id = blocks?.byLanguage[language];
  const onEdit = () => {
    const pos = posOf(getPos);
    if (typeof pos === 'number' && blocks) blocks.edit(language, blockIndexAt(editor.state.doc, pos, language));
  };
  return (
    <NodeViewWrapper className="extension-node-view" data-extension-block={language}>
      <div contentEditable={false} suppressContentEditableWarning>
        {id && <ExtensionSlot id={id} point="NoteBlock" props={{ code: node.textContent, onEdit }} />}
      </div>
      <NodeViewContent<'code'> as="code" className={`language-${language} mermaid-node-source`} />
    </NodeViewWrapper>
  );
}

/** El índice del bloque y el cursor cambian sin que cambie el nodo (se
 *  agrega un bloque arriba, se mueve el cursor): se recalculan con cada
 *  transacción del editor, y solo se vuelve a dibujar si cambian. */
function InlineExtensionBlockView({ node, editor, getPos, extension }: NodeViewProps) {
  const blocks = (extension.options as Options).extensionBlocks.current;
  const language = languageOf(node);
  const id = blocks?.byLanguage[language];
  const read = () => {
    const pos = posOf(getPos);
    if (typeof pos !== 'number') return { index: -1, cursor: null as number | null };
    const { $from } = editor.state.selection;
    const inside = $from.parent.type.name === 'codeBlock' && $from.before() === pos;
    return { index: blockIndexAt(editor.state.doc, pos, language), cursor: inside ? $from.parentOffset : null };
  };
  const [where, setWhere] = useState(read);
  useEffect(() => {
    const onTransaction = () => {
      const next = read();
      setWhere((prev) => (prev.index === next.index && prev.cursor === next.cursor ? prev : next));
    };
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('transaction', onTransaction);
    };
  // `read` lee siempre el estado actual del editor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, language]);
  // Las acciones de la barra (R24). Se calcula la posición al usarlas: el
  // documento pudo cambiar desde el último render.
  const setLanguage = (next: string) => {
    const pos = posOf(getPos);
    if (typeof pos !== 'number' || !editor.isEditable) return;
    const tr = setBlockLanguageTr(editor.state, pos, next);
    if (!tr) return;
    // Al cambiar de lenguaje este NodeView se reemplaza (sin barra ni
    // franja) y el panel podría saltar: se guarda el scroll, como el
    // selector de los bloques normales (handleChangeCodeLanguage).
    const scroller = scrollParent(editor.view.dom);
    const scrollTop = scroller?.scrollTop ?? 0;
    editor.view.dispatch(tr);
    // El foco estaba en el menú de la barra, que ya no existe: vuelve al código.
    editor.view.focus();
    if (scroller) scroller.scrollTop = scrollTop;
  };
  const setCode = (next: string) => {
    const pos = posOf(getPos);
    if (typeof pos !== 'number' || !editor.isEditable) return;
    const tr = setBlockCodeTr(editor.state, pos, next);
    if (tr) editor.view.dispatch(tr);
  };
  const editable = editor.isEditable;
  const slotProps = (part: 'header' | 'footer') => ({
    code: node.textContent,
    onEdit: () => {},
    part,
    noteId: blocks?.noteId,
    index: where.index,
    cursor: where.cursor,
    setLanguage: editable ? setLanguage : undefined,
    setCode: editable ? setCode : undefined,
  });
  return (
    <NodeViewWrapper className="extension-node-view extension-node-inline" data-extension-block={language}>
      <div contentEditable={false} suppressContentEditableWarning className="extension-block-ui">
        {id && <ExtensionSlot id={id} point="NoteBlock" props={slotProps('header')} />}
      </div>
      <pre>
        <NodeViewContent<'code'> as="code" className={`language-${language}`} />
      </pre>
      <div contentEditable={false} suppressContentEditableWarning className="extension-block-ui">
        {id && <ExtensionSlot id={id} point="NoteBlock" props={slotProps('footer')} />}
      </div>
    </NodeViewWrapper>
  );
}

function MermaidCodeBlockView({ node, editor, getPos, extension }: NodeViewProps) {
  const actions = (extension.options as Options).mermaidActions.current;
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  const index = typeof pos === 'number' ? mermaidIndexAt(editor.state.doc, pos) : -1;
  const total = mermaidCount(editor.state.doc);
  const run = (action: keyof MermaidActions) => () => {
    // El índice se recalcula al hacer clic: el documento pudo cambiar
    // desde el último render.
    const current = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof current !== 'number' || !actions) return;
    actions[action](mermaidIndexAt(editor.state.doc, current));
  };

  return (
    <NodeViewWrapper className="mermaid-node-view" data-mermaid-node="">
      <div contentEditable={false} suppressContentEditableWarning>
        <MermaidBlock
          diagramIndex={index}
          code={node.textContent}
          compact
          onEdit={run('edit')}
          onMoveUp={index > 0 ? run('moveUp') : undefined}
          onMoveDown={index >= 0 && index < total - 1 ? run('moveDown') : undefined}
          onDuplicate={run('duplicate')}
          onDelete={run('remove')}
        />
      </div>
      {/* El código sigue en el documento (ProseMirror lo necesita), oculto. */}
      <NodeViewContent<'code'> as="code" className="language-mermaid mermaid-node-source" />
    </NodeViewWrapper>
  );
}

export const MermaidAwareCodeBlock = CodeBlockLowlight.extend<Options>({
  addOptions() {
    return {
      ...this.parent!(),
      mermaidActions: { current: null },
      extensionBlocks: { current: null },
    };
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      // ⌘↵ (Ctrl+Enter) dentro de un bloque inline lo atiende su extensión
      // (specs/cliente-http HT30). Fuera, sigue lo de siempre.
      'Mod-Enter': () => {
        const blocks = this.options.extensionBlocks.current;
        if (!blocks) return false;
        const target = inlineRunTarget(this.editor.state, (language) => !!blocks.inline[language]);
        if (!target) return false;
        emitNoteBlockRun({
          language: target.language,
          noteId: blocks.noteId,
          index: target.index,
          offset: target.offset,
          dom: this.editor.view.nodeDOM(target.pos) as Element | null,
        });
        return true;
      },
    };
  },

  addNodeView() {
    const mermaidView = ReactNodeViewRenderer(MermaidCodeBlockView, {
      // Si deja de ser mermaid, que ProseMirror cree la vista normal.
      update: ({ newNode, updateProps }) => {
        if (!isMermaid(newNode)) return false;
        updateProps();
        return true;
      },
    });
    const blocks = this.options.extensionBlocks;
    const isExtensionBlock = (node: PMNode) => !!blocks.current?.byLanguage[languageOf(node)];
    const isInlineBlock = (node: PMNode) => isExtensionBlock(node) && !!blocks.current?.inline[languageOf(node)];
    const extensionView = ReactNodeViewRenderer(ExtensionCodeBlockView, {
      update: ({ oldNode, newNode, updateProps }) => {
        if (!isExtensionBlock(newNode) || isInlineBlock(newNode) || languageOf(newNode) !== languageOf(oldNode)) return false;
        updateProps();
        return true;
      },
    });
    const inlineView = ReactNodeViewRenderer(InlineExtensionBlockView, {
      // Las islas (barra y respuesta) son de la extensión: ProseMirror no
      // maneja sus teclas, clics ni selección. El código sí es suyo.
      stopEvent: ({ event }) => {
        const target = event.target as Element | null;
        return !!target?.closest?.('.extension-block-ui');
      },
      update: ({ oldNode, newNode, updateProps }) => {
        if (!isInlineBlock(newNode) || languageOf(newNode) !== languageOf(oldNode)) return false;
        updateProps();
        return true;
      },
    });
    const prefix = this.options.languageClassPrefix ?? 'language-';

    return (props) => {
      if (isMermaid(props.node)) return mermaidView(props);
      if (isInlineBlock(props.node)) return inlineView(props);
      if (isExtensionBlock(props.node)) return extensionView(props);

      // Igual que el renderHTML por defecto: <pre><code class="language-x">.
      let current = props.node;
      const dom = document.createElement('pre');
      const code = document.createElement('code');
      const setLanguage = (language: unknown) => {
        if (typeof language === 'string' && language) code.className = `${prefix}${language}`;
        else code.removeAttribute('class');
      };
      setLanguage(current.attrs.language);
      dom.appendChild(code);
      return {
        dom,
        contentDOM: code,
        update: (node: PMNode) => {
          if (node.type !== current.type || isMermaid(node) || isExtensionBlock(node)) return false;
          current = node;
          setLanguage(node.attrs.language);
          return true;
        },
      };
    };
  },
});
