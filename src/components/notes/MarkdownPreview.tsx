import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkGemoji from 'remark-gemoji';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { MermaidBlock } from './MermaidBlock';
import { parseMermaidBlocks } from '../../lib/mermaid';
import { fs } from '../../lib/invoke';
import { isExternalHref, notePreviewSchema, rehypeFilterStyle } from '../../lib/markdownSanitize';
import { useAppStore } from '../../store/appStore';
import { CODE_LANGUAGE_OPTIONS, normalizeCodeLanguage, tokenizeCodeLine } from '../../lib/codeHighlight';

interface Props {
  markdown: string;
  className?: string;
  onChangeCodeLanguage?: (index: number, language: string) => void;
  onEditMermaid?: (index: number, code: string) => void;
  onMoveMermaidUp?: (index: number) => void;
  onMoveMermaidDown?: (index: number) => void;
  onDuplicateMermaid?: (index: number) => void;
  onDeleteMermaid?: (index: number) => void;
}

function LocalImageRenderer({ src, alt }: { src: string; alt?: string }) {
  const [imageSrc, setImageSrc] = useState<string>('');
  
  useEffect(() => {
    const loadImage = async () => {
      try {
        const cleanPath = src.replace(/^file:\/\/?/, '/');
        const base64 = await fs.readBinary(cleanPath);
        setImageSrc(`data:image/png;base64,${base64}`);
      } catch (error) {
        console.warn('Failed to load local image:', error);
        setImageSrc('');
      }
    };
    loadImage();
  }, [src]);

  if (!imageSrc) return <span className="text-red-400 text-xs">[Imagen no disponible]</span>;
  return <img src={imageSrc} alt={alt} style={{ maxWidth: '100%', borderRadius: '8px' }} />;
}

/** Un enlace de la vista dividida: los externos (http, https, mailto, tel)
 *  van al navegador o la app del sistema; los demás solo pueden ser una
 *  nota, por id o por título, como en el editor (useLinkPreview). Antes se
 *  abría cualquier href con `open_in_system`, y un enlace a un `.app` o un
 *  `.command` lo ejecutaba (specs/blindaje-seguridad BS7). */
function openPreviewLink(href: string) {
  if (isExternalHref(href)) {
    fs.openUrl(href).catch((err) => console.warn('No se pudo abrir el enlace:', err));
    return;
  }
  let target = href;
  try {
    target = decodeURIComponent(href);
  } catch {
    // href con % sueltos: se busca tal cual.
  }
  const { notes, setSection, setActiveNote } = useAppStore.getState();
  const note = notes.find((n) => n.id === href || n.title.toLowerCase() === target.toLowerCase());
  if (note) {
    setSection('notes');
    setActiveNote(note);
  }
}

export function MarkdownPreview({ markdown, className = '', onChangeCodeLanguage, onEditMermaid, onMoveMermaidUp, onMoveMermaidDown, onDuplicateMermaid, onDeleteMermaid }: Props) {
  const mermaidBlocks = parseMermaidBlocks(markdown);
  let mermaidIndex = -1;
  let codeBlockIndex = -1;

  return (
    <div className={`md-preview ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkGemoji, remarkBreaks]}
        // rehype-raw interpreta el HTML que guarda el editor; rehype-sanitize
        // y el filtro de style dejan solo lo que el editor produce
        // (specs/blindaje-seguridad BS4–BS6).
        rehypePlugins={[rehypeRaw, [rehypeSanitize, notePreviewSchema], rehypeFilterStyle]}
        components={{
          p(props) {
            return <p {...props} style={{ whiteSpace: 'pre-wrap' }} />;
          },
          img(props) {
            const src = props.src || '';
            if (src.startsWith('file://') || src.match(/^\//)) {
              return <LocalImageRenderer src={src} alt={props.alt} />;
            }
            return <img {...props} style={{ maxWidth: '100%', borderRadius: '8px' }} />;
          },
          a(props) {
            return (
              <a
                {...props}
                onClick={(e) => {
                  e.preventDefault();
                  if (props.href) openPreviewLink(props.href);
                }}
                style={{ cursor: 'pointer' }}
              >
                {props.children}
              </a>
            );
          },
          code(props) {
            const { className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const code = String(children).replace(/\n$/, '');
            const language = normalizeCodeLanguage(match?.[1] || '');

            if (language === 'mermaid') {
              mermaidIndex += 1;
              const block = mermaidBlocks[mermaidIndex];
              return (
                <MermaidBlock
                  key={`mermaid-${mermaidIndex}-${block?.start ?? 0}`}
                  code={code}
                  onEdit={onEditMermaid ? () => onEditMermaid(mermaidIndex, block?.code ?? code) : undefined}
                  onMoveUp={onMoveMermaidUp && mermaidIndex > 0 ? () => onMoveMermaidUp(mermaidIndex) : undefined}
                  onMoveDown={onMoveMermaidDown && mermaidIndex < mermaidBlocks.length - 1 ? () => onMoveMermaidDown(mermaidIndex) : undefined}
                  onDuplicate={onDuplicateMermaid ? () => onDuplicateMermaid(mermaidIndex) : undefined}
                  onDelete={onDeleteMermaid ? () => onDeleteMermaid(mermaidIndex) : undefined}
                />
              );
            }

            if (!match) {
              return <code className={className} {...rest}>{children}</code>;
            }

            const lines = code.split('\n');
            codeBlockIndex += 1;
            const currentCodeIndex = codeBlockIndex;

            return (
              <div className="code-block-modern">
                <div className="code-block-header">
                  <select
                    value={language}
                    onChange={(e) => onChangeCodeLanguage?.(currentCodeIndex, e.target.value)}
                    className="code-language-select"
                    aria-label="Seleccionar lenguaje del bloque de código"
                  >
                    {CODE_LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <pre>
                  <code className={className} {...rest}>
                    {lines.map((line, lineIdx) => (
                      <span key={`code-line-${lineIdx}`} className="code-line">
                        {tokenizeCodeLine(line, language).map((token, tokenIdx) => (
                          <span key={`code-token-${lineIdx}-${tokenIdx}`} className={`tok-${token.kind}`}>
                            {token.text || ' '}
                          </span>
                        ))}
                        {lineIdx < lines.length - 1 ? '\n' : ''}
                      </span>
                    ))}
                  </code>
                </pre>
              </div>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}