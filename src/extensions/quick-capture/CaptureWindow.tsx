// Ventana de la captura rápida (specs/captura-rapida). Se carga sola, sin
// `App` ni el store (main.tsx): junta el texto y se lo manda a la ventana
// principal, que es la que crea la tarea o la nota (C15).
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { CheckSquare, FileText } from 'lucide-react';
import '../../App.css';
import { t } from '../../lib/i18n';
import { applyThemeToDOM } from '../../lib/theme';
import type { Theme } from '../../types/theme';
import {
  EVT_REPLY, EVT_REQUEST, EVT_SHOWN, INBOX_PROJECT, REPLY_TIMEOUT_MS, isMacPlatform, splitCapture,
  type CaptureContext, type CaptureKind, type CaptureReply, type CaptureRequest,
} from './model';

type Lang = 'es' | 'en';
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Una petición a la ventana principal, con plazo (C17). */
async function request(req: DistributiveOmit<CaptureRequest, 'id'>): Promise<CaptureReply> {
  const id = crypto.randomUUID();
  let unlisten: (() => void) | undefined;
  try {
    return await new Promise<CaptureReply>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('timeout')), REPLY_TIMEOUT_MS);
      void listen<CaptureReply>(EVT_REPLY, ({ payload }) => {
        if (payload.id !== id) return;
        window.clearTimeout(timer);
        resolve(payload);
      }).then((fn) => {
        unlisten = fn;
        return emit(EVT_REQUEST, { ...req, id });
      });
    });
  } finally {
    unlisten?.();
  }
}

const hide = () => invoke('quick_capture_hide').catch(() => {});

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; text: string } | { kind: 'error'; text: string };

function CaptureForm() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('language') as Lang) || 'es');
  const [ctx, setCtx] = useState<CaptureContext | null>(null);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<CaptureKind>('task');
  const [target, setTarget] = useState(INBOX_PROJECT);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const textRef = useRef<HTMLTextAreaElement>(null);
  // El tipo y el destino se toman del panel la primera vez; después, se
  // respeta lo que el usuario cambió en la ventana mientras haya borrador.
  const touched = useRef(false);

  const loadContext = useCallback(async () => {
    try {
      const reply = await request({ type: 'context' });
      if (!reply.ok || !reply.context) return;
      const next = reply.context;
      setCtx(next);
      setLang(next.language);
      applyThemeToDOM(next.theme, false, next.customThemes);
      if (!touched.current) {
        setKind(next.defaults.kind);
        setTarget(next.defaults.kind === 'task' ? next.defaults.project : next.defaults.folder);
      }
    } catch {
      // Sin respuesta: se puede escribir igual, y guardar avisa (C17).
    }
  }, []);

  useEffect(() => {
    applyThemeToDOM((localStorage.getItem('theme') as Theme) || 'system');
    const focus = () => window.setTimeout(() => textRef.current?.focus(), 0);
    focus();
    void loadContext();
    const unlisten = listen(EVT_SHOWN, () => {
      setStatus((s) => (s.kind === 'saved' ? { kind: 'idle' } : s));
      focus();
      void loadContext();
    });
    return () => void unlisten.then((fn) => fn());
  }, [loadContext]);

  const changeKind = (next: CaptureKind) => {
    touched.current = true;
    setKind(next);
    setTarget(next === 'task' ? ctx?.defaults.project ?? INBOX_PROJECT : ctx?.defaults.folder ?? '');
  };

  const save = async (open: boolean) => {
    if (status.kind === 'saving') return;
    const parts = splitCapture(text);
    if (!parts) return; // C14
    if (ctx && !ctx.configured) return; // C18
    setStatus({ kind: 'saving' });
    try {
      const reply = await request({ type: 'save', kind, title: parts.title, content: parts.content, target, open });
      if (!reply.ok) {
        setStatus({ kind: 'error', text: `${t(lang, 'quickCapture', 'saveError')}: ${reply.error}` });
        return;
      }
      setText('');
      touched.current = false;
      if (open) {
        // La ventana principal ya la ocultó y se mostró (C13).
        setStatus({ kind: 'idle' });
        return;
      }
      const msg = kind === 'task' ? 'savedTask' : 'savedNote';
      setStatus({ kind: 'saved', text: t(lang, 'quickCapture', msg).replace('{where}', reply.where ?? '') });
      // C16: confirma un momento antes de ocultarse.
      window.setTimeout(() => {
        void hide();
        setStatus((s) => (s.kind === 'saved' ? { kind: 'idle' } : s));
      }, 900);
    } catch {
      setStatus({ kind: 'error', text: t(lang, 'quickCapture', 'noReply') });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      void hide(); // C10: el borrador se queda
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.target === textRef.current) {
      e.preventDefault();
      void save(e.metaKey || e.ctrlKey);
    }
  };

  const mac = isMacPlatform();
  const options = kind === 'task'
    ? (ctx?.projects ?? [INBOX_PROJECT]).map((p) => ({ value: p, label: p }))
    : [{ value: '', label: t(lang, 'quickCapture', 'rootFolder') }, ...(ctx?.folders ?? []).map((f) => ({ value: f, label: f }))];
  if (!options.some((o) => o.value === target)) options.unshift({ value: target, label: target || t(lang, 'quickCapture', 'rootFolder') });

  const kindBtn = (value: CaptureKind, Icon: typeof CheckSquare, label: string) => (
    <button
      type="button"
      onClick={() => changeKind(value)}
      aria-pressed={kind === value}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        kind === value
          ? 'bg-indigo-500/15 text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  );

  return (
    <div
      className="flex h-screen w-full flex-col gap-2 overflow-hidden border border-[var(--border-card)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)]"
      onKeyDown={onKeyDown}
    >
      {ctx && !ctx.configured ? (
        <p className="m-auto text-center text-sm text-[var(--text-secondary)]">{t(lang, 'quickCapture', 'notConfigured')}</p>
      ) : (
        <>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (status.kind === 'error') setStatus({ kind: 'idle' });
            }}
            placeholder={t(lang, 'quickCapture', kind === 'task' ? 'placeholderTask' : 'placeholderNote')}
            aria-label={t(lang, 'quickCapture', 'textLabel')}
            className="min-h-0 flex-1 resize-none bg-transparent text-sm leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:outline-none"
            spellCheck
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1" role="group" aria-label={t(lang, 'quickCapture', 'kindLabel')}>
              {kindBtn('task', CheckSquare, t(lang, 'quickCapture', 'kindTask'))}
              {kindBtn('note', FileText, t(lang, 'quickCapture', 'kindNote'))}
            </div>
            <select
              value={target}
              onChange={(e) => {
                touched.current = true;
                setTarget(e.target.value);
              }}
              aria-label={t(lang, 'quickCapture', kind === 'task' ? 'projectLabel' : 'folderLabel')}
              className="max-w-[12rem] truncate rounded-md border border-[var(--border-card)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:border-indigo-500 focus:outline-none"
            >
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p
              className={`ml-auto truncate text-[11px] ${status.kind === 'error' ? 'text-red-400' : 'text-[var(--text-hint)]'}`}
              role="status"
            >
              {status.kind === 'saved' || status.kind === 'error'
                ? status.text
                : status.kind === 'saving'
                  ? t(lang, 'quickCapture', 'saving')
                  : t(lang, 'quickCapture', mac ? 'hintMac' : 'hintOther')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** C21: un error aquí no toca la ventana principal; solo se ve el aviso. */
class CaptureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[captura rápida]', err);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const lang = (localStorage.getItem('language') as Lang) || 'es';
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-surface)] p-4 text-center text-sm text-[var(--text-secondary)]">
        {t(lang, 'quickCapture', 'crashed')}
      </div>
    );
  }
}

export default function CaptureWindow() {
  return (
    <CaptureBoundary>
      <CaptureForm />
    </CaptureBoundary>
  );
}
