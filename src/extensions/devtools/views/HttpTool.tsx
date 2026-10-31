// Cliente HTTP en DevTools (specs/cliente-http HT27, HT28, design A10 e
// Interfaz §3): una petición sin guardar, con el entorno activo. Es de la
// extensión Cliente HTTP, que lleva su aviso de R6; DevTools solo la
// muestra con las dos activas. El formulario se convierte en el texto de un
// bloque ```http y se envía con el mismo motor que los bloques de las
// notas: el mismo parser, la misma resolución de variables, los mismos
// límites y las mismas confirmaciones (entorno protegido, host ajeno).
// Lo escrito vive en la memoria de DevTools (D9) y la respuesta en la caché
// del Cliente HTTP; nada va a disco.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Globe, Send, X } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { SEND_BTN } from '../../../components/shared/controlClasses';
import { activeEnvironment, EXTENSION_ID, readHttpSettings } from '../../http-client/core/environments';
import { HTTP_METHODS, parseHttpBlock, type HttpMethod, type ParseIssue } from '../../http-client/core/parse';
import { bodySplitsRequest, formFromBlock, formIssues, isHttpMethod, serializeForm, type HttpForm } from '../../http-client/core/serialize';
import { makeTr as makeHttpTr, sendShortcut, type Tr as HttpTr } from '../../http-client/core/text';
import {
  DEVTOOLS_KEY, DEVTOOLS_NOTE_ID, blockState, blockedMessage, cancelBlock, firstError, issueMessage, openSettings,
  readDevtoolsResult, resetDevtoolsSlot, resolveWith, sendRequest, useHttpStore, type SendOptions,
} from '../../http-client/store';
import { EnvironmentChip } from '../../http-client/ui/EnvironmentChip';
import { ResponseView, type ResponseTab } from '../../http-client/ui/ResponseView';
import { ConfirmBox, SendFailure, SendProgress, TEXT_LINK, useDebounced, useNow } from '../../http-client/ui/SendStatus';
import { draftKey, getDraft, onClearDrafts, setDraft } from '../model';
import { useDevtools } from '../ui/context';
import { IconButton, PanelHeader, StatusItem, useFieldId } from '../ui/controls';
import { useDraft, useFocusOnOpen, useToolActions } from '../ui/hooks';
import { SavedInline, SaveButton, useSaveToNote } from '../ui/OutputPanel';
import { ToolFrame } from '../ui/ToolFrame';
import { INPUT_CLS, NO_AUTOCORRECT, PANEL_TITLE, SECONDARY_CLS, lineInputCls, textareaCls } from '../ui/classes';
import { CommonStatus } from '../ui/TextTool';

const TABS: readonly ResponseTab[] = ['body', 'headers', 'request'];

// "Vaciar todas las herramientas" y la parada de DevTools borran también la
// respuesta, que vive en la caché del Cliente HTTP (A10).
onClearDrafts(resetDevtoolsSlot);

/** "Traer de una nota" deja el bloque en el borrador `http:input`: se pasa
 *  al formulario (la primera petición). Devuelve cuántas tenía el bloque.
 *  Se puede llamar dos veces (StrictMode): lee lo mismo y escribe lo mismo. */
function applyPendingLoad(): number | null {
  const code = getDraft(draftKey('http'));
  if (!code) return null;
  const loaded = formFromBlock(code);
  if (!loaded) return null;
  setDraft(draftKey('http', 'method'), loaded.form.method);
  setDraft(draftKey('http', 'url'), loaded.form.url);
  setDraft(draftKey('http', 'headers'), loaded.form.headers);
  setDraft(draftKey('http', 'body'), loaded.form.body);
  return loaded.count;
}

/** El texto de un problema, con la línea relativa a su campo (Interfaz §3). */
function fieldIssueText(htr: HttpTr, issue: ParseIssue, fieldOf: ReturnType<typeof serializeForm>['fieldOf']): string {
  return issueMessage(htr, { ...issue, line: fieldOf(issue.line).line });
}

