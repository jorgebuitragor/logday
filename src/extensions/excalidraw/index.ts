// Módulo de "Excalidraw". Se carga con `import()` solo cuando la extensión
// está activa (specs/extensiones R16); el editor, que trae Excalidraw
// entero, solo al abrirlo (EditorLoader).
import type { ExtensionModule } from '../types';
import ExcalidrawBlock from './Block';
import ExcalidrawEditorLoader from './EditorLoader';

const excalidraw: ExtensionModule = {
  NoteBlock: ExcalidrawBlock,
  NoteBlockEditor: ExcalidrawEditorLoader,
};

export default excalidraw;
