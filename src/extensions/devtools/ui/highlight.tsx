// Resaltado de la salida con lowlight (el mismo highlight.js de las notas),
// solo con los lenguajes que usa DevTools. Las clases `hljs-*` se pintan
// con los tokens `--syntax-*` de App.css, que se leen en todos los temas
// (design §8, hallazgo 4).
import { useMemo, type ReactNode } from 'react';
import { createLowlight } from 'lowlight';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const lowlight = createLowlight({ json, sql, xml, yaml });

export type HighlightLanguage = 'json' | 'sql' | 'xml' | 'yaml';

/** Por encima de esto se muestra sin colores (design §5). */
export const HIGHLIGHT_LIMIT = 200_000;

interface HastText {
  type: 'text';
  value: string;
}
interface HastElement {
  type: 'element';
  properties?: { className?: string[] | string };
  children: HastNode[];
}
type HastNode = HastText | HastElement | { type: string };

function toReact(nodes: HastNode[], prefix: string): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === 'text') return (node as HastText).value;
    if (node.type !== 'element') return null;
    const el = node as HastElement;
    const cls = el.properties?.className;
    return (
      <span key={`${prefix}${i}`} className={Array.isArray(cls) ? cls.join(' ') : cls}>
        {toReact(el.children, `${prefix}${i}.`)}
      </span>
    );
  });
}

/** El código, resaltado si hay lenguaje y no es demasiado grande. */
export function CodeText({ code, language }: { code: string; language?: HighlightLanguage | null }) {
  const nodes = useMemo(() => {
    if (!language || code.length > HIGHLIGHT_LIMIT) return null;
    try {
      return toReact(lowlight.highlight(language, code).children as HastNode[], '');
    } catch {
      return null;
    }
  }, [code, language]);
  return <code className="devtools-code">{nodes ?? code}</code>;
}
