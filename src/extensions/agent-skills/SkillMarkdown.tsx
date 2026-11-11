// El cuerpo del SKILL.md renderizado (specs/skills-de-agentes SK6). Viene
// de terceros, así que: sin `rehype-raw` (el HTML de dentro no se
// interpreta), `rehype-sanitize` con el esquema por defecto, las imágenes
// no se cargan (cargarlas le diría a un tercero que se abrió la skill) y
// los enlaces solo abren http(s) y mailto con `open_url`, que los valida.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { ImageOff } from 'lucide-react';
import { fs } from '../../lib/invoke';
import { TEXT_LINK } from '../../components/shared/controlClasses';

const OPENABLE = /^(https?:|mailto:)/i;

export function SkillMarkdown({ markdown, imageLabel }: { markdown: string; imageLabel: (alt: string) => string }) {
  return (
    <div className="md-preview text-sm [&_ol]:list-decimal [&_ul]:list-disc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          img({ alt }) {
            return (
              <span className="inline-flex items-center gap-1 rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-xs text-[var(--text-hint)]">
                <ImageOff size={12} aria-hidden />
                {imageLabel(alt ?? '')}
              </span>
            );
          },
          a({ href, children }) {
            if (!href || !OPENABLE.test(href)) return <span className="underline decoration-dotted">{children}</span>;
            return (
              <a
                href={href}
                className={TEXT_LINK}
                onClick={(e) => {
                  e.preventDefault();
                  fs.openUrl(href).catch(() => undefined);
                }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
