// Las pestañas del editor (specs/cliente-http HT40–HT43, design §14.4):
// Params, Cabeceras, Auth, Cuerpo y Texto, cada una una vista del texto de
// la petición. El segmentado de `ResponseView`, con `role="tablist"`,
// roving tabindex y ←/→, Inicio y Fin; cada etiqueta con su resumen.
import { useId, useRef, type KeyboardEvent, type RefObject } from 'react';
import { CircleAlert } from 'lucide-react';
import { NO_AUTOCORRECT, textareaCls } from '../../devtools/ui/classes';
import type { HttpEnvironment } from '../core/environments';
import type { HttpMethod, ParsedRequest, ParseIssue } from '../core/parse';
import {
  addHeaderRow, addQueryRow, authRow, isHeaderName, moveHeaderRow, moveQueryRow, readAuth, removeHeaderRow, removeQueryRow,
  setHeaderRow, setQueryRow, setRequestBody, toggleHeaderRow, toggleQueryRow, type AuthContext,
} from '../core/requestEdit';
import type { Tr } from '../core/text';
import { currentUserAgent, issueMessage, setDraftCode } from '../store';
import { AuthPanel, authKindLabel } from './AuthPanel';
import { KeyValueTable } from './KeyValueTable';
import { automaticHeaders, BodyArea, SEG_BTN, TAB_KEY, TABS, type RequestTab } from './RequestParts';

