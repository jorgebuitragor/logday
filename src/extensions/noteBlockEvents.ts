// Bus pequeño entre el editor de notas y los bloques inline de las
// extensiones (specs/cliente-http, design A3.3): el editor avisa de un
// ⌘↵ dentro de un bloque, y la extensión que lo dibuja lo atiende. Sin
// React ni store, para probarlo solo.

export interface NoteBlockRunEvent {
  language: string;
  noteId: string | undefined;
  /** El n-ésimo bloque de ese lenguaje en la nota. */
  index: number;
  /** Posición del cursor dentro del texto del bloque. */
  offset: number;
  /** El elemento del NodeView, para que cada bloque sepa si es el suyo
   *  aunque su índice haya cambiado desde el último dibujo. */
  dom: Element | null;
}

type Listener = (event: NoteBlockRunEvent) => void;

const listeners = new Set<Listener>();

export function subscribeNoteBlockRun(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Devuelve si algún oyente lo atendió (devolvió sin lanzar). */
export function emitNoteBlockRun(event: NoteBlockRunEvent): boolean {
  let handled = false;
  for (const listener of [...listeners]) {
    try {
      listener(event);
      handled = true;
    } catch (err) {
      console.error('[bloque de nota]', err);
    }
  }
  return handled;
}
