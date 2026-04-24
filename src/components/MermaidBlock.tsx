import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CopyPlus, GripVertical, Loader2, Pencil, Trash2 } from 'lucide-react';
import { renderMermaidSvg } from '../lib/mermaid';
import { placeMenuAtPointer } from '../lib/menuPosition';

const ESTIMATED_MERMAID_MENU = { width: 190, height: 130 };

interface Props {
  diagramIndex?: number;
  code: string;
  compact?: boolean;
  onEdit?: () => void;
  onStartDrag?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export function MermaidBlock({ diagramIndex, code, compact = false, onEdit, onStartDrag, onMoveUp, onMoveDown, onDuplicate, onDelete }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [menuPosAdjusted, setMenuPosAdjusted] = useState<{ x: number; y: number } | null>(null);
  const [menuReady, setMenuReady] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
          setError('No se pudo renderizar el diagrama Mermaid');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!menuPosition) return;

    const handleOutside = (event: MouseEvent) => {
      if (!blockRef.current?.contains(event.target as Node)) {
        setMenuPosition(null);
        setMenuReady(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuPosition]);

  useEffect(() => {
    if (!menuPosition || !menuRef.current) return;

    const recalc = () => {
      if (!menuRef.current || !menuPosition) return;
      const rect = menuRef.current.getBoundingClientRect();
      setMenuPosAdjusted(
        placeMenuAtPointer(
          { x: menuPosition.x, y: menuPosition.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setMenuReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [menuPosition]);

  const hasActions = Boolean(onEdit || onDuplicate || onDelete);

  const handleOpenEditor = () => {
    if (onEdit) onEdit();
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hasActions) return;
    event.preventDefault();
    setMenuReady(false);
    setMenuPosAdjusted(placeMenuAtPointer({ x: event.clientX, y: event.clientY }, ESTIMATED_MERMAID_MENU, { padding: 8 }));
    setMenuPosition({
      x: event.clientX,
      y: event.clientY,
    });
  };

  return (
    <div
      ref={blockRef}
      data-mermaid-card
      data-mermaid-index={diagramIndex}
      onClick={handleOpenEditor}
      onContextMenu={handleContextMenu}
      className={`mermaid-block relative my-3 overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] ${onEdit ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
        <span>Diagrama Mermaid</span>
        <div className="flex items-center gap-1">
          {onStartDrag && (
            <button
              type="button"
              onPointerDown={(event) => {
                event.stopPropagation();
                onStartDrag(event);
              }}
              className="rounded p-1 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title="Arrastrar diagrama"
            >
              <GripVertical size={12} />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              className="rounded p-1 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title="Editar diagrama"
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
              title="Mover arriba"
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
              title="Mover abajo"
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
              title="Duplicar diagrama"
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
              title="Eliminar diagrama"
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
          Renderizando diagrama…
        </div>
      ) : (
        <div className="relative">
          {menuPosition && hasActions && (
            <div
              ref={menuRef}
              className="fixed z-[10020] min-w-[180px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-xl"
              style={{ left: menuPosAdjusted?.x ?? 8, top: menuPosAdjusted?.y ?? 8, visibility: menuReady ? 'visible' : 'hidden' }}
              onClick={(event) => event.stopPropagation()}
            >
              {onEdit && (
                <button
                  onClick={() => {
                    setMenuPosition(null);
                    setMenuReady(false);
                    onEdit();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <Pencil size={13} />
                  Editar diagrama
                </button>
              )}
              {onDuplicate && (
                <button
                  onClick={() => {
                    setMenuPosition(null);
                    setMenuReady(false);
                    onDuplicate();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <CopyPlus size={13} />
                  Duplicar diagrama
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    setMenuPosition(null);
                    setMenuReady(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-300 transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 size={13} />
                  Eliminar diagrama
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
  );
}