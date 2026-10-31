// El formulario de la pantalla Cliente HTTP (specs/cliente-http HT33,
// Interfaz §11): método, URL, cabeceras y cuerpo, el entorno activo y la
// respuesta. Se convierte en el texto de un bloque ```http y se envía con
// el mismo motor que los bloques de las notas: el mismo parser, la misma
// resolución de variables, los mismos límites y las mismas confirmaciones
// (entorno protegido, host ajeno). Lo escrito y la respuesta viven en el
// store del Cliente HTTP, en memoria; nada va a disco ni a la nota de la
// que vino la petición.
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, FilePlus, Globe, Send, X } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import type { Note } from '../../../types/note';
import type { Language } from '../../../lib/i18n';
import { formatFence } from '../../../lib/fencedBlocks';
import { ICON_BTN, PANEL_TITLE, SECONDARY_CLS, SEND_BTN } from '../../../components/shared/controlClasses';
import { StatusItem } from '../../../components/shared/FormControls';
import { NO_AUTOCORRECT, lineInputCls, textareaCls } from '../../devtools/ui/classes';
import { activeEnvironment, EXTENSION_ID, readHttpSettings } from '../core/environments';
import { HTTP_METHODS, parseHttpBlock, type ParseIssue } from '../core/parse';
import { fromCurl } from '../core/curl';
import { bodySplitsRequest, formFromBlock, formIssues, serializeForm } from '../core/serialize';
import { localeOf, sendShortcut, type Tr } from '../core/text';
import { announce } from '../announce';
import { notifyCurlConverted } from '../paste';
import {
  blockState, blockedMessage, cancelBlock, firstError, formKey, formNoteId, issueMessage, openSettings, readFormResult,
  resolveWith, sendRequest, setForm, setFormField, useHttpStore, type FormOrigin, type SendOptions,
} from '../store';
import { EnvironmentChip } from './EnvironmentChip';
import { FIELD_BTN, Menu } from './Menu';
import { ResponseView, type ResponseTab } from './ResponseView';
import { ConfirmBox, SendFailure, SendProgress, TEXT_LINK, useDebounced, useNow } from './SendStatus';

/** El texto de un problema, con la línea relativa a su campo (Interfaz §3). */
function fieldIssueText(tr: Tr, issue: ParseIssue, fieldOf: ReturnType<typeof serializeForm>['fieldOf']): string {
  return issueMessage(tr, { ...issue, line: fieldOf(issue.line).line });
}

const shortDateTime = (ms: number, language: Language) =>
  new Intl.DateTimeFormat(localeOf(language), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));

/** "Guardar en una nota": una nota nueva en la raíz con el bloque, con las
 *  variables como {{nombre}}; nunca sus valores ni los de los secretos
 *  (HT18). La cerca se alarga si el cuerpo trae comillas invertidas. */
export function saveRequestAsNote(title: string, code: string): Promise<Note> {
  return useAppStore.getState().createNoteWith({ title, content: formatFence('http', code) });
}

