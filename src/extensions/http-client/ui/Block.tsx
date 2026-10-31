// El bloque ```http en la nota (Interfaz §1, HT4–HT16, HT20–HT25, HT30,
// HT36–HT38): la
// barra de encima (`part: 'header'`) y la franja de debajo (`'footer'`).
// Son dos islas aparte dentro del NodeView; comparten el estado del store.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, CircleAlert, Send, SquareTerminal, X } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { CODE_LANGUAGE_OPTIONS } from '../../../lib/codeHighlight';
import { ICON_BTN, PANEL_TITLE, SECONDARY_CLS, SEND_BTN } from '../../../components/shared/controlClasses';
import { StatusItem } from '../../../components/shared/FormControls';
import type { NoteBlockProps } from '../../types';
import { subscribeNoteBlockRun } from '../../noteBlockEvents';
import { announce } from '../announce';
import { activeEnvironment, EXTENSION_ID, readHttpSettings } from '../core/environments';
import { setRequestMethod, toCurl } from '../core/edit';
import { HTTP_METHODS, hasErrors, parseHttpBlock, requestAtOffset, requestLabel, type HttpMethod } from '../core/parse';
import { isMac, makeTr, sendShortcut } from '../core/text';
import {
  blockKey, blockState, blockedMessage, cancelBlock, dismissResult, firstError, issueMessage, openSettings,
  readResult, resolveWith, selectRequest, sendRequest, useHttpStore,
} from '../store';
import { EnvironmentChip } from './EnvironmentChip';
import { Menu } from './Menu';
import { ResponseView } from './ResponseView';
import { ConfirmBox, SendFailure, SendProgress, TEXT_LINK, useDebounced, useNow } from './SendStatus';

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

  // El método y "Copiar como cURL" leen el texto de ahora, no el de hace
  // 300 ms (`useDebounced`): al elegir un método se ve en el acto.
  const fresh = useMemo(() => parseHttpBlock(props.code), [props.code]);
  const freshReq = fresh.requests[Math.min(b.selected, Math.max(0, fresh.requests.length - 1))] ?? null;
  const canSetMethod = !!props.setCode && !!freshReq && !freshReq.issues.some((i) => i.code === 'missing_request_line');
  const [curlCopied, setCurlCopied] = useState(false);
  useEffect(() => {
    if (!curlCopied) return;
    const id = setTimeout(() => setCurlCopied(false), 1500);
    return () => clearTimeout(id);
  }, [curlCopied]);
  const curlReady = !!freshReq && !hasErrors(freshReq.issues) && !hasErrors(fresh.issues);

  // HT36: solo cambia el método en la línea de la petición de la barra.
  const changeMethod = (method: HttpMethod) => {
    const requestIndex = fresh.requests.indexOf(freshReq!);
    const next = setRequestMethod(props.code, requestIndex, method);
    if (next === props.code) return;
    props.setCode?.(next);
    // Con GET o HEAD el cuerpo se queda; el aviso de siempre sale en la
    // franja, y aquí se anuncia.
    const warn = parseHttpBlock(next).requests[requestIndex]?.issues.find((i) => i.code === 'get_with_body' || i.code === 'head_with_body');
    announce(warn ? `${tr('methodPicker', { method })}. ${issueMessage(tr, warn)}` : tr('methodPicker', { method }));
  };

  // HT38: el lenguaje del bloque, como el selector de los bloques normales.
  const changeLanguage = (value: string) => {
    if (value === 'http') return;
    const name = value === 'plaintext' ? tr('langPlain') : CODE_LANGUAGE_OPTIONS.find((o) => o.value === value)?.label ?? value;
    props.setLanguage?.(value);
    announce(tr('aLanguage', { name }));
  };

  // HT37: las variables y los secretos van como {{nombre}}.
  const copyCurl = async () => {
    if (!freshReq || !curlReady) return;
    try {
      await navigator.clipboard.writeText(toCurl(freshReq));
      setCurlCopied(true);
      announce(tr('aCurlCopied'));
    } catch {
      // Sin permiso del portapapeles: no hay nada más que hacer.
    }
  };

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
      {props.setLanguage ? (
        <Menu
          label={tr('langPicker', { name: 'HTTP' })}
          hint={tr('langHint')}
          items={CODE_LANGUAGE_OPTIONS.map((o) => ({
            key: o.value,
            checked: o.value === 'http',
            label: o.value === 'plaintext' ? tr('langPlain') : o.label,
            onSelect: () => changeLanguage(o.value),
          }))}
          button={
            <>
              <span className={`${PANEL_TITLE} font-mono`}>HTTP</span>
              <ChevronDown size={11} className="shrink-0" aria-hidden />
            </>
          }
        />
      ) : (
        <span className={`${PANEL_TITLE} font-mono`} aria-hidden>HTTP</span>
      )}
      {canSetMethod && freshReq && (
        <Menu
          label={tr('methodPicker', { method: freshReq.method })}
          items={HTTP_METHODS.map((m) => ({
            key: m,
            checked: m === freshReq.method,
            label: <span className="font-mono text-[10px] font-semibold">{m}</span>,
            onSelect: () => changeMethod(m),
          }))}
          button={
            <>
              <span className="font-mono text-[10px] font-semibold text-[var(--text-primary)]">{freshReq.method}</span>
              <ChevronDown size={11} className="shrink-0" aria-hidden />
            </>
          }
        />
      )}
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
      <button
        type="button"
        onClick={() => void copyCurl()}
        disabled={!curlReady}
        aria-label={curlCopied ? tr('copied') : tr('copyCurl')}
        title={tr('copyCurl')}
        className={`${ICON_BTN} min-h-7 min-w-7 justify-center`}
      >
        {curlCopied ? <Check size={14} className="text-emerald-400" aria-hidden /> : <SquareTerminal size={14} aria-hidden />}
      </button>
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
          tr={tr}
          blockId={b.key}
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
      {inFlight && <SendProgress tr={tr} startedAt={inFlight.startedAt} now={now} />}
      {error && !inFlight && <SendFailure tr={tr} error={error} insecureEnv={!!b.env?.insecureTls} onRetry={resend} />}
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
