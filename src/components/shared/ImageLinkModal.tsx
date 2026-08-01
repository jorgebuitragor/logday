import { useState, useRef, useCallback } from 'react';
import { X, Link, Image as ImageIcon, Upload, Check } from 'lucide-react';
import { fs, pickFile } from '../../lib/invoke';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';

// ── Types ────────────────────────────────────────────────────────────────────

interface ImageModalProps {
  mode: 'image';
  onInsert: (src: string, alt?: string) => void;
  onClose: () => void;
}

interface LinkModalProps {
  mode: 'link';
  selectedText?: string;
  currentHref?: string;
  onInsert: (href: string, text?: string) => void;
  onClose: () => void;
}

export type ImageLinkModalProps = ImageModalProps | LinkModalProps;

// ── Image Modal ──────────────────────────────────────────────────────────────

function ImageModal({ onInsert, onClose }: Omit<ImageModalProps, 'mode'>) {
  const { language } = useAppStore();
  const [tab, setTab] = useState<'url' | 'file'>('url');
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [preview, setPreview] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setError('');
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image')) {
      setPreview(value);
    } else {
      setPreview('');
    }
  };

  const handleInsertUrl = () => {
    if (!url.trim()) { setError(t(language, 'extras', 'invalidUrl')); return; }
    onInsert(url.trim(), alt.trim() || undefined);
  };

  const handlePickFile = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await pickFile();
      if (result && typeof result === 'string') {
        const base64 = await fs.readBinary(result);
        const fileName = result.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'imagen';
        const src = `data:image/png;base64,${base64}`;
        setPreview(src);
        if (!alt) setAlt(fileName);
        onInsert(src, alt || fileName);
      }
    } catch (err) {
      setError(t(language, 'extras', 'loadFileError'));
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileDrop = useCallback(async (file: File) => {
    setIsLoading(true);
    setError('');
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        setPreview(src);
        const fileName = file.name.replace(/\.[^.]+$/, '');
        if (!alt) setAlt(fileName);
        onInsert(src, alt || fileName);
        setIsLoading(false);
      };
      reader.onerror = () => {
        setError(t(language, 'extras', 'readFileError'));
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError(t(language, 'extras', 'processFileError'));
      setIsLoading(false);
    }
  }, [alt, language, onInsert]);

  const handleDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };
  const handleDropZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };
  const handleDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileDrop(file);
    } else {
      setError(t(language, 'extras', 'onlyImages'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--bg-surface)] p-1">
        <button
          onClick={() => { setTab('url'); setError(''); }}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition ${
            tab === 'url'
              ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Link size={12} />
          {t(language, 'extras', 'fromUrl')}
        </button>
        <button
          onClick={() => { setTab('file'); setError(''); }}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition ${
            tab === 'file'
              ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Upload size={12} />
          {t(language, 'extras', 'localFile')}
        </button>
      </div>

      {tab === 'url' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[var(--text-hint)]">{t(language, 'extras', 'imageUrlLabel')}</label>
            <input
              autoFocus
              type="text"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleInsertUrl(); if (e.key === 'Escape') onClose(); }}
              placeholder={t(language, 'extras', 'imageUrlPlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[var(--text-hint)]">{t(language, 'extras', 'altTextLabel')}</label>
            <input
              type="text"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleInsertUrl(); if (e.key === 'Escape') onClose(); }}
              placeholder={t(language, 'extras', 'altTextPlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition"
            />
          </div>
          {preview && (
            <div className="rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--bg-surface)]">
              <img src={preview} alt={alt || 'Preview'} className="w-full max-h-40 object-contain" onError={() => setError(t(language, 'extras', 'loadFileError'))} />
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={handleInsertUrl}
            disabled={!url.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={14} />
            {t(language, 'extras', 'insertImage')}
          </button>
        </>
      ) : (
        <>
          <div
            ref={dropZoneRef}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleDropZoneDrop}
            className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 px-6 transition cursor-pointer ${
              isDraggingFile
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-hint)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]'
            }`}
            onClick={handlePickFile}
          >
            <Upload size={28} className={isDraggingFile ? 'text-indigo-400' : ''} />
            <div className="text-center">
              <p className="text-sm font-medium">
                {isDraggingFile ? t(language, 'extras', 'dropImageHere') : t(language, 'extras', 'dragOrClickImage')}
              </p>
              <p className="mt-1 text-[11px] opacity-70">{t(language, 'extras', 'imageFormats')}</p>
            </div>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-[var(--bg-surface)]/80">
                <div className="text-sm text-[var(--text-hint)]">{t(language, 'extras', 'loading')}</div>
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </>
      )}
    </div>
  );
}

// ── Link Modal ───────────────────────────────────────────────────────────────

function LinkModal({ selectedText, currentHref, onInsert, onClose }: Omit<LinkModalProps, 'mode'>) {
  const { language } = useAppStore();
  const [href, setHref] = useState(currentHref ?? '');
  const [text, setText] = useState(selectedText ?? '');
  const [error, setError] = useState('');

  const handleInsert = () => {
    const trimmed = href.trim();
    if (!trimmed) { setError(t(language, 'extras', 'invalidUrl')); return; }
    onInsert(trimmed, text.trim() || undefined);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-[var(--text-hint)]">{t(language, 'extras', 'linkUrlLabel')}</label>
        <input
          autoFocus
          type="text"
          value={href}
          onChange={(e) => { setHref(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleInsert(); if (e.key === 'Escape') onClose(); }}
          placeholder={t(language, 'extras', 'linkUrlPlaceholder')}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition"
        />
      </div>

      {!selectedText && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-[var(--text-hint)]">{t(language, 'extras', 'linkTextLabel')}</label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleInsert(); if (e.key === 'Escape') onClose(); }}
            placeholder={t(language, 'extras', 'linkTextPlaceholder')}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        {currentHref && (
          <button
            onClick={() => onInsert('', undefined)}
            className="flex-1 rounded-lg border border-red-500/30 py-2 text-sm text-red-400 transition hover:bg-red-500/10"
          >
            {t(language, 'extras', 'removeLink')}
          </button>
        )}
        <button
          onClick={handleInsert}
          disabled={!href.trim()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} />
          {currentHref ? t(language, 'extras', 'updateLink') : t(language, 'extras', 'insertLink')}
        </button>
      </div>
    </div>
  );
}

// ── Root Modal Wrapper ───────────────────────────────────────────────────────

export function ImageLinkModal(props: ImageLinkModalProps) {
  const { language } = useAppStore();
  const title = props.mode === 'image'
    ? t(language, 'extras', 'insertImage')
    : props.mode === 'link' && props.currentHref
      ? t(language, 'extras', 'editLink')
      : t(language, 'extras', 'insertLink');
  const Icon = props.mode === 'image' ? ImageIcon : Link;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={props.onClose}
      />
      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20">
              <Icon size={14} className="text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          </div>
          <button
            onClick={props.onClose}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        </div>

        {props.mode === 'image' ? (
          <ImageModal onInsert={props.onInsert} onClose={props.onClose} />
        ) : (
          <LinkModal
            selectedText={props.selectedText}
            currentHref={props.currentHref}
            onInsert={props.onInsert}
            onClose={props.onClose}
          />
        )}
      </div>
    </>
  );
}
