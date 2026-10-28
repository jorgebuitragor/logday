// Módulo de "Excalidraw". Se carga con `import()` solo cuando la extensión
// está activa (specs/extensiones R16); el editor, que trae Excalidraw
// entero, solo al abrirlo.
import { lazy } from 'react';
import type { ExtensionModule } from '../types';
import ExcalidrawBlock from './Block';

const excalidraw: ExtensionModule = {
  NoteBlock: ExcalidrawBlock,
  NoteBlockEditor: lazy(() => import('./Editor')),
};

export default excalidraw;
