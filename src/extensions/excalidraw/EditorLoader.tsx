import { lazy, Suspense } from 'react';
import type { NoteBlockEditorProps } from '../types';

// Excalidraw entero (~1 MB) solo al abrir el editor. Va envuelto en un
// componente porque `ExtensionSlot` ya carga el punto con `lazy`, y React
// no acepta un `lazy` que devuelve otro `lazy` (error #306).
const Editor = lazy(() => import('./Editor'));

export default function ExcalidrawEditorLoader(props: NoteBlockEditorProps) {
  return (
    <Suspense fallback={null}>
      <Editor {...props} />
    </Suspense>
  );
}
