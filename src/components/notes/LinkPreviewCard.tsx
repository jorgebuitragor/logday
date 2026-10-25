/**
 * LinkPreviewCard
 *
 * A hover/click preview card for links inside the notes editor.
 * - Internal links: show note title, last edited date, body preview, tags.
 * - External URLs: show page title, domain, description (fetched via backend).
 *
 * Positioned absolutely inside the nearest scrollable container so no
 * `position: fixed` is needed.  Uses a two-pass render (invisible → measure →
 * position) via useLayoutEffect to handle overflow detection.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Edit3, Copy, ArrowRight, Tag, Loader2, Pencil, Check, X } from 'lucide-react';
import { t as tFn } from '../../lib/i18n';
import type { Language } from '../../types/common';
// ── Public types ─────────────────────────────────────────────────────────────

export interface InternalNoteMeta {
  id: string;
  title: string;
  updated: string;  // YYYY-MM-DD
  preview: string;  // first ~120 chars of body (already plain text)
  tags: string[];
}

export type ExternalMetaState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; title: string; domain: string; description: string };

export interface AnchorPos {
  /** link's bottom edge relative to container + scrollTop + GAP */
  top: number;
  /** link's top edge relative to container + scrollTop (for flip) */
  linkTop: number;
  left: number;
  right: number;
}