export function RequestForm({
  tr, mac, loadedError, onOpenNote, onSaved,
}: {
  tr: Tr;
  mac: boolean;
  /** El primer error que tiene la petición en su nota, si lo tiene. */
  loadedError: string | null;
  onOpenNote: (target: { filePath: string; noteId: string }) => void;
  /** Tras crear la nota, para que la columna la muestre. */
  onSaved: () => void;
}) {
  const language = useAppStore((s) => s.language);
  const showToast = useAppStore((s) => s.showToast);
  const form = useHttpStore((s) => s.form);
  const origin = useHttpStore((s) => s.origin);
  const key = formKey(origin);
  const state = useHttpStore((s) => blockState(s, key));
  useHttpStore((s) => s.rev);

  const { method, url, headers, body } = form;
  // Lo que se envía sale de lo escrito ahora; los errores se muestran con
  // una pausa, para no parpadear mientras se escribe (como el bloque).
  const current = useMemo(() => serializeForm(form), [form]);
  const shownForm = useDebounced(form, 300);
  const shown = useMemo(() => serializeForm(shownForm), [shownForm]);
  const shownParsed = useMemo(() => parseHttpBlock(shown.code), [shown]);
  const currentSource = useMemo(() => parseHttpBlock(current.code).requests[0]?.source ?? null, [current]);

  const raw = useAppStore((s) => s.extensions[EXTENSION_ID]?.settings);
  const env = activeEnvironment(readHttpSettings(raw));

  const hasUrl = shownForm.url.trim() !== '';
  const req = shownParsed.requests[0];
  const split = bodySplitsRequest(shownForm);
  const issue = hasUrl && !split ? firstError(formIssues(shownParsed.issues), req) : null;
  const issueField = issue ? shown.fieldOf(issue.line).field : null;
  const resolved = hasUrl && req && !issue && !split ? resolveWith(req, env) : null;
  const blocked = resolved ? blockedMessage(tr, resolved, env) : null;
  const problem = split ? tr('toolBodySeparator') : issue ? fieldIssueText(tr, issue, shown.fieldOf) : blocked;
  const missingVars = !!resolved && !resolved.ok && (resolved.missing.length > 0 || resolved.emptySecrets.length > 0);
  const warnings = hasUrl && !issue ? (req?.issues ?? []).filter((i) => i.severity === 'warn') : [];
  const disabled = !hasUrl || !!problem;

  const inFlight = state.inFlight;
  const pending = state.confirm;
  const now = useNow(inFlight ? 1000 : 60_000);
  const result = readFormResult(origin, currentSource);
  const response = result?.entry.response ?? null;
  const error = result?.entry.error ?? null;
  const [tab, setTab] = useState<ResponseTab>('body');
  const [saved, setSaved] = useState<{ note: Note; code: string } | null>(null);

  const urlRef = useRef<HTMLInputElement>(null);
  const uid = useId().replace(/:/g, '');
  const problemId = `http-problem-${uid}`;
  const headersId = `http-headers-${uid}`;
  const bodyId = `http-body-${uid}`;
  const headBodyId = `http-head-body-${uid}`;

  const sendWith = (extra: Partial<SendOptions> = {}) =>
    void sendRequest({
      noteId: formNoteId(origin),
      blockIndex: 0,
      code: current.code,
      requestIndex: 0,
      returnFocus: document.activeElement,
      ...extra,
    });

  /** HT3: solo con Enviar, ⌘↵, Enter en la URL o una confirmación. */
  const send = () => {
    if (inFlight) return;
    if (!form.url.trim()) {
      announce(tr('aFailed', { message: tr('toolUrlEmpty') }));
      urlRef.current?.focus();
      return;
    }
    // Con lo escrito ahora, no con lo que se muestra (que va 300 ms atrás).
    if (bodySplitsRequest(form)) {
      announce(tr('aFailed', { message: tr('toolBodySeparator') }));
      return;
    }
    const parsed = parseHttpBlock(current.code);
    const fresh = firstError(formIssues(parsed.issues), parsed.requests[0]);
    if (fresh) {
      announce(tr('aFailed', { message: fieldIssueText(tr, fresh, current.fieldOf) }));
      return;
    }
    sendWith();
  };

  const canSave = form.url.trim() !== '';
  const save = async () => {
    if (!canSave) return;
    const code = current.code;
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
  const savedNote = saved && saved.code === current.code ? saved.note : null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && inFlight) {
      e.preventDefault();
      cancelBlock(key);
      return;
    }
    // ⌘↵ (Ctrl+Enter fuera de macOS) envía desde cualquier campo.
    if (e.key === 'Enter' && (mac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      send();
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
            {origin && <OriginLine tr={tr} origin={origin} onOpenNote={onOpenNote} />}
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
            <button
              type="button"
              onClick={() => void save()}
              disabled={!canSave}
              aria-label={tr('saveToNote')}
              title={tr('saveToNote')}
              className={ICON_BTN}
            >
              <FilePlus size={14} className="shrink-0" aria-hidden />
              <span className="hidden @sm/tool:inline">{tr('saveToNote')}</span>
            </button>
          </div>
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
              label={tr('methodPicker', { method })}
              buttonClassName={`${FIELD_BTN} w-28`}
              listClassName="min-w-[7rem]"
              items={HTTP_METHODS.map((m) => ({
                key: m,
                checked: m === method,
                label: <span className="font-mono font-semibold">{m}</span>,
                onSelect: () => setFormField('method', m),
              }))}
              button={
                <>
                  <span className="font-mono font-semibold">{method}</span>
                  <ChevronDown size={13} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
                </>
              }
            />
            <input
              ref={urlRef}
              type="text"
              aria-label={tr('toolUrl')}
              aria-invalid={issueField === 'url' || undefined}
              aria-describedby={issueField === 'url' ? problemId : undefined}
              placeholder={tr('toolUrlPlaceholder')}
              value={url}
              onChange={(e) => setFormField('url', e.target.value)}
              onPaste={(e) => {
                // HT39: un cURL pegado en la URL rellena el formulario, con
                // los valores sensibles ya cambiados por variables.
                const converted = fromCurl(e.clipboardData.getData('text/plain'));
                const loaded = converted ? formFromBlock(converted.code) : null;
                if (!converted || !loaded) return;
                e.preventDefault();
                setForm(loaded.form);
                notifyCurlConverted(converted.replaced, 'form');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              className={lineInputCls(issueField === 'url')}
              {...NO_AUTOCORRECT}
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
          <div className="grid gap-4 @3xl/tool:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={headersId} className={PANEL_TITLE}>{tr('toolHeaders')}</label>
              <textarea
                id={headersId}
                value={headers}
                onChange={(e) => setFormField('headers', e.target.value)}
                placeholder={tr('toolHeadersPlaceholder')}
                aria-invalid={issueField === 'headers' || undefined}
                aria-describedby={issueField === 'headers' ? problemId : undefined}
                className={textareaCls(issueField === 'headers', 'min-h-[7rem] h-[20vh]')}
                {...NO_AUTOCORRECT}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={bodyId} className={PANEL_TITLE}>{tr('toolBody')}</label>
              <textarea
                id={bodyId}
                value={body}
                onChange={(e) => setFormField('body', e.target.value)}
                placeholder={tr('toolBodyPlaceholder')}
                disabled={method === 'HEAD'}
                aria-invalid={issueField === 'body' || split || undefined}
                aria-describedby={method === 'HEAD' ? headBodyId : issueField === 'body' || split ? problemId : undefined}
                className={`${textareaCls(issueField === 'body' || split, 'min-h-[7rem] h-[20vh]')} disabled:cursor-not-allowed disabled:opacity-50`}
                {...NO_AUTOCORRECT}
              />
              {method === 'HEAD' && <p id={headBodyId} className="text-[11px] text-[var(--text-hint)]">{tr('headWithBody')}</p>}
            </div>
          </div>
        </div>

        {(problem || pending || inFlight || error || result?.entry.cancelled || warnings.length > 0 || loadedError) && (
          <div className="flex flex-col gap-2">
            {loadedError && <StatusItem kind="info">{tr('viewLoadedErrors', { message: loadedError })}</StatusItem>}
            {problem && !pending && (
              <div id={problemId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusItem kind={issue || split ? 'error' : 'warn'}>{problem}</StatusItem>
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

/** "De «API» · Abrir la nota", bajo el título. */
function OriginLine({ tr, origin, onOpenNote }: { tr: Tr; origin: FormOrigin; onOpenNote: (target: { filePath: string; noteId: string }) => void }) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--text-hint)]">
      <span className="min-w-0 truncate">{tr('viewFrom', { title: origin.title })}</span>
      <span aria-hidden>·</span>
      <button type="button" className={TEXT_LINK} onClick={() => onOpenNote({ filePath: origin.filePath, noteId: origin.noteId })}>
        {tr('viewOpenNote')}
      </button>
    </p>
  );
}
