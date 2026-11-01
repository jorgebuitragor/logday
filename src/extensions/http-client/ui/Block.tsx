// El bloque ```http en la nota (Interfaz §1, HT4–HT16, HT20–HT25, HT30,
// HT36–HT38, HT50, HT60, bloque compacto): la
// barra de encima (`part: 'header'`) y la franja de debajo (`'footer'`).
// Son dos islas aparte dentro del NodeView; comparten el estado del store.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight, CircleAlert, PanelRight, Send, X } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { CODE_LANGUAGE_OPTIONS } from '../../../lib/codeHighlight';
import { FOCUS_RING, ICON_BTN, PANEL_TITLE, SECONDARY_CLS, SEND_BTN } from '../../../components/shared/controlClasses';
import { StatusItem } from '../../../components/shared/FormControls';
import type { NoteBlockProps } from '../../types';
import { subscribeNoteBlockRun } from '../../noteBlockEvents';
import { announce } from '../announce';
import { activeEnvironment, EXTENSION_ID, readHttpSettings } from '../core/environments';
import { setRequestMethod } from '../core/edit';
import { HTTP_METHODS, hasErrors, parseHttpBlock, requestAtOffset, requestLabel, type HttpMethod } from '../core/parse';
import { draftFromBlock } from '../core/noteSave';
import { requestTitle } from '../core/noteRequests';
import { formatElapsed, isMac, makeTr, sendShortcut } from '../core/text';
import { blockSignature, compactKey, compactSummary, initialCompact, loadCompact, moveCompact, saveCompact } from '../core/compact';
import {
  blockKey, blockState, blockedMessage, cancelBlock, dismissResult, firstError, httpApi, issueMessage, openInView, openSettings,
  readResult, requestCompactAll, resolveWith, selectRequest, sendRequest, unresolvedMessage, useHttpStore,
} from '../store';
import { CopyAsMenu } from './CopyAs';
import { EnvironmentChip } from './EnvironmentChip';
import { Menu } from './Menu';
import { ResponseView, StatusChip } from './ResponseView';
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

// ---------- Compacto ----------
// El bloque en una línea: la barra con el método, la URL y la última
// respuesta. La nota oculta el código y la franja (`NoteBlockProps.compact`);
// aquí se decide con qué arranca y se recuerda lo que el usuario elige
// (`core/compact`).

