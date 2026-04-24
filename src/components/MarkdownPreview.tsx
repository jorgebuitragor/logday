import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import { MermaidBlock } from './MermaidBlock';
import { parseMermaidBlocks } from '../lib/mermaid';
import { fs } from '../lib/invoke';

interface Props {
  markdown: string;
  className?: string;
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

export function MarkdownPreview({ markdown, className = '', onEditMermaid, onMoveMermaidUp, onMoveMermaidDown, onDuplicateMermaid, onDeleteMermaid }: Props) {
  const mermaidBlocks = parseMermaidBlocks(markdown);
  let mermaidIndex = -1;

  return (
    <div className={`md-preview ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw]}
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
                  if (props.href) {
                    fs.openInSystem(props.href).catch(err => console.warn('Failed to open link:', err));
                  }
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

            if (match?.[1]?.toLowerCase() === 'mermaid') {
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

            return (
              <pre>
                <code className={className} {...rest}>{children}</code>
              </pre>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}