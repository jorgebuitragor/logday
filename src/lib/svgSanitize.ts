// Saneo de los SVG que se insertan con dangerouslySetInnerHTML: diagramas
// de Mermaid y dibujos de Excalidraw de una nota (specs/blindaje-seguridad
// BS8–BS9). El contenido de una nota puede llegar por sync, por MCP o
// pegado de una web, así que su SVG no se inserta tal cual.
//
// Se permiten SVG y HTML porque Mermaid dibuja las etiquetas como HTML
// dentro de <foreignObject>, y <style> porque los dos traen su CSS (y
// Excalidraw sus fuentes) dentro del SVG. DOMPurify quita scripts,
// manejadores de eventos y enlaces javascript:.
import DOMPurify from 'dompurify';

export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject', 'style'],
    // Igual que Mermaid al sanear sus etiquetas: el HTML dentro de un
    // <foreignObject> es contenido HTML, no SVG.
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'meta', 'link'],
  });
}