function useCompact(props: NoteBlockProps, b: Block) {
  const { compact = false, setCompact } = props;
  const sig = useMemo(() => blockSignature(props.code), [props.code]);
  // La clave solo cambia con la firma, la nota o el índice: `blockCodes`
  // recorre el documento y no hace falta en cada tecla.
  const key = useMemo(
    () => compactKey(b.noteId, props.code, props.blockCodes?.().slice(0, Math.max(0, b.index)) ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [b.noteId, b.index, sig],
  );
  const latest = useRef({ key, setCompact, noteId: b.noteId });
  latest.current = { key, setCompact, noteId: b.noteId };

  // Con qué arranca: lo elegido o la opción de Opciones. Antes de pintar,
  // para que no se vea expandido un instante. La nota decide si se puede
  // (`initial`): no si el usuario está escribiendo en el bloque. `cursor`
  // no sirve: al abrir la nota la selección queda al principio, dentro
  // del bloque si la nota empieza por uno, sin que el usuario esté ahí.
  useLayoutEffect(() => {
    if (!setCompact) return;
    if (initialCompact(loadCompact(key), b.settings.compactOnOpen)) setCompact(true, { initial: true });
  // Solo al montarse.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se editó la URL de la primera petición: lo elegido sigue al bloque.
  const prevKey = useRef(key);
  useEffect(() => {
    if (prevKey.current === key) return;
    moveCompact(prevKey.current, key);
    prevKey.current = key;
  }, [key]);

  // ⌥/Alt+clic en cualquier bloque de la nota.
  useEffect(() => httpApi.subscribe((s, prev) => {
    const all = s.compactAll;
    const mine = latest.current;
    if (!all || all === prev.compactAll || all.noteId !== mine.noteId || !mine.setCompact) return;
    saveCompact(mine.key, all.compact);
    mine.setCompact(all.compact);
  }), []);

  // Una confirmación sale en la franja: compacto no se vería.
  const confirming = b.state.confirm !== null;
  useEffect(() => {
    if (confirming && compact) setCompact?.(false);
  }, [confirming, compact, setCompact]);

  const toggle = (all: boolean) => {
    const next = !compact;
    if (all) {
      requestCompactAll(b.noteId, next);
      return;
    }
    saveCompact(key, next);
    setCompact?.(next);
  };
  return { compact, canCompact: !!setCompact, toggle };
}

function CompactToggle({ tr, compact, onToggle }: { tr: Block['tr']; compact: boolean; onToggle: (all: boolean) => void }) {
  const mac = isMac();
  const label = tr(compact ? 'expandBlock' : 'compactBlock');
  return (
    <button
      type="button"
      aria-expanded={!compact}
      aria-label={label}
      title={`${label} (${tr('compactAllTip', { mod: mac ? '⌥' : 'Alt' })})`}
      onClick={(e) => onToggle(e.altKey)}
      onKeyDown={(e) => {
        // ⌥/Alt+Enter o Espacio: todas, también con el teclado.
        if (e.altKey && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          e.stopPropagation();
          onToggle(true);
        }
      }}
      className={`-ml-1 rounded p-0.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${FOCUS_RING}`}
    >
      <ChevronRight size={13} aria-hidden className={`transition-transform duration-150 motion-reduce:transition-none ${compact ? '' : 'rotate-90'}`} />
    </button>
  );
}

/** El resumen de la barra compacta: la URL (completa en `title`) y, con
 *  varias peticiones, cuántas más. */
const summaryOf = (b: Block) => compactSummary(b.req) ?? (b.req?.name || b.tr('requestUnnamed', { n: b.selected + 1 }));

function CompactSummary({ b, withMethod }: { b: Block; withMethod: boolean }) {
  const { tr, req, parsed } = b;
  const summary = summaryOf(b);
  const more = parsed.requests.length - 1;
  return (
    <>
      <span className="min-w-0 truncate font-mono text-[11px] text-[var(--text-secondary)]" title={req?.url ? `${req.method} ${req.url}` : undefined}>
        {withMethod && req && <span className="mr-1 font-semibold text-[var(--text-primary)]">{req.method}</span>}
        {summary}
      </span>
      {more > 0 && (
        <span className="shrink-0 text-[10px] text-[var(--text-hint)]">
          <span aria-hidden>{tr('compactMore', { n: more })}</span>
          <span className="sr-only">{tr('compactMoreAria', { n: more })}</span>
        </span>
      )}
    </>
  );
}

/** La última respuesta, el envío en curso o el problema, en una línea. */
function CompactStatus({ b }: { b: Block }) {
  const { tr, state, cached, language } = b;
  if (state.inFlight) return <span className="shrink-0 text-[11px] text-[var(--text-hint)]">{tr('sending')}</span>;
  const problem = problemText(b);
  if (problem) {
    return (
      <span className="shrink-0 text-red-400" title={problem}>
        <CircleAlert size={13} aria-hidden />
        <span className="sr-only">{problem}</span>
      </span>
    );
  }
  const result = cached?.entry.value;
  if (result?.error) {
    return <span className="shrink-0 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-primary)]">{tr('compactFailed')}</span>;
  }
  const out = result?.response?.output;
  if (!out) return null;
  return (
    <span className={`flex shrink-0 items-center gap-1 text-[11px] text-[var(--text-hint)] ${cached?.stale ? 'opacity-60' : ''}`}>
      <StatusChip status={out.status} reason={out.reason} />
      <span>· {formatElapsed(out.elapsedMs, language)}</span>
      {cached?.stale && <span className="sr-only">{tr('stale')}</span>}
    </span>
  );
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
  const { compact, canCompact, toggle } = useCompact(props, b);

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

  // El método y "Copiar como…" leen el texto de ahora, no el de hace
  // 300 ms (`useDebounced`): al elegir un método se ve en el acto.
  const fresh = useMemo(() => parseHttpBlock(props.code), [props.code]);
  const freshReq = fresh.requests[Math.min(b.selected, Math.max(0, fresh.requests.length - 1))] ?? null;
  const canSetMethod = !!props.setCode && !!freshReq && !freshReq.issues.some((i) => i.code === 'missing_request_line');
  // HT60: con errores de sintaxis, "Copiar como…" queda deshabilitado.
  // Una variable que falta no lo impide: el código lleva {{nombre}}.
  const codeReq = freshReq && !hasErrors(freshReq.issues) && !hasErrors(fresh.issues) ? freshReq : null;

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

  // HT50: la petición de la barra, en la pantalla, para editarla con las
  // tablas y guardarla de vuelta. Se carga el texto de ahora (el editor lo
  // guarda al salir de la nota).
  const activeNote = useAppStore((s) => s.activeNote);
  const canEditInView = !!freshReq && !!activeNote && activeNote.id === props.noteId;
  const editInView = () => {
    if (!canEditInView || !activeNote || !freshReq) return;
    const requestIndex = fresh.requests.indexOf(freshReq);
    const loaded = draftFromBlock(props.code, requestIndex);
    if (!loaded) return;
    void openInView({
      noteId: activeNote.id,
      title: activeNote.title.trim() || tr('viewUntitled'),
      filePath: activeNote.filePath,
      blockIndex: b.index,
      requestIndex,
      label: requestTitle(freshReq),
    }, { ...loaded, name: freshReq.name });
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
        // ⌘↵ también desde la barra: en compacto el código no se ve.
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !inFlight) {
          e.preventDefault();
          send();
        }
      }}
      className={`@container/httpblock flex items-center gap-2 px-2.5 py-1.5 ${compact ? '' : 'border-b border-[var(--border)]'}`}
    >
      {canCompact && <CompactToggle tr={tr} compact={compact} onToggle={toggle} />}
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
      {compact && parsed.requests.length < 2 && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <CompactSummary b={b} withMethod={!canSetMethod} />
          <CompactStatus b={b} />
        </div>
      )}
      {parsed.requests.length >= 2 && (
        <Menu
          // En compacto el botón es el resumen: que se lea.
          label={compact ? `${tr('requestPicker')}: ${summaryOf(b)}, ${tr('compactMoreAria', { n: parsed.requests.length - 1 })}` : tr('requestPicker')}
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
            compact ? (
              <>
                <CompactSummary b={b} withMethod={!canSetMethod} />
                <ChevronDown size={11} className="shrink-0" aria-hidden />
              </>
            ) : (
              <>
                <span className="max-w-[16rem] truncate">{req ? requestLabel(req) : tr('requestUnnamed', { n: b.selected + 1 })}</span>
                <ChevronDown size={11} className="shrink-0" aria-hidden />
              </>
            )
          }
        />
      )}
      {compact && parsed.requests.length >= 2 && <CompactStatus b={b} />}
      <div className={compact && parsed.requests.length < 2 ? 'hidden' : 'flex-1'} />
      {canEditInView && (
        <button
          type="button"
          onClick={editInView}
          aria-label={tr('editInView')}
          title={tr('editInView')}
          className={`${ICON_BTN} min-h-7 min-w-7 justify-center`}
        >
          <PanelRight size={14} aria-hidden />
        </button>
      )}
      <CopyAsMenu tr={tr} req={codeReq} />
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
  // HT73: con los entornos apagados, avisa de lo que se envía tal cual.
  const unresolved = problem ? null : unresolvedMessage(tr, b.resolved);
  const result = cached?.entry.value ?? null;
  const response = result?.response ?? null;
  const error = result?.error ?? null;
  const problemId = `http-problem-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;

  const resend = (extraOpts: { insecureOnce?: boolean } = {}) =>
    void sendRequest({ noteId: b.noteId, blockIndex: b.index, code: props.code, requestIndex: b.selected, returnFocus: document.activeElement, ...extraOpts });

  const nothing = !problem && !pending && !inFlight && !response && !error && !result?.cancelled && warnings.length === 0 && !unresolved;
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
      {unresolved && <StatusItem kind="warn">{unresolved}</StatusItem>}
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
