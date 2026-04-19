import { useState } from 'react';
import { flushSync } from 'react-dom';
import { X, Download, Clipboard, Check } from 'lucide-react';
import { Note } from '../types';
import { exportNote } from '../lib/exportNote';

type Format = 'md' | 'txt' | 'pdf';

interface Props {
  note: Note;
  onClose: () => void;
}

const FORMATS: { value: Format; label: string; desc: string }[] = [
  { value: 'md', label: 'Markdown', desc: '.md — con formato original' },
  { value: 'txt', label: 'Texto plano', desc: '.txt — sin formato' },
  { value: 'pdf', label: 'PDF', desc: '.pdf — documento portable' },
];

function buildText(note: Note, format: Format): string {
  if (format === 'md') return `# ${note.title}\n\n${note.content}`;
  return `${note.title}\n\n${note.content}`;
}

export function ExportModal({ note, onClose }: Props) {
  const [format, setFormat] = useState<Format>('md');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCopy = async () => {
    const text = buildText(note, format === 'pdf' ? 'txt' : format);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    flushSync(() => setSaving(true));
    try {
      await exportNote(note, format);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Exportar nota</h3>
          <button
            onClick={onClose}
            className="rounded-md p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition"
          >
            <X size={14} />
          </button>
        </div>

        {/* Nombre de la nota */}
        <p className="mb-4 truncate text-xs text-[var(--text-muted)]">
          {note.title || 'Sin título'}
        </p>

        {/* Selector de formato */}
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-hint)]">
          Formato
        </p>
        <div className="mb-5 flex flex-col gap-1.5">
          {FORMATS.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setFormat(value)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                format === value
                  ? 'border-indigo-500/60 bg-indigo-500/10 text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-card)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {/* Radio circle */}
              <span
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                  format === value ? 'border-indigo-500 bg-indigo-500' : 'border-[var(--border-card)]'
                }`}
              >
                {format === value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span>
                <span className="block text-xs font-medium">{label}</span>
                <span className="block text-[10px] text-[var(--text-hint)]">{desc}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            disabled={copied}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition disabled:opacity-60"
          >
            {copied ? <Check size={13} className="text-green-400" /> : <Clipboard size={13} />}
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            <Download size={13} />
            {saving ? 'Guardando…' : 'Guardar archivo'}
          </button>
        </div>
      </div>
    </div>
  );
}
