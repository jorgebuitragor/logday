import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { fs, fetchUrlMetadata } from '../lib/invoke';
import type { InternalNoteMeta, ExternalMetaState, AnchorPos } from '../components/notes/LinkPreviewCard';

const GAP_LINK_CARD = 8; // px between anchor bottom and preview card top

export interface LinkPreviewState {
  id: string;
  href: string;
  isInternal: boolean;
  internalNote: InternalNoteMeta | null;
  externalMeta: ExternalMetaState | null;
  anchorPos: AnchorPos;
  anchorEl: HTMLAnchorElement;
}

export function useLinkPreview(
  editorPaneRef: React.RefObject<HTMLDivElement | null>,
  activeNoteId: string | undefined,
) {
  const [linkPreview, setLinkPreview] = useState<LinkPreviewState | null>(null);
  const externalMetaCacheRef = useRef<Map<string, ExternalMetaState>>(new Map());

  // Handler refs updated each render to avoid stale closures.
  const linkPreviewHandlerRef = useRef<{
    open: (anchor: HTMLAnchorElement) => void;
    close: () => void;
    navigateLink: (href: string, isInternal: boolean, internalNoteId?: string) => void;
  }>({
    open: () => {},
    close: () => {},
    navigateLink: () => {},
  });

  linkPreviewHandlerRef.current = {
    open(anchor: HTMLAnchorElement) {
      const href = anchor.getAttribute('href') ?? '';
      if (!href) return;

      const isInternal =
        !href.startsWith('http://') &&
        !href.startsWith('https://') &&
        !href.startsWith('//') &&
        !href.startsWith('mailto:') &&
        !href.startsWith('tel:') &&
        !href.startsWith('ftp:');

      // Resolve internal note
      let internalNote: InternalNoteMeta | null = null;
      if (isInternal) {
        const allNotes = useAppStore.getState().notes;
        const decoded = decodeURIComponent(href).toLowerCase();
        const found = allNotes.find(
          (n) =>
            n.id === href ||
            n.title.toLowerCase() === decoded ||
            n.title.toLowerCase() === href.toLowerCase()
        );
        if (found) {
          const plainBody = found.content
            .replace(/^#{1,6}\s+.*/gm, '')   // strip headings
            .replace(/[*_~`\[\]()]/g, ' ')   // strip most markdown symbols
            .replace(/\s+/g, ' ')
            .trim();
          internalNote = {
            id: found.id,
            title: found.title,
            updated: found.updated,
            preview: plainBody.slice(0, 120),
            tags: found.tags,
          };
        }
      }

      // Compute anchor position in scroll-container coordinates
      const pane = editorPaneRef.current;
      if (!pane) return;
      const paneRect = pane.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const anchorPos: AnchorPos = {
        top: anchorRect.bottom - paneRect.top + pane.scrollTop + GAP_LINK_CARD,
        linkTop: anchorRect.top - paneRect.top + pane.scrollTop,
        left: anchorRect.left - paneRect.left,
        right: anchorRect.right - paneRect.left,
      };

      const cardId = `lpc-${Date.now()}`;

      setLinkPreview({
        id: cardId,
        href,
        isInternal,
        internalNote,
        externalMeta: null,
        anchorPos,
        anchorEl: anchor,
      });

      // Add aria-describedby on the anchor
      anchor.setAttribute('aria-describedby', cardId);

      // Fetch external metadata lazily
      if (!isInternal) {
        const cached = externalMetaCacheRef.current.get(href);
        if (cached) {
          setLinkPreview((prev) => prev ? { ...prev, externalMeta: cached } : prev);
        } else {
          setLinkPreview((prev) => prev ? { ...prev, externalMeta: { status: 'loading' } } : prev);
          fetchUrlMetadata(href)
            .then((meta) => {
              const result: ExternalMetaState = {
                status: 'ok',
                title: meta.title,
                domain: meta.domain,
                description: meta.description,
              };
              externalMetaCacheRef.current.set(href, result);
              setLinkPreview((prev) =>
                prev?.href === href ? { ...prev, externalMeta: result } : prev
              );
            })
            .catch(() => {
              const result: ExternalMetaState = { status: 'error' };
              externalMetaCacheRef.current.set(href, result);
              setLinkPreview((prev) =>
                prev?.href === href ? { ...prev, externalMeta: result } : prev
              );
            });
        }
      }
    },

    close() {
      setLinkPreview((prev) => {
        if (prev) prev.anchorEl.removeAttribute('aria-describedby');
        return null;
      });
    },

    navigateLink(href: string, isInternal: boolean, internalNoteId?: string) {
      if (isInternal && internalNoteId) {
        const note = useAppStore.getState().notes.find((n) => n.id === internalNoteId);
        if (note) {
          useAppStore.getState().setSection('notes');
          useAppStore.getState().setActiveNote(note);
        }
      } else if (!isInternal) {
        fs.openUrl(href).catch(() => {});
      }
    },
  };

  // Attach delegated listeners for link preview. Depends on activeNoteId so the effect
  // re-runs when the pane first becomes available (the component returns early when there
  // is no active note, so editorPaneRef is null on initial mount).
  useEffect(() => {
    const pane = editorPaneRef.current;
    if (!pane) return;

    const getLinkAnchor = (target: EventTarget | null): HTMLAnchorElement | null => {
      if (!(target instanceof Element)) return null;
      return target.closest('a[href]') as HTMLAnchorElement | null;
    };

    const onClick = (e: MouseEvent) => {
      const anchor = getLinkAnchor(e.target);
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href) return;

      e.preventDefault();
      e.stopPropagation();

      // Ctrl / Cmd: navigate immediately
      if (e.ctrlKey || e.metaKey) {
        const isInternal =
          !href.startsWith('http') && !href.startsWith('//') &&
          !href.startsWith('mailto:') && !href.startsWith('tel:');
        const internalId = isInternal
          ? useAppStore.getState().notes.find(
              (n) => n.id === href || n.title.toLowerCase() === decodeURIComponent(href).toLowerCase()
            )?.id
          : undefined;
        linkPreviewHandlerRef.current.close();
        linkPreviewHandlerRef.current.navigateLink(href, isInternal, internalId);
        return;
      }

      // Plain click: show card
      linkPreviewHandlerRef.current.open(anchor);
    };

    // Touch: single tap shows card
    const onTouchEnd = (e: TouchEvent) => {
      const anchor = getLinkAnchor(e.target);
      if (!anchor) return;
      e.preventDefault();
      linkPreviewHandlerRef.current.open(anchor);
    };

    pane.addEventListener('click', onClick, true);
    pane.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      pane.removeEventListener('click', onClick, true);
      pane.removeEventListener('touchend', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId]);

  // Close link preview on note change (card becomes stale)
  useEffect(() => {
    linkPreviewHandlerRef.current.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId]);

  // Close on container scroll (same pattern as block context menu)
  useEffect(() => {
    if (!linkPreview) return;
    const pane = editorPaneRef.current;
    if (!pane) return;
    const handler = () => linkPreviewHandlerRef.current.close();
    pane.addEventListener('scroll', handler);
    return () => pane.removeEventListener('scroll', handler);
  }, [linkPreview, editorPaneRef]);

  return { linkPreview, setLinkPreview };
}
