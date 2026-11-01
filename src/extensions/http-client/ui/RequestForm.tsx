// El editor de la pantalla Cliente HTTP (specs/cliente-http HT33, HT40–HT43,
// HT50, design §14.4): método y URL, las pestañas Params, Cabeceras, Auth,
// Cuerpo y Texto, el entorno activo y la respuesta. Lo que se edita es el
// texto de la petición (el borrador del store): las pestañas son vistas de
// ese texto y cada cambio reescribe solo sus líneas (`requestEdit.ts`). Se
// envía con el mismo motor que los bloques de las notas: el mismo parser,
// la misma resolución de variables, los mismos límites y las mismas
// confirmaciones. Lo escrito y la respuesta viven en memoria; la nota de
// la que vino solo cambia con "Guardar en la nota" (HT50).
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, CodeXml, FilePlus, Globe, Save, Send, X } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import type { Note } from '../../../types/note';
import type { Language } from '../../../lib/i18n';
import { formatFence } from '../../../lib/fencedBlocks';
import { ICON_BTN, PANEL_TITLE, SECONDARY_CLS, SEND_BTN } from '../../../components/shared/controlClasses';
import { StatusItem } from '../../../components/shared/FormControls';
import { lineInputCls } from '../../devtools/ui/classes';
import { activeEnvironment, EXTENSION_ID, readHttpSettings } from '../core/environments';
import { HTTP_METHODS, parseHttpBlock } from '../core/parse';
import { fromCurl } from '../core/curl';
import { requestForCode } from '../core/codegen';
import { readRequestLine, writeRequestLine } from '../core/requestEdit';
import { draftSplitsRequest, formIssues } from '../core/serialize';
import { localeOf, saveShortcut, sendShortcut, type Tr } from '../core/text';
import { announce } from '../announce';
import { notifyCurlConverted } from '../paste';
import {
  blockState, blockedMessage, cancelBlock, currentDraft, dismissConflict, firstError, formKey, formNoteId, isDirty,
  issueMessage, openSettings, readFormResult, resolveWith, saveDraftToNote, sendRequest, setDraftCode, useHttpStore, type SendOptions,
} from '../store';
import { CodePanel, CopyAsMenu } from './CopyAs';
import { EnvironmentChip } from './EnvironmentChip';
import { LiveInput } from './KeyValueTable';
import { FIELD_BTN, Menu } from './Menu';
import { ResponseView, type ResponseTab } from './ResponseView';
import { ConfirmBox, SendFailure, SendProgress, TEXT_LINK, useDebounced, useNow } from './SendStatus';
import { OriginLine, zoneErrors, type RequestTab } from './RequestParts';
import { RequestTabs } from './RequestTabs';

export type { RequestTab };

const shortDateTime = (ms: number, language: Language) =>
  new Intl.DateTimeFormat(localeOf(language), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));

/** "Nueva nota": una nota nueva en la raíz con el bloque, con las variables
 *  como {{nombre}}; nunca sus valores ni los de los secretos (HT18). La
 *  cerca se alarga si el cuerpo trae comillas invertidas. */
export function saveRequestAsNote(title: string, code: string): Promise<Note> {
  return useAppStore.getState().createNoteWith({ title, content: formatFence('http', code) });
}

