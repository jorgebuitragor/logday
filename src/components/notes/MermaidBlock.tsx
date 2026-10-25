import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CopyPlus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { renderMermaidSvg } from '../../lib/mermaid';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';

const ESTIMATED_MERMAID_MENU = { width: 190, height: 130 };

interface Props {
  diagramIndex?: number;
  code: string;
  compact?: boolean;
  onEdit?: () => void;
  onHeightChange?: (height: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export function MermaidBlock({ diagramIndex, code, compact = false, onEdit, onHeightChange, onMoveUp, onMoveDown, onDuplicate, onDelete }: Props) {
  const language = useAppStore((s) => s.language);
  const hostRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menu = usePositionedMenu(menuPosition, {
    estimatedSize: ESTIMATED_MERMAID_MENU,
    onClose: () => setMenuPosition(null),
  });

  useEffect(() => {
    let cancelled = false;
    setSvg('');
    setError(null);

    renderMermaidSvg(code)
      .then(({ svg: nextSvg, bindFunctions }) => {
        if (cancelled) return;
        setSvg(nextSvg);
        requestAnimationFrame(() => {
          if (!cancelled && hostRef.current && bindFunctions) {
            bindFunctions(hostRef.current);
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError(t(language, 'notes', 'mermaidRenderError'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  useEffect(() => {
    if (!onHeightChange || !blockRef.current) return;

    const element = blockRef.current;
    const reportHeight = () => {
      const next = Math.ceil(element.getBoundingClientRect().height);
      if (next > 0) onHeightChange(next);
    };

    // Measure after paint to capture final SVG size in webviews where
    // ResizeObserver can be delayed/inconsistent.
    const raf1 = requestAnimationFrame(() => {
      reportHeight();
      requestAnimationFrame(reportHeight);
    });

    // Mermaid can change final size after async SVG layout/font resolution.
    // ResizeObserver keeps placeholder height in sync to prevent overlap.
    const observer = new ResizeObserver(() => reportHeight());
    observer.observe(element);

    const onResize = () => reportHeight();
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf1);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [onHeightChange, svg, error, compact]);

  const hasActions = Boolean(onEdit || onDuplicate || onDelete);

  const handleOpenEditor = () => {
    if (onEdit) onEdit();
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hasActions) return;
    event.preventDefault();
    setMenuPosition({
      x: event.clientX,
      y: event.clientY,
    });
  };

  return (
    <div className="relative">
      <div
        ref={blockRef}
        data-mermaid-card
        data-mermaid-index={diagramIndex}
        onClick={handleOpenEditor}
        onContextMenu={handleContextMenu}
        className={`mermaid-block relative overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] ${onEdit ? 'cursor-pointer' : ''}`}
      >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
        <span>{t(language, 'notes', 'mermaidCardTitle')}</span>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              className="rounded p-1 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title={t(language, 'notes', 'editDiagram')}
            >
              <Pencil size={12} />
            </button>
          )}
          {onMoveUp && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMoveUp();
              }}
              className="rounded p-1 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title={t(language, 'notes', 'moveUp')}
            >
              <ArrowUp size={12} />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMoveDown();
              }}
              className="rounded p-1 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title={t(language, 'notes', 'moveDown')}
            >
              <ArrowDown size={12} />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDuplicate();
              }}
              className="rounded p-1 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title={t(language, 'notes', 'duplicateDiagram')}
            >
              <CopyPlus size={12} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              className="rounded p-1 text-red-300 transition hover:bg-red-500/10 hover:text-red-400"
              title={t(language, 'notes', 'deleteDiagram')}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 px-3 py-3 text-xs text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <div>{error}</div>
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-black/10 p-2 font-mono text-[11px] text-[var(--text-secondary)]">{code}</pre>
          </div>
        </div>
      ) : !svg ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--text-hint)]">
          <Loader2 size={14} className="animate-spin" />
          {t(language, 'notes', 'renderingDiagram')}
        </div>
      ) : (
        <div className="relative">
          {menuPosition && hasActions && (
            <div
              ref={menu.ref}
              className="fixed z-[10020] min-w-[180px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-xl"
              style={menu.style}
              onClick={(event) => event.stopPropagation()}
            >
              {onEdit && (
                <button
                  onClick={() => {
                    setMenuPosition(null);
                    onEdit();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <Pencil size={13} />
                  {t(language, 'notes', 'editDiagram')}
                </button>
              )}
              {onDuplicate && (
                <button
                  onClick={() => {
                    setMenuPosition(null);
                    onDuplicate();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <CopyPlus size={13} />
                  {t(language, 'notes', 'duplicateDiagram')}
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    setMenuPosition(null);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-300 transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 size={13} />
                  {t(language, 'notes', 'deleteDiagram')}
                </button>
              )}
            </div>
          )}

          <div
            ref={hostRef}
            className={`mermaid-host overflow-x-auto px-3 ${compact ? 'py-2' : 'py-3'}`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}
      </div>
    </div>
  );
}