// El bloque ```http en la nota (Interfaz §1, HT4–HT16, HT20–HT25, HT30): la
// barra de encima (`part: 'header'`) y la franja de debajo (`'footer'`).
// Son dos islas aparte dentro del NodeView; comparten el estado del store.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, CircleAlert, RotateCw, Send, ShieldOff, TriangleAlert, X } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { FOCUS_RING, PANEL_TITLE, SECONDARY_CLS, SEND_BTN } from '../../../components/shared/controlClasses';
import { Spinner, StatusItem } from '../../../components/shared/FormControls';
import type { NoteBlockProps } from '../../types';
import { subscribeNoteBlockRun } from '../../noteBlockEvents';
import { announce } from '../announce';
import { sendErrorMessage } from '../core/api';
import { activeEnvironment, EXTENSION_ID, readHttpSettings } from '../core/environments';
import { hasErrors, parseHttpBlock, requestAtOffset, requestLabel } from '../core/parse';
import { isMac, listVars, makeTr, sendShortcut } from '../core/text';
import {
  blockKey, blockState, blockedMessage, cancelBlock, dismissConfirm, dismissResult, firstError, issueMessage, openSettings,
  readResult, resolveWith, selectRequest, sendRequest, useHttpStore, type PendingConfirm,
} from '../store';
import { EnvironmentChip } from './EnvironmentChip';
import { Menu } from './Menu';
import { ResponseView } from './ResponseView';

const GHOST_BTN = `rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] ${FOCUS_RING}`;
const TEXT_LINK = `rounded text-[11px] font-medium text-[var(--text-primary)] underline decoration-[var(--border-high)] underline-offset-2 hover:decoration-[var(--text-primary)] ${FOCUS_RING}`;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function useNow(ms: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}

/** Lo que comparten la barra y la franja de un bloque. */
function useBlock({ code, noteId = '', index = 0, cursor = null }: NoteBlockProps) {
  const language = useAppStore((s) => s.language);
  const raw = useAppStore((s) => s.extensions[EXTENSION_ID]?.settings);
  const tr = makeTr(language);
  const key = blockKey(noteId, index);
  const state = useHttpStore((s) => blockState(s, key));
  useHttpStore((s) => s.rev);
  // Los errores de sintaxis se ven mientras se escribe, sin parpadear.
  const shownCode = useDebounced(code, 300);
  const parsed = useMemo(() => parseHttpBlock(shownCode), [shownCode]);
  const count = parsed.requests.length;
  const atCursor = cursor !== null && cursor !== undefined ? requestAtOffset(parsed.requests, shownCode, cursor) : -1;
  // La selección sigue al cursor dentro del código (Interfaz §1.2).
  useEffect(() => {
    if (atCursor >= 0) selectRequest(key, atCursor);
  }, [atCursor, key]);
  const selected = Math.min(Math.max(0, atCursor >= 0 ? atCursor : state.selected), Math.max(0, count - 1));
  const req = parsed.requests[selected];
  const settings = readHttpSettings(raw);
  const env = activeEnvironment(settings);
  const resolved = req ? resolveWith(req, env) : null;
  const error = firstError(parsed.issues, req);
  const blocked = resolved && !error ? blockedMessage(tr, resolved, env) : null;
  const cached = readResult(noteId, index, selected, req);
  return { tr, language, key, noteId, index, state, parsed, req, selected, env, settings, resolved, error, blocked, cached, code };
}

type Block = ReturnType<typeof useBlock>;

function problemCount(b: Block): number {
  return [...b.parsed.issues, ...(b.req?.issues ?? [])].filter((i) => i.severity === 'error').length;
}

function problemText(b: Block): string | null {
  if (b.error) return issueMessage(b.tr, b.error);
  return b.blocked;
}

// ---------- Barra ----------

function BlockHeader(props: NoteBlockProps) {
  const b = useBlock(props);
  const { tr, state, parsed, req, key } = b;
  const rootRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ props, b });
  latest.current = { props, b };
  const mac = isMac();
  const editing = props.cursor !== null && props.cursor !== undefined;
  const inFlight = state.inFlight !== null;
  const disabled = !!b.error || !!b.blocked || !req;
  const problemId = `http-problem-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;

  // ⌘↵ dentro del código (A3.3): cada bloque atiende el suyo.
  useEffect(() => subscribeNoteBlockRun((event) => {
    const { props: p } = latest.current;
    if (event.language !== 'http') return;
    const mine = event.dom && rootRef.current
      ? event.dom.contains(rootRef.current)
      : event.noteId === p.noteId && event.index === p.index;
    if (!mine) return;
    const fresh = parseHttpBlock(p.code);
    const requestIndex = Math.max(0, requestAtOffset(fresh.requests, p.code, event.offset));
    selectRequest(blockKey(p.noteId ?? '', p.index ?? 0), requestIndex);
    // Mientras se envía, no hace nada (Interfaz §5).
    if (blockState(useHttpStore.getState(), blockKey(p.noteId ?? '', p.index ?? 0)).inFlight) return;
    void sendRequest({ noteId: p.noteId ?? '', blockIndex: p.index ?? 0, code: p.code, requestIndex, returnFocus: document.activeElement });
  }), []);

  const send = () => {
    if (disabled) {
      const msg = problemText(b);
      if (msg) announce(tr('aFailed', { message: msg }));
      return;
    }
    void sendRequest({ noteId: b.noteId, blockIndex: b.index, code: props.code, requestIndex: b.selected, returnFocus: document.activeElement });
  };

  const label = req?.name ? tr('blockLabelNamed', { name: req.name }) : tr('blockLabel');

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && inFlight) {
          e.preventDefault();
          cancelBlock(key);
        }
      }}
      className="@container/httpblock flex items-center gap-2 border-b border-[var(--border)] px-2.5 py-1.5"
    >
      <span className={`${PANEL_TITLE} font-mono`} aria-hidden>HTTP</span>
      {parsed.requests.length >= 2 && (
        <Menu
          label={tr('requestPicker')}
          items={parsed.requests.map((r, i) => ({
            key: String(i),
            checked: i === b.selected,
            srSuffix: hasErrors(r.issues) ? tr('requestHasErrors') : undefined,
            label: (
              <>
                <span className="shrink-0 font-mono text-[10px] font-semibold">{r.method}</span>
                <span className="truncate">{r.name ?? requestLabel(r).slice(r.method.length + 1)}</span>
                {hasErrors(r.issues) && <CircleAlert size={11} className="ml-auto shrink-0 text-red-400" aria-hidden />}
              </>
            ),
            onSelect: () => selectRequest(key, i),
          }))}
          button={
            <>
              <span className="max-w-[16rem] truncate">{req ? requestLabel(req) : tr('requestUnnamed', { n: b.selected + 1 })}</span>
              <ChevronDown size={11} className="shrink-0" aria-hidden />
            </>
          }
        />
      )}
      <div className="flex-1" />
      <EnvironmentChip />
      {inFlight ? (
        <button type="button" onClick={() => cancelBlock(key)} className={`${SECONDARY_CLS} py-1`}>
          <X size={13} aria-hidden />
          {tr('cancel')}
        </button>
      ) : (
        <button
          type="button"
          onClick={send}
          aria-disabled={disabled || undefined}
          aria-describedby={disabled ? problemId : undefined}
          title={tr('sendTitle', { shortcut: sendShortcut(mac) })}
          className={SEND_BTN}
        >
          <Send size={13} aria-hidden />
          {tr('send')}
          {editing && <kbd className="hidden text-[10px] opacity-80 @md/httpblock:inline">{sendShortcut(mac)}</kbd>}
        </button>
      )}
    </div>
  );
}

// ---------- Franja ----------

function ConfirmBox({ b, pending, onSend }: { b: Block; pending: PendingConfirm; onSend: () => void }) {
  const { tr } = b;
  const dontRef = useRef<HTMLButtonElement>(null);
  const textId = `http-confirm-${b.key.replace(/[^a-zA-Z0-9]/g, '-')}`;
  // Al abrirse, el foco va a "No enviar", la opción segura.
  useEffect(() => {
    dontRef.current?.focus();
  }, [pending]);
  const envName = pending.envName ?? tr('envNone');
  const protectedReason = pending.reasons.find((r) => r.kind === 'protected');
  const untrusted = pending.reasons.find((r) => r.kind === 'untrusted_host');
  return (
    <div
      role="group"
      aria-labelledby={textId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          dismissConfirm(b.key);
        }
      }}
      className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-[var(--text-primary)]"
    >
      <div id={textId} className="flex items-start gap-1.5">
        <TriangleAlert size={12} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
        <div className="space-y-0.5">
          {protectedReason && <p>{tr('confirmProtected', { method: pending.method, env: envName })}</p>}
          {untrusted && untrusted.kind === 'untrusted_host' && (
            <p>
              {untrusted.vars.length > 0
                ? tr('confirmUntrusted', { vars: listVars(tr, untrusted.vars), host: untrusted.host, env: envName })
                : tr('confirmUntrustedSecret', { host: untrusted.host, env: envName })}
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button ref={dontRef} type="button" onClick={() => dismissConfirm(b.key)} className={GHOST_BTN}>{tr('confirmDont')}</button>
        <button type="button" onClick={onSend} className={`${SECONDARY_CLS} border-amber-500/50 text-[var(--text-primary)]`}>
          {untrusted ? tr('confirmSendAnyway') : tr('confirmSendTo', { env: envName })}
        </button>
      </div>
    </div>
  );
}

function BlockFooter(props: NoteBlockProps) {
  const b = useBlock(props);
  const { tr, state, req, cached, key } = b;
  const inFlight = state.inFlight && state.inFlight.requestIndex === b.selected ? state.inFlight : null;
  const pending = state.confirm && state.confirm.requestIndex === b.selected ? state.confirm : null;
  const now = useNow(inFlight ? 1000 : 60_000);
  const problem = problemText(b);
  const extra = problemCount(b) - 1;
  const warnings = (req?.issues ?? []).filter((i) => i.severity === 'warn');
  const result = cached?.entry.value ?? null;
  const response = result?.response ?? null;
  const error = result?.error ?? null;
  const problemId = `http-problem-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;

  const resend = (extraOpts: { insecureOnce?: boolean } = {}) =>
    void sendRequest({ noteId: b.noteId, blockIndex: b.index, code: props.code, requestIndex: b.selected, returnFocus: document.activeElement, ...extraOpts });

  const nothing = !problem && !pending && !inFlight && !response && !error && !result?.cancelled && warnings.length === 0;
  if (nothing) return null;

  const missingVars = b.resolved && !b.resolved.ok && (b.resolved.missing.length > 0 || b.resolved.emptySecrets.length > 0);

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Escape' && inFlight) {
          e.preventDefault();
          cancelBlock(key);
        }
      }}
      className="flex flex-col gap-2 border-t border-[var(--border)] px-3 py-2"
    >
      {problem && !pending && (
        <div id={problemId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusItem kind={b.error ? 'error' : 'warn'}>
            {problem}
            {b.error && extra > 0 && <span className="ml-1 text-[var(--text-hint)]">{tr('moreIssues', { n: extra })}</span>}
          </StatusItem>
          {missingVars && (
            <button type="button" onClick={() => openSettings(b.env?.id ?? null)} className={TEXT_LINK}>
              {tr('defineInSettings')}
            </button>
          )}
        </div>
      )}
      {pending && (
        <ConfirmBox
          b={b}
          pending={pending}
          onSend={() => void sendRequest({
            noteId: b.noteId,
            blockIndex: b.index,
            code: props.code,
            requestIndex: pending.requestIndex,
            confirmed: true,
            allowUntrusted: pending.reasons.some((r) => r.kind === 'untrusted_host'),
            returnFocus: pending.returnFocus,
          })}
        />
      )}
      {inFlight && (
        <p className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
          <Spinner />
          {now - inFlight.startedAt >= 1000
            ? tr('sendingFor', { s: Math.floor((now - inFlight.startedAt) / 1000) })
            : tr('sending')}
        </p>
      )}
      {error && !inFlight && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusItem kind="error">
            {sendErrorMessage(tr, error.error, { envName: error.envName ?? tr('envNone'), timeoutSec: error.timeoutSec })}
          </StatusItem>
          <div className="flex gap-2">
            <button type="button" onClick={() => resend()} className={SECONDARY_CLS}>
              <RotateCw size={13} aria-hidden />
              {tr('retry')}
            </button>
            {error.error.code === 'tls' && !b.env?.insecureTls && (
              <button type="button" onClick={() => resend({ insecureOnce: true })} className={SECONDARY_CLS}>
                <ShieldOff size={13} aria-hidden />
                {tr('err.tlsRetry')}
              </button>
            )}
          </div>
        </div>
      )}
      {result?.cancelled && !inFlight && <StatusItem kind="info">{tr('err.cancelled')}</StatusItem>}
      {warnings.map((w) => <StatusItem key={w.code} kind="info">{issueMessage(tr, w)}</StatusItem>)}
      {response && (
        <ResponseView
          outcome={response}
          stale={!!cached?.stale}
          dim={!!inFlight || !!error}
          previous={!!error && !inFlight}
          onDismiss={() => dismissResult(b.noteId, b.index, b.selected)}
          now={now}
        />
      )}
    </div>
  );
}

/** El punto `NoteBlock` de la extensión: cada isla dibuja su parte. */
export default function HttpNoteBlock(props: NoteBlockProps) {
  return props.part === 'footer' ? <BlockFooter {...props} /> : <BlockHeader {...props} />;
}
