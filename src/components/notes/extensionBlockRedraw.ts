// Encender o apagar una extensión con bloque en las notas (R24) con una nota
// abierta. ProseMirror elige el NodeView de cada bloque al dibujarlo y no lo
// vuelve a elegir si el nodo no cambia: sin esto, un ```http seguía con la
// barra del Cliente HTTP ya apagado (o sin ella al encenderlo) hasta cambiar
// de nota, y como la barra de lenguaje salta esos bloques, las etiquetas se
// corrían un lugar y el cambio de lenguaje caía en el bloque de al lado.
import { useEffect, useRef } from 'react';

/** Identifica qué lenguajes dibuja cada extensión y cuáles van inline. */
export function blockLanguagesKey(byLanguage: Record<string, string>, inline: Record<string, boolean>): string {
  return Object.entries(byLanguage)
    .map(([language, id]) => `${language}:${id}${inline[language] ? ':inline' : ''}`)
    .sort()
    .join(',');
}

interface RedrawableEditor {
  isDestroyed: boolean;
  /** TipTap vuelve a armar sus NodeView y ProseMirror redibuja el documento. */
  createNodeViews: () => void;
}

/** Lleva la cuenta de los lenguajes con los que se dibujaron los bloques
 *  y redibuja cuando cambian. No al empezar ni al cambiar de editor (otra
 *  nota): ese editor ya se creó con los lenguajes de ahora. */
export function blockRedrawer(initialKey: string): (editor: RedrawableEditor | null, key: string) => void {
  let drawn = initialKey;
  return (editor, key) => {
    if (drawn === key) return;
    drawn = key;
    if (editor && !editor.isDestroyed) editor.createNodeViews();
  };
}

/** `blockRedrawer` en un efecto del editor de notas. */
export function useRedrawOnBlockChange(editor: RedrawableEditor | null, key: string): void {
  const redrawRef = useRef<ReturnType<typeof blockRedrawer> | null>(null);
  redrawRef.current ??= blockRedrawer(key);
  useEffect(() => {
    redrawRef.current!(editor, key);
  }, [editor, key]);
}