export default function HttpTool() {
  const { tr, language, mac, announce, copyText, loadedFrom } = useDevtools();
  const htr = useMemo(() => makeHttpTr(language), [language]);
  // Antes que los borradores: así los campos ya nacen con el bloque traído.
  const [loadedCount] = useState(applyPendingLoad);
  useEffect(() => {
    setDraft(draftKey('http'), '');
  }, []);

  const [methodRaw, setMethod] = useDraft('http', 'method');
  const [url, setUrl] = useDraft('http', 'url');
  const [headers, setHeaders] = useDraft('http', 'headers');
  const [body, setBody] = useDraft('http', 'body');
  const method: HttpMethod = isHttpMethod(methodRaw) ? methodRaw : 'GET';
  const form = useMemo<HttpForm>(() => ({ method, url, headers, body }), [method, url, headers, body]);

  // Lo que se envía sale de lo escrito ahora; los errores se muestran con
  // una pausa, para no parpadear mientras se escribe (como el bloque).
  const current = useMemo(() => serializeForm(form), [form]);
  const shownForm = useDebounced(form, 300);
  const shown = useMemo(() => serializeForm(shownForm), [shownForm]);
  const shownParsed = useMemo(() => parseHttpBlock(shown.code), [shown]);
  const currentSource = useMemo(() => parseHttpBlock(current.code).requests[0]?.source ?? null, [current]);

  const raw = useAppStore((s) => s.extensions[EXTENSION_ID]?.settings);
  const env = activeEnvironment(readHttpSettings(raw));
  const state = useHttpStore((s) => blockState(s, DEVTOOLS_KEY));
  useHttpStore((s) => s.rev);

  const hasUrl = shownForm.url.trim() !== '';
  const req = shownParsed.requests[0];
  const split = bodySplitsRequest(shownForm);
  const issue = hasUrl && !split ? firstError(formIssues(shownParsed.issues), req) : null;
  const issueField = issue ? shown.fieldOf(issue.line).field : null;
  const resolved = hasUrl && req && !issue && !split ? resolveWith(req, env) : null;
  const blocked = resolved ? blockedMessage(htr, resolved, env) : null;
  const problem = split ? htr('toolBodySeparator') : issue ? fieldIssueText(htr, issue, shown.fieldOf) : blocked;
  const missingVars = !!resolved && !resolved.ok && (resolved.missing.length > 0 || resolved.emptySecrets.length > 0);
  const warnings = hasUrl && !issue ? (req?.issues ?? []).filter((i) => i.severity === 'warn') : [];
  const disabled = !hasUrl || !!problem;

  const inFlight = state.inFlight;
  const pending = state.confirm;
  const now = useNow(inFlight ? 1000 : 60_000);
  const result = readDevtoolsResult(currentSource);
  const response = result?.entry.response ?? null;
  const error = result?.entry.error ?? null;
  const [tab, setTab] = useState<ResponseTab>('body');

  const urlRef = useRef<HTMLInputElement>(null);
  useFocusOnOpen(urlRef, 'input');
  const problemId = useFieldId('http-problem');
  const headersId = useFieldId('http-headers');
  const bodyId = useFieldId('http-body');
  const headBodyId = useFieldId('http-head-body');

  const sendWith = (extra: Partial<SendOptions> = {}) =>
    void sendRequest({
      noteId: DEVTOOLS_NOTE_ID,
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
      announce(htr('aFailed', { message: htr('toolUrlEmpty') }));
      urlRef.current?.focus();
      return;
    }
    // Con lo escrito ahora, no con lo que se muestra (que va 300 ms atrás).
    if (bodySplitsRequest(form)) {
      announce(htr('aFailed', { message: htr('toolBodySeparator') }));
      return;
    }
    const parsed = parseHttpBlock(current.code);
    const fresh = firstError(formIssues(parsed.issues), parsed.requests[0]);
    if (fresh) {
      announce(htr('aFailed', { message: fieldIssueText(htr, fresh, current.fieldOf) }));
      return;
    }
    sendWith();
  };

  const clear = () => {
    setMethod('');
    setUrl('');
    setHeaders('');
    setBody('');
    resetDevtoolsSlot();
    setTab('body');
    urlRef.current?.focus();
  };

  // "Guardar en una nota": el bloque con lo escrito, con las variables como
  // {{nombre}}; nunca sus valores ni los de los secretos (HT18).
  const saver = useSaveToNote('http', form.url.trim() ? current.code : null);
  const bodyText = response?.output.body.kind === 'text' ? response.output.body.text : null;
  const empty = !url && !headers && !body && method === 'GET' && !response && !error;

  useToolActions({
    primary: send,
    copy: bodyText !== null ? () => void copyText(bodyText) : undefined,
    save: () => void saver.save(),
    clear,
    tab: response ? (index) => index < TABS.length && setTab(TABS[index]) : undefined,
  });

  return (
    <ToolFrame
      bodyClass="flex flex-col gap-4 px-5 py-4"
      headerExtra={<EnvironmentChip />}
      notice={
        <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-hint)]">
          <Globe size={11} className="shrink-0" aria-hidden />
          {htr('toolNotice')}
        </p>
      }
    >
      <div
        className="flex flex-col gap-4"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && inFlight) {
            e.preventDefault();
            cancelBlock(DEVTOOLS_KEY);
          }
        }}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <PanelHeader title={htr('toolRequest')}>
            <IconButton icon={Eraser} label={tr('clear')} shortcut="mod+shift+backspace" disabled={empty} onClick={clear} />
            <SaveButton disabled={!saver.can} onSave={() => void saver.save()} />
          </PanelHeader>
          {saver.saved && <SavedInline note={saver.saved} />}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={htr('toolMethod')}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={`${INPUT_CLS} w-28 font-mono font-semibold`}
            >
              {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input
              ref={urlRef}
              type="text"
              aria-label={htr('toolUrl')}
              aria-invalid={issueField === 'url' || undefined}
              aria-describedby={issueField === 'url' ? problemId : undefined}
              placeholder={tr('http.placeholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
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
              <button type="button" onClick={() => cancelBlock(DEVTOOLS_KEY)} className={`${SECONDARY_CLS} py-1`}>
                <X size={13} aria-hidden />
                {htr('cancel')}
              </button>
            ) : (
              <button
                type="button"
                onClick={send}
                aria-disabled={disabled || undefined}
                aria-describedby={problem ? problemId : undefined}
                title={htr('sendTitle', { shortcut: sendShortcut(mac) })}
                className={SEND_BTN}
              >
                <Send size={13} aria-hidden />
                {htr('send')}
                <kbd className="hidden text-[10px] opacity-80 @md/tool:inline">{sendShortcut(mac)}</kbd>
              </button>
            )}
          </div>
          <div className="grid gap-4 @3xl/tool:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={headersId} className={PANEL_TITLE}>{htr('toolHeaders')}</label>
              <textarea
                id={headersId}
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                placeholder={htr('toolHeadersPlaceholder')}
                aria-invalid={issueField === 'headers' || undefined}
                aria-describedby={issueField === 'headers' ? problemId : undefined}
                className={textareaCls(issueField === 'headers', 'min-h-[7rem] h-[20vh]')}
                {...NO_AUTOCORRECT}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={bodyId} className={PANEL_TITLE}>{htr('toolBody')}</label>
              <textarea
                id={bodyId}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={htr('toolBodyPlaceholder')}
                disabled={method === 'HEAD'}
                aria-invalid={issueField === 'body' || split || undefined}
                aria-describedby={method === 'HEAD' ? headBodyId : issueField === 'body' || split ? problemId : undefined}
                className={`${textareaCls(issueField === 'body' || split, 'min-h-[7rem] h-[20vh]')} disabled:cursor-not-allowed disabled:opacity-50`}
                {...NO_AUTOCORRECT}
              />
              {method === 'HEAD' && <p id={headBodyId} className="text-[11px] text-[var(--text-hint)]">{htr('headWithBody')}</p>}
            </div>
          </div>
        </div>

        {(problem || pending || inFlight || error || result?.entry.cancelled || warnings.length > 0 || loadedFrom) && (
          <div className="flex flex-col gap-2">
            <CommonStatus cut={false} />
            {loadedFrom && loadedCount !== null && loadedCount > 1 && (
              <StatusItem kind="info">{htr('toolLoadedMulti', { n: loadedCount })}</StatusItem>
            )}
            {problem && !pending && (
              <div id={problemId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusItem kind={issue || split ? 'error' : 'warn'}>{problem}</StatusItem>
                {missingVars && (
                  <button type="button" onClick={() => openSettings(env?.id ?? null)} className={TEXT_LINK}>
                    {htr('defineInSettings')}
                  </button>
                )}
              </div>
            )}
            {pending && (
              <ConfirmBox
                tr={htr}
                blockId={DEVTOOLS_KEY}
                pending={pending}
                onSend={() => sendWith({
                  confirmed: true,
                  allowUntrusted: pending.reasons.some((r) => r.kind === 'untrusted_host'),
                  returnFocus: pending.returnFocus,
                })}
              />
            )}
            {inFlight && <SendProgress tr={htr} startedAt={inFlight.startedAt} now={now} />}
            {error && !inFlight && <SendFailure tr={htr} error={error} insecureEnv={!!env?.insecureTls} onRetry={sendWith} />}
            {result?.entry.cancelled && !inFlight && <StatusItem kind="info">{htr('err.cancelled')}</StatusItem>}
            {warnings.map((w) => <StatusItem key={w.code} kind="info">{issueMessage(htr, w)}</StatusItem>)}
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-2">
          <h3 className={PANEL_TITLE}>{htr('toolResponse')}</h3>
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
              {htr('toolEmpty')}
            </p>
          )}
        </div>
      </div>
    </ToolFrame>
  );
}
