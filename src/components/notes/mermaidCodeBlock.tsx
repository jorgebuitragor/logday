import type { MutableRefObject } from 'react';
import CodeBlockLowlight, { type CodeBlockLowlightOptions } from '@tiptap/extension-code-block-lowlight';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { MermaidBlock } from './MermaidBlock';

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

interface Options extends CodeBlockLowlightOptions {
  /** Acciones del NoteEditor, por índice de diagrama en el documento (el
   *  mismo orden que parseMermaidBlocks sobre el markdown). Es un ref para
   *  leer siempre las versiones actuales de los handlers. */
  mermaidActions: MutableRefObject<MermaidActions | null>;
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
    const prefix = this.options.languageClassPrefix ?? 'language-';

    return (props) => {
      if (isMermaid(props.node)) return mermaidView(props);

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
          if (node.type !== current.type || isMermaid(node)) return false;
          current = node;
          setLanguage(node.attrs.language);
          return true;
        },
      };
    };
  },
});