export function RequestTabs({
  tr, code, req, env, apiKey, method, tab: reqTab, onTab: setReqTab, zones, textInvalid, split, describedBy, textRef, onGoToText: goToText,
}: {
  tr: Tr;
  code: string;
  req: ParsedRequest | undefined;
  env: HttpEnvironment | null;
  apiKey: AuthContext['apiKey'];
  method: HttpMethod;
  tab: RequestTab;
  onTab: (tab: RequestTab) => void;
  zones: { params: ParseIssue | null; headers: ParseIssue | null };
  /** El texto tiene un error de sintaxis o una línea `###`. */
  textInvalid: boolean;
  /** Una línea `###` partiría la petición. */
  split: boolean;
  /** El id del problema que se muestra debajo. */
  describedBy?: string;
  textRef: RefObject<HTMLTextAreaElement | null>;
  onGoToText: (line?: number) => void;
}) {
  const tabRefs = useRef<Partial<Record<RequestTab, HTMLButtonElement | null>>>({});
  const uid = useId().replace(/:/g, '');
  const panelId = `http-req-panel-${uid}`;
  const headBodyId = `http-head-body-${uid}`;
  const edit = (next: string) => {
    if (next !== code) setDraftCode(next);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setReqTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  };

  const ctxSecret = (n: string) => !!env?.vars.some((v) => v.name === n && v.secret);
  const auth = req ? readAuth(req, { isSecret: ctxSecret, apiKey: apiKey }) : { kind: 'none' as const };
  const fromAuth = authRow(auth);
  const activeParams = req?.query.filter((q) => q.enabled).length ?? 0;
  const activeHeaders = req?.headerRows.filter((h) => h.enabled).length ?? 0;
  const tabError: Partial<Record<RequestTab, boolean>> = { params: !!zones.params, headers: !!zones.headers };
  const tabSummary: Partial<Record<RequestTab, string>> = {
    params: activeParams ? String(activeParams) : '',
    headers: activeHeaders ? String(activeHeaders) : '',
    auth: auth.kind !== 'none' ? `· ${authKindLabel(tr, auth.kind)}` : '',
  };

  return (
    <>
    <div role="tablist" aria-label={tr('tabsReqAria')} className="flex flex-wrap gap-1 self-start rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
      {TABS.map((t, i) => (
        <button
          key={t}
          ref={(el) => {
            tabRefs.current[t] = el;
          }}
          type="button"
          role="tab"
          id={`${panelId}-${t}`}
          aria-selected={reqTab === t}
          aria-controls={panelId}
          tabIndex={reqTab === t ? 0 : -1}
          onClick={() => setReqTab(t)}
          onKeyDown={(e) => onTabKey(e, i)}
          className={SEG_BTN(reqTab === t)}
        >
          {tr(TAB_KEY[t])}
          {tabSummary[t] && <span className="text-[var(--text-hint)]">{tabSummary[t]}</span>}
          {tabError[t] && (
            <>
              <CircleAlert size={11} className="text-red-400" aria-hidden />
              <span className="sr-only">{tr('requestHasErrors')}</span>
            </>
          )}
        </button>
      ))}
    </div>

    <div role="tabpanel" id={panelId} aria-labelledby={`${panelId}-${reqTab}`} className="min-w-0">
      {reqTab === 'params' && (
        <KeyValueTable
          tr={tr}
          caption={tr('paramsCaption')}
          rows={(req?.query ?? []).map((q, i) => ({
            name: q.name, value: q.value, enabled: q.enabled, ownLine: q.place === 'line',
            fromAuth: fromAuth?.place === 'query' && fromAuth.row === i,
          }))}
          readOnly={zones.params ? issueMessage(tr, zones.params) : null}
          onGoToText={() => goToText(zones.params?.line)}
          addLabel={tr('addParam')}
          emptyText={tr('paramsEmpty')}
          onToggle={(i) => edit(toggleQueryRow(code, 0, i))}
          onEdit={(i, row) => edit(setQueryRow(code, 0, i, row))}
          onAdd={(row) => edit(addQueryRow(code, 0, row))}
          onRemove={(i) => edit(removeQueryRow(code, 0, i))}
          onMove={(i, d) => edit(moveQueryRow(code, 0, i, d))}
        />
      )}
      {reqTab === 'headers' && (
        <KeyValueTable
          tr={tr}
          caption={tr('headersCaption')}
          rows={(req?.headerRows ?? []).map((h, i) => ({
            name: h.name, value: h.value, enabled: h.enabled, fromAuth: fromAuth?.place === 'header' && fromAuth.row === i,
          }))}
          readOnly={zones.headers ? issueMessage(tr, zones.headers) : null}
          onGoToText={() => goToText(zones.headers?.line)}
          addLabel={tr('addHeader')}
          emptyText={tr('headersEmpty')}
          autoRows={automaticHeaders(req, currentUserAgent())}
          validName={isHeaderName}
          invalidNameText={tr('rowNameInvalid')}
          onToggle={(i) => edit(toggleHeaderRow(code, 0, i))}
          onEdit={(i, row) => edit(setHeaderRow(code, 0, i, row))}
          onAdd={(row) => edit(addHeaderRow(code, 0, row))}
          onRemove={(i) => edit(removeHeaderRow(code, 0, i))}
          onMove={(i, d) => edit(moveHeaderRow(code, 0, i, d))}
        />
      )}
      {reqTab === 'auth' && (
        <AuthPanel tr={tr} code={code} req={req} env={env} apiKey={apiKey} onCode={(next, apiKey) => setDraftCode(next, { apiKey })} />
      )}
      {reqTab === 'body' && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <BodyArea
            label={tr('toolBody')}
            value={req?.body ?? ''}
            disabled={method === 'HEAD'}
            describedBy={method === 'HEAD' ? headBodyId : undefined}
            placeholder={tr('toolBodyPlaceholder')}
            invalid={split}
            onValue={(v) => edit(setRequestBody(code, 0, v))}
          />
          {method === 'HEAD' && <p id={headBodyId} className="text-[11px] text-[var(--text-hint)]">{tr('headWithBody')}</p>}
        </div>
      )}
      {reqTab === 'text' && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <textarea
            ref={textRef}
            value={code}
            onChange={(e) => setDraftCode(e.target.value)}
            aria-label={tr('textAria')}
            aria-invalid={textInvalid || undefined}
            aria-describedby={describedBy}
            placeholder={`GET ${tr('toolUrlPlaceholder')}`}
            className={textareaCls(textInvalid, 'min-h-[10rem] h-[28vh]')}
            {...NO_AUTOCORRECT}
          />
          <p className="text-[11px] text-[var(--text-hint)]">{tr('textHelp')}</p>
        </div>
      )}
    </div>
    </>
  );
}
