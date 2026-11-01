// Resaltado de la salida con lowlight (el mismo highlight.js de las notas),
// solo con los lenguajes que usan DevTools y el panel "Código" del Cliente
// HTTP (bash, javascript, python, go y java, que ya carga el editor de
// notas). Las clases `hljs-*` se pintan con los tokens `--syntax-*` de
// App.css, que se leen en todos los temas (design §8, hallazgo 4).
import { useMemo, type ReactNode } from 'react';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const lowlight = createLowlight({ bash, go, java, javascript, json, python, sql, xml, yaml });

export type HighlightLanguage = 'json' | 'sql' | 'xml' | 'yaml' | 'bash' | 'javascript' | 'python' | 'go' | 'java';

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