export interface LinkPreviewCardProps {
  /** Unique ID used for aria-describedby on the parent anchor. */
  id: string;
  href: string;
  isInternal: boolean;
  /** Resolved note metadata (null = internal but note not found). */
  internalNote: InternalNoteMeta | null;
  /** State of external metadata fetch. */
  externalMeta: ExternalMetaState | null;
  anchorPos: AnchorPos;
  containerRef: React.RefObject<HTMLElement | null>;
  language: Language;
  onClose: () => void;
  onGoToNote: (noteId: string) => void;
  onEditNote: (noteId: string) => void;
  onOpenExternal: (href: string) => void;
  onCopyLink: (href: string) => void;
  onEditUrl: (oldHref: string, newHref: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

const GAP = 8;
const CARD_MAX_W = 320;

export function LinkPreviewCard({
  id,
  href,
  isInternal,
  internalNote,
  externalMeta,
  anchorPos,
  containerRef,
  language,
  onClose,
  onGoToNote,
  onEditNote,
  onOpenExternal,
  onCopyLink,
  onEditUrl,
}: LinkPreviewCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [positioned, setPositioned] = useState(false);
  const [top, setTop] = useState(0);
  const [left, setLeft] = useState(0);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [editValue, setEditValue] = useState(href);
  const editInputRef = useRef<HTMLInputElement>(null);
  const isEditingUrlRef = useRef(false);
  isEditingUrlRef.current = isEditingUrl;

  // ── Two-pass positioning ────────────────────────────────────────────────
  useLayoutEffect(() => {
    const card = cardRef.current;
    const container = containerRef.current;
    if (!card || !container) return;

    const cardH = card.offsetHeight;
    const cardW = Math.min(card.offsetWidth, CARD_MAX_W);
    const paneW = container.clientWidth;
    const scrollTop = container.scrollTop;
    const paneH = container.clientHeight;

    // Vertical: default below link
    let computedTop = anchorPos.top;

    // Flip above if card overflows the visible viewport of the container
    const visibleBottom = scrollTop + paneH;
    if (computedTop + cardH > visibleBottom - GAP) {
      computedTop = anchorPos.linkTop - GAP - cardH;
    }
    // Never go above the scrolled origin
    computedTop = Math.max(scrollTop + GAP, computedTop);

    // Horizontal: left-align, but shift left if overflowing right edge
    let computedLeft = anchorPos.left;
    if (computedLeft + cardW > paneW - GAP) {
      computedLeft = anchorPos.right - cardW;
    }
    computedLeft = Math.max(GAP, computedLeft);

    setTop(computedTop);
    setLeft(computedLeft);
    setPositioned(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount — anchorPos won't change while the card is open

  // ── Keyboard: Escape closes (or cancels edit), Tab stays inside ──────────────
  useEffect(() => {
    if (isEditingUrl && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditingUrl]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (isEditingUrlRef.current) {
        setIsEditingUrl(false);
        setEditValue(href);
      } else {
        onClose();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onClose, href]);

  // ── Close on outside click / touch ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (cardRef.current && !cardRef.current.contains(target)) {
        onClose();
      }
    };
    // Use capture:false so delegated listeners inside the editor fire first
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onClose]);

  // ── Derived content ─────────────────────────────────────────────────────
  const t = (key: string) => tFn(language, 'notes', key as never);

  const formattedDate = internalNote?.updated
    ? new Intl.DateTimeFormat(language === 'es' ? 'es-CO' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      }).format(new Date(internalNote.updated + 'T00:00:00'))
    : null;

  const displayTitle =
    isInternal
      ? (internalNote?.title || href)
      : (externalMeta?.status === 'ok' ? externalMeta.title : href);

  const domain = !isInternal
    ? (externalMeta?.status === 'ok' ? externalMeta.domain : extractDomain(href))
    : null;

  return (
    <div
      ref={cardRef}
      id={id}
      role="tooltip"
      tabIndex={0}
      aria-label={isInternal ? displayTitle : `${displayTitle} — ${domain}`}
      style={{
        position: 'absolute',
        top,
        left,
        width: CARD_MAX_W,
        zIndex: 10060,
        opacity: positioned ? 1 : 0,
        transform: positioned ? 'translateY(0) scale(1)' : 'translateY(4px) scale(0.98)',
        transition: 'opacity 120ms ease, transform 120ms ease',
        pointerEvents: positioned ? 'auto' : 'none',
      }}
      className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 px-4 pt-3.5 pb-2">
        <div className="mt-0.5 shrink-0 text-[var(--text-hint)]">
          {isInternal
            ? <FileText size={14} />
            : <ExternalLink size={14} />
          }
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
            {displayTitle}
          </p>
          {domain && (
            <p className="truncate text-[11px] text-[var(--text-hint)] mt-0.5">{domain}</p>
          )}
          {isInternal && formattedDate && (
            <p className="text-[11px] text-[var(--text-hint)] mt-0.5">
              {t('linkPreviewLastEdited')} {formattedDate}
            </p>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      {isInternal && internalNote && (
        <>
          {internalNote.preview && (
            <p className="px-4 pb-2 text-[12px] leading-relaxed text-[var(--text-secondary)] line-clamp-3">
              {internalNote.preview}
            </p>
          )}
          {internalNote.tags.length > 0 && (
            <div className="flex items-center gap-1.5 px-4 pb-2 flex-wrap">
              <Tag size={10} className="text-[var(--text-faint)] shrink-0" />
              {internalNote.tags.slice(0, 4).map(tag => (
                <span
                  key={tag}
                  className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {isInternal && !internalNote && (
        <p className="px-4 pb-2 text-[12px] italic text-[var(--text-hint)]">
          {t('linkPreviewNoteNotFound')}
        </p>
      )}

      {!isInternal && !isEditingUrl && (
        <div className="px-4 pb-2">
          {externalMeta?.status === 'loading' && (
            <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-hint)]">
              <Loader2 size={12} className="animate-spin" />
              {t('linkPreviewLoading')}
            </div>
          )}
          {externalMeta?.status === 'error' && (
            <p className="text-[12px] italic text-[var(--text-hint)]">{t('linkPreviewError')}</p>
          )}
          {externalMeta?.status === 'ok' && externalMeta.description && (
            <p className="text-[12px] leading-relaxed text-[var(--text-secondary)] line-clamp-3">
              {externalMeta.description}
            </p>
          )}
        </div>
      )}

      {!isInternal && isEditingUrl && (
        <div className="px-4 pb-3 pt-1">
          <input
            ref={editInputRef}
            type="url"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const trimmed = editValue.trim();
                if (trimmed) onEditUrl(href, trimmed);
                onClose();
              }
            }}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
            spellCheck={false}
          />
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-t border-[var(--border)] px-3 py-2">
        {isInternal && internalNote && (
          <>
            <ActionButton
              icon={<ArrowRight size={12} />}
              label={t('linkPreviewGoToNote')}
              primary
              onClick={() => { onGoToNote(internalNote.id); onClose(); }}
            />
            <ActionButton
              icon={<Edit3 size={12} />}
              label={t('linkPreviewEdit')}
              onClick={() => { onEditNote(internalNote.id); onClose(); }}
            />
          </>
        )}

        {!isInternal && !isEditingUrl && (
          <>
            <ActionButton
              icon={<ExternalLink size={12} />}
              label={t('linkPreviewOpen')}
              primary
              onClick={() => { onOpenExternal(href); onClose(); }}
            />
            <ActionButton
              icon={<Copy size={12} />}
              label={t('linkPreviewCopy')}
              onClick={() => { onCopyLink(href); onClose(); }}
            />
            <ActionButton
              icon={<Pencil size={12} />}
              label={t('linkPreviewEditUrl')}
              onClick={() => setIsEditingUrl(true)}
            />
          </>
        )}
        {!isInternal && isEditingUrl && (
          <>
            <ActionButton
              icon={<Check size={12} />}
              label={t('linkPreviewEditUrl')}
              primary
              onClick={() => {
                const trimmed = editValue.trim();
                if (trimmed) onEditUrl(href, trimmed);
                onClose();
              }}
            />
            <ActionButton
              icon={<X size={12} />}
              label={t('cancel')}
              onClick={() => { setIsEditingUrl(false); setEditValue(href); }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  primary = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
        primary
          ? 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    const m = url.match(/^(?:https?:\/\/)?([^/?#]+)/i);
    return m?.[1] ?? url;
  }
}
