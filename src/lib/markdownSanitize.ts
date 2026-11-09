// Saneo del HTML que trae el Markdown de una nota en la vista dividida
// (`MarkdownPreview`), specs/blindaje-seguridad BS4–BS6.
//
// La vista usa `rehype-raw` porque el editor guarda parte del formato como
// HTML dentro del Markdown (`<span style="color: …">`, `<mark>`, `<u>`,
// `<p style="text-align: …">`). Sin sanear, una nota llegada por sync, por
// MCP o pegada de una web podía meter un `<iframe srcdoc>` con script en el
// origen de la app. Este esquema deja solo lo que el editor produce.
import { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeSchema } from 'rehype-sanitize';

// Lo mínimo del árbol hast que se recorre (sin depender de @types/hast).
interface HastNode {
  type: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const base = defaultSchema;

export const notePreviewSchema: SanitizeSchema = {
  ...base,
  tagNames: [...(base.tagNames ?? []), 'u', 'mark', 'colgroup', 'col'],
  attributes: {
    ...base.attributes,
    // El valor de `style` se filtra después con `rehypeFilterStyle`.
    '*': [...(base.attributes?.['*'] ?? []), 'style'],
    ul: [...(base.attributes?.ul ?? []), 'dataType'],
    li: [...(base.attributes?.li ?? []), 'dataType', 'dataChecked'],
  },
  protocols: {
    ...base.protocols,
    href: [...(base.protocols?.href ?? []), 'tel'],
    // `data:` para las imágenes incrustadas (así las guarda el editor) y
    // `file:` para las locales, que igual pasan por el límite de rutas de
    // Rust al leerse.
    src: ['http', 'https', 'data', 'file'],
  },
};

// Mismas propiedades que permite Logday Web (renderMarkdown.ts): con
// `style` libre, una nota podría tapar la interfaz con `position: fixed` o
// cargar recursos con `background: url(…)`.
const ALLOWED_STYLE_PROPERTIES = new Set(['color', 'background-color', 'text-align']);

export function filterStyle(style: string): string {
  return style
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => {
      const colon = decl.indexOf(':');
      if (colon <= 0) return false;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).toLowerCase();
      return ALLOWED_STYLE_PROPERTIES.has(prop) && !/url\(|image-set|expression|\\/.test(value);
    })
    .join('; ');
}

function visit(node: HastNode) {
  for (const child of node.children ?? []) {
    if (child.type !== 'element') continue;
    const props = child.properties;
    if (props && typeof props.style === 'string') {
      const filtered = filterStyle(props.style);
      if (filtered) props.style = filtered;
      else delete props.style;
    }
    visit(child);
  }
}

/** Plugin de rehype: deja en `style` solo color, fondo y alineación. Va
 *  después de `rehype-sanitize`. */
export function rehypeFilterStyle() {
  return (tree: HastNode) => visit(tree);
}

/** Esquemas que la vista dividida abre con el sistema (el comando Rust
 *  `open_url` vuelve a comprobarlo). */
export function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:|tel:|\/\/)/i.test(href.trim());
}