export function RequestForm({
  tr, mac, loadedError, onOpenNote, onSaved, initialTab = 'params',
}: {
  tr: Tr;
  mac: boolean;
  /** El primer error que tiene la petición en su nota, si lo tiene. */
  loadedError: string | null;
  onOpenNote: (target: { filePath: string; noteId: string }) => void;
  /** Tras escribir una nota, para que la columna la muestre. */
  onSaved: () => void;
  /** La pestaña con la que abre (las pruebas dibujan cada una). */
  initialTab?: RequestTab;
}) {
  const language = useAppStore((s) => s.language);
  const showToast = useAppStore((s) => s.showToast);
  const draft = useHttpStore((s) => currentDraft(s));
  const origin = useHttpStore((s) => s.origin);
  const key = formKey(origin);
  const state = useHttpStore((s) => blockState(s, key));
  useHttpStore((s) => s.rev);

  const code = draft.code;
  const dirty = isDirty(draft);
  // Las tablas leen el texto de ahora; los errores se muestran con una
  // pausa, para no parpadear mientras se escribe (como el bloque).
  const parsed = useMemo(() => parseHttpBlock(code), [code]);
  const req = parsed.requests[0];
  const line = useMemo(() => readRequestLine(code), [code]);
  const shownCode = useDebounced(code, 300);
  const shownParsed = useMemo(() => parseHttpBlock(shownCode), [shownCode]);
  const currentSource = req?.source ?? null;

  const raw = useAppStore((s) => s.extensions[EXTENSION_ID]?.settings);
  const env = activeEnvironment(readHttpSettings(raw));

  const hasUrl = readRequestLine(shownCode).url.trim() !== '';
  const shownReq = shownParsed.requests[0];
  const split = draftSplitsRequest(shownCode);
  const issue = hasUrl && !split ? firstError(formIssues(shownParsed.issues), shownReq) : null;
  const resolved = hasUrl && shownReq && !issue && !split ? resolveWith(shownReq, env) : null;
  const blocked = resolved ? blockedMessage(tr, resolved, env) : null;
  const problem = split ? tr('toolBodySeparator') : issue ? issueMessage(tr, issue) : blocked;
  const missingVars = !!resolved && !resolved.ok && (resolved.missing.length > 0 || resolved.emptySecrets.length > 0);
  const warnings = hasUrl && !issue ? (shownReq?.issues ?? []).filter((i) => i.severity === 'warn') : [];
  const disabled = !hasUrl || !!problem;
  const zones = zoneErrors(req);

  const inFlight = state.inFlight;
  const pending = state.confirm;
  const now = useNow(inFlight ? 1000 : 60_000);
  const result = readFormResult(origin, currentSource);
  const response = result?.entry.response ?? null;
  const error = result?.entry.error ?? null;
  const [tab, setTab] = useState<ResponseTab>('body');
  const [reqTab, setReqTab] = useState<RequestTab>(initialTab);
  const [saved, setSaved] = useState<{ note: Note; code: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // HT60 y HT61: "Copiar como…" usa lo escrito ahora; el panel "Código",
  // lo de hace 300 ms, para no saltar a "con errores" a cada tecla.
  const [codeOpen, setCodeOpen] = useState(false);
  const copyReq = useMemo(() => (line.url.trim() && !draftSplitsRequest(code) ? requestForCode(code) : null), [line, code]);
  const codeReq = useMemo(() => (hasUrl && !split ? requestForCode(shownCode) : null), [hasUrl, split, shownCode]);

  const urlRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const uid = useId().replace(/:/g, '');
  const problemId = `http-problem-${uid}`;

  const edit = (next: string) => {
    if (next !== code) setDraftCode(next);
  };
  const codeId = `http-code-${uid}`;

  const sendWith = (extra: Partial<SendOptions> = {}) =>
    void sendRequest({
      noteId: formNoteId(origin),
      blockIndex: 0,
      code,
      requestIndex: 0,
      returnFocus: document.activeElement,
      ...extra,
    });

  /** HT3: solo con Enviar, ⌘↵, Enter en la URL o una confirmación. */
  const send = () => {
    if (inFlight) return;
    if (!line.url.trim()) {
      announce(tr('aFailed', { message: tr('toolUrlEmpty') }));
      urlRef.current?.focus();
      return;
    }
    // Con lo escrito ahora, no con lo que se muestra (que va 300 ms atrás).
    if (draftSplitsRequest(code)) {
      announce(tr('aFailed', { message: tr('toolBodySeparator') }));
      return;
    }
    const fresh = firstError(formIssues(parsed.issues), req);
    if (fresh) {
      announce(tr('aFailed', { message: issueMessage(tr, fresh) }));
      return;
    }
    sendWith();
  };

  const canCreate = line.url.trim() !== '';
  const createNote = async () => {
    if (!canCreate) return;
    const title = tr('noteTitle', { date: shortDateTime(Date.now(), language) });
    try {
      const note = await saveRequestAsNote(title, code);
      setSaved({ note, code });
      showToast({
        kind: 'success',
        title: tr('noteCreated'),
        description: title,
        action: { label: tr('noteOpen'), onClick: () => onOpenNote({ filePath: note.filePath, noteId: note.id }) },
      });
      announce(tr('noteCreatedLive', { title }));
      onSaved();
    } catch {
      showToast({ kind: 'error', title: tr('noteCreateError') });
    }
  };
  const savedNote = saved && saved.code === code ? saved.note : null;

  /** HT50: "Guardar en la nota" (⌘S) y las dos salidas del conflicto. */
  const saveToNote = async (mode: 'replace' | 'force' | 'append') => {
    if (!origin || saving) return;
    if (draftSplitsRequest(code)) {
      showToast({ kind: 'error', title: tr('saveToNoteError'), description: tr('toolBodySeparator') });
      return;
    }
    if (parsed.requests.length !== 1) {
      showToast({ kind: 'error', title: tr('saveToNoteError'), description: tr('saveNoRequest') });
      return;
    }
    setSaving(true);
    const r = await saveDraftToNote(mode, tr('noteTitle', { date: shortDateTime(Date.now(), language) }));
    setSaving(false);
    if (r === 'saved' || r === 'new_note') {
      const title = r === 'saved' ? tr('savedToNote') : tr('savedAsNewNote');
      showToast({ kind: 'success', title });
      announce(title);
      onSaved();
    } else if (r === 'conflict') {
      announce(tr('conflictTitle'));
    } else if (r === 'open') {
      showToast({ kind: 'error', title: tr('saveToNoteError'), description: tr('saveNoteOpen') });
    } else if (r === 'missing') {
      showToast({ kind: 'error', title: tr('saveToNoteError'), description: tr('viewOpenNoteError') });
    } else {
      showToast({ kind: 'error', title: tr('saveToNoteError') });
    }
  };

  /** "Ir al texto": la pestaña Texto, con el cursor en la línea del error. */
  const goToText = (issueLine?: number) => {
    setReqTab('text');
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      if (issueLine) {
        const lines = el.value.split('\n');
        const start = lines.slice(0, issueLine - 1).reduce((n, l) => n + l.length + 1, 0);
        el.setSelectionRange(start, start + (lines[issueLine - 1]?.length ?? 0));
      }
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && inFlight) {
      e.preventDefault();
      cancelBlock(key);
      return;
    }
    const mod = mac ? e.metaKey : e.ctrlKey;
    // ⌘↵ (Ctrl+Enter fuera de macOS) envía desde cualquier campo.
    if (e.key === 'Enter' && mod && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      send();
      return;
    }
    // ⌘S: "Guardar en la nota" (HT50), si viene de una y tiene cambios.
    if (e.key.toLowerCase() === 's' && mod && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      if (origin && dirty) void saveToNote('replace');
    }
  };

  return (
    <div className="flex min-w-0 flex-col" onKeyDown={onKeyDown}>
      <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
            <Globe size={16} aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="http-view-title" className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {origin ? origin.label : tr('viewNewRequest')}
            </h2>
            {origin && <OriginLine tr={tr} origin={origin} dirty={dirty} onOpenNote={onOpenNote} />}
            <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-hint)]">
              <Globe size={11} className="shrink-0" aria-hidden />
              {tr('toolNotice')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <EnvironmentChip />
        </div>
      </header>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-h-[28px] flex-wrap items-center justify-between gap-2">
            <h3 className={PANEL_TITLE}>{tr('toolRequest')}</h3>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setCodeOpen((v) => !v)}
                aria-expanded={codeOpen}
                aria-controls={codeOpen ? codeId : undefined}
                aria-label={tr('codePanel')}
                title={tr('codePanel')}
                className={ICON_BTN}
              >
                <CodeXml size={14} className="shrink-0" aria-hidden />
                <span className="hidden @sm/tool:inline">{tr('codePanel')}</span>
              </button>
              <CopyAsMenu tr={tr} req={copyReq} withLabel />
              {origin && dirty && (
                <button
                  type="button"
                  onClick={() => void saveToNote('replace')}
                  aria-disabled={saving || undefined}
                  title={`${tr('saveToThisNote')} (${saveShortcut(mac)})`}
                  className={SECONDARY_CLS}
                >
                  <Save size={13} aria-hidden />
                  {tr('saveToThisNote')}
                </button>
              )}
              <button
                type="button"
                onClick={() => void createNote()}
                disabled={!canCreate}
                aria-label={tr('newNote')}
                title={tr('newNote')}
                className={ICON_BTN}
              >
                <FilePlus size={14} className="shrink-0" aria-hidden />
                <span className="hidden @sm/tool:inline">{tr('newNote')}</span>
              </button>
            </div>
          </div>
          {draft.conflict && origin && (
            <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <p className="text-xs font-medium text-[var(--text-primary)]">{tr('conflictTitle')}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">{tr('conflictBody')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={SECONDARY_CLS} onClick={() => void saveToNote('force')}>{tr('conflictReplace')}</button>
                <button type="button" className={SECONDARY_CLS} onClick={() => void saveToNote('append')}>{tr('conflictAsNew')}</button>
                <button type="button" className={TEXT_LINK} onClick={dismissConflict}>{tr('cancel')}</button>
              </div>
            </div>
          )}
          {savedNote && (
            <span className="text-[11px] text-[var(--text-secondary)]">
              {tr('noteCreatedLive', { title: savedNote.title })} ·{' '}
              <button type="button" className={TEXT_LINK} onClick={() => onOpenNote({ filePath: savedNote.filePath, noteId: savedNote.id })}>
                {tr('viewOpenNote')}
              </button>
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Menu
              label={tr('methodPicker', { method: line.method })}
              buttonClassName={`${FIELD_BTN} w-28`}
              listClassName="min-w-[7rem]"
              items={HTTP_METHODS.map((m) => ({
                key: m,
                checked: m === line.method,
                label: <span className="font-mono font-semibold">{m}</span>,
                onSelect: () => edit(writeRequestLine(code, 0, { method: m })),
              }))}
              button={
                <>
                  <span className="font-mono font-semibold">{line.method}</span>
                  <ChevronDown size={13} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
                </>
              }
            />
            <LiveInput
              inputRef={(el) => {
                urlRef.current = el;
              }}
              aria-label={tr('toolUrl')}
              aria-describedby={issue?.line === req?.requestLine && problem ? problemId : undefined}
              placeholder={tr('toolUrlPlaceholder')}
              value={line.url}
              onValue={(v) => edit(writeRequestLine(code, 0, { url: v.trim() }))}
              onPaste={(e) => {
                // HT39c: un cURL pegado en la URL pasa a ser la petición
                // entera, con los valores sensibles ya cambiados por variables.
                const converted = fromCurl(e.clipboardData.getData('text/plain'));
                if (!converted) return;
                e.preventDefault();
                setDraftCode(converted.code, { apiKey: null });
                (e.target as HTMLInputElement).blur();
                notifyCurlConverted(converted.replaced, 'form');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              className={lineInputCls(!!issue && issue.line === req?.requestLine)}
            />
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
                aria-describedby={problem ? problemId : undefined}
                title={tr('sendTitle', { shortcut: sendShortcut(mac) })}
                className={SEND_BTN}
              >
                <Send size={13} aria-hidden />
                {tr('send')}
                <kbd className="hidden text-[10px] opacity-80 @md/tool:inline">{sendShortcut(mac)}</kbd>
              </button>
            )}
          </div>

          <RequestTabs
            tr={tr}
            code={code}
            req={req}
            env={env}
            apiKey={draft.apiKey}
            method={line.method}
            tab={reqTab}
            onTab={setReqTab}
            zones={zones}
            textInvalid={!!issue || split}
            split={split}
            describedBy={problem ? problemId : undefined}
            textRef={textRef}
            onGoToText={goToText}
          />
          {codeOpen && <CodePanel tr={tr} req={codeReq} id={codeId} />}
        </div>

        {(problem || pending || inFlight || error || result?.entry.cancelled || warnings.length > 0 || loadedError) && (
          <div className="flex flex-col gap-2">
            {loadedError && <StatusItem kind="info">{tr('viewLoadedErrors', { message: loadedError })}</StatusItem>}
            {problem && !pending && (
              <div id={problemId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusItem kind={issue || split ? 'error' : 'warn'}>{problem}</StatusItem>
                {(issue || split) && reqTab !== 'text' && (
                  <button type="button" onClick={() => goToText(issue?.line)} className={TEXT_LINK}>{tr('goToText')}</button>
                )}
                {missingVars && (
                  <button type="button" onClick={() => openSettings(env?.id ?? null)} className={TEXT_LINK}>
                    {tr('defineInSettings')}
                  </button>
                )}
              </div>
            )}
            {pending && (
              <ConfirmBox
                tr={tr}
                blockId={key}
                pending={pending}
                onSend={() => sendWith({
                  confirmed: true,
                  allowUntrusted: pending.reasons.some((r) => r.kind === 'untrusted_host'),
                  returnFocus: pending.returnFocus,
                })}
              />
            )}
            {inFlight && <SendProgress tr={tr} startedAt={inFlight.startedAt} now={now} />}
            {error && !inFlight && <SendFailure tr={tr} error={error} insecureEnv={!!env?.insecureTls} onRetry={sendWith} />}
            {result?.entry.cancelled && !inFlight && <StatusItem kind="info">{tr('err.cancelled')}</StatusItem>}
            {warnings.map((w) => <StatusItem key={w.code} kind="info">{issueMessage(tr, w)}</StatusItem>)}
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-2">
          <h3 className={PANEL_TITLE}>{tr('toolResponse')}</h3>
          {response ? (
            <ResponseView
              outcome={response}
              stale={!!result?.stale}
              dim={!!inFlight || !!error}
              previous={!!error && !inFlight}
              now={now}
              tab={tab}
              onTabChange={setTab}
            />
          ) : (
            <p className="flex min-h-[6rem] items-center justify-center rounded-lg border border-dashed border-[var(--border-card)] p-4 text-center text-xs text-[var(--text-hint)]">
              {tr('toolEmpty')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
