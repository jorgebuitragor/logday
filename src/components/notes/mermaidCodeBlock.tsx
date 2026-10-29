import type { MutableRefObject } from 'react';
import CodeBlockLowlight, { type CodeBlockLowlightOptions } from '@tiptap/extension-code-block-lowlight';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { MermaidBlock } from './MermaidBlock';
import { ExtensionSlot } from '../../extensions/ExtensionSlot';
import type { ExtensionId } from '../../extensions/types';

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

const languageOf = (node: PMNode) => (node.type.name === 'codeBlock' ? String(node.attrs.language ?? '') : '');

function blockIndexAt(doc: PMNode, pos: number, language: string): number {
  let index = -1;
  doc.descendants((node, nodePos) => {
    if (nodePos > pos) return false;
    if (languageOf(node) === language) index += 1;
    return node.type.name !== 'codeBlock';
  });
  return index;
}

/** Un bloque de extensión: lo dibuja su `NoteBlock`, aislado en su
 *  ExtensionBoundary; el código sigue en el documento, oculto. */
function ExtensionCodeBlockView({ node, editor, getPos, extension }: NodeViewProps) {
  const blocks = (extension.options as Options).extensionBlocks.current;
  const language = languageOf(node);
  const id = blocks?.byLanguage[language];
  const onEdit = () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
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
    const extensionView = ReactNodeViewRenderer(ExtensionCodeBlockView, {
      update: ({ oldNode, newNode, updateProps }) => {
        if (!isExtensionBlock(newNode) || languageOf(newNode) !== languageOf(oldNode)) return false;
        updateProps();
        return true;
      },
    });
    const prefix = this.options.languageClassPrefix ?? 'language-';

    return (props) => {
      if (isMermaid(props.node)) return mermaidView(props);
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
