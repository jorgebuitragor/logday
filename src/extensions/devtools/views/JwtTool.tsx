// JWT (specs/devtools D2, design §4): la entrada arriba y debajo, a todo
// el ancho, el estado, las fechas, la cabecera, el payload y la firma. La
// firma no se verifica: para eso hace falta la clave.
import { useMemo, useRef } from 'react';
import { Eraser, ShieldAlert } from 'lucide-react';
import { useDevtools } from '../ui/context';
import { CopyButton, EmptyOutput, IconButton, PanelHeader, StatusArea, StatusItem, useFieldId } from '../ui/controls';
import { useAnnounceError, useDebounced, useDraft, useFocusOnOpen, useToolActions } from '../ui/hooks';
import { CodeText } from '../ui/highlight';
import { errorText } from '../ui/meta';
import { localeOf, toolKey } from '../ui/text';
import { NO_AUTOCORRECT, PRE_CLS, textareaCls } from '../ui/classes';
import { CommonStatus } from '../ui/TextTool';
import { SavedInline, SaveButton, useSaveToNote } from '../ui/OutputPanel';
import { ToolFrame } from '../ui/ToolFrame';
import { decodeJwt } from '../tools/encoding';
import { formatInZone, localTimeZone, relativeTime } from '../tools/time';

const EXAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAxIiwibmFtZSI6IkFuYSBQw6lyZXoiLCJyb2wiOiJhZG1pbiIsImlhdCI6MTc2NzIyNTYwMCwiZXhwIjoxNzk4NzYxNjAwfQ.ZmlybWEtaW52ZW50YWRhLXBhcmEtZWwtZWplbXBsbw';
const CLAIMS = ['exp', 'iat', 'nbf'] as const;
const CLAIM_LABEL = { exp: 'jwtExp', iat: 'jwtIat', nbf: 'jwtNbf' } as const;

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

function utcText(ms: number) {
  return `${new Date(ms).toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

export default function JwtTool() {
  const { tr, language, copyText } = useDevtools();
  const [input, setInput, cut] = useDraft('jwt');
  const ref = useRef<HTMLTextAreaElement>(null);
  const inputId = useFieldId('jwt');
  const errorId = useFieldId('jwt-error');
  useFocusOnOpen(ref);
  const text = useDebounced(input);
  const locale = localeOf(language);

  const decoded = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const bearer = /^Bearer\s+/i.test(trimmed);
    // Los espacios y saltos de línea (de un correo o un log) no cuentan.
    const token = trimmed.replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
    return { bearer, parts: token.split('.').length, signature: token.split('.')[2] ?? '', result: decodeJwt(token) };
  }, [text]);
  const r = decoded?.result;
  const value = r?.ok ? r.value : null;
  const now = Date.now();
  const output = value ? pretty({ header: value.header, payload: value.payload }) : null;
  const saver = useSaveToNote('json', output);

  let error: string | null = null;
  if (r && !r.ok) {
    if (r.error.code === 'jwt-parts') error = decoded!.parts === 5 ? tr('jwtEncrypted') : tr('jwtParts', { n: decoded!.parts });
    else if (r.error.code === 'jwt-part-invalid') error = tr('jwtBadPart', { part: tr(r.error.detail === 'header' ? 'jwtPartHeader' : 'jwtPartPayload') });
    else error = errorText(tr, r.error);
  }
  useAnnounceError(error);

  useToolActions({
    copy: value ? () => void copyText(pretty(value.payload)) : undefined,
    save: saver.can ? () => void saver.save() : undefined,
    clear: () => {
      setInput('');
      ref.current?.focus();
    },
  });

  const status = value
    ? value.expired === null
      ? { label: tr('jwtNoExpiry'), cls: 'bg-[var(--bg-hover)]', dot: 'bg-[var(--text-hint)]', detail: '' }
      : value.notYetValid
        ? { label: tr('jwtNotYet'), cls: 'bg-amber-500/25', dot: 'bg-amber-400', detail: tr('jwtValidFromRel', { relative: relativeTime(value.times.nbf!, now, locale) }) }
        : value.expired
          ? { label: tr('jwtExpired'), cls: 'bg-red-500/15', dot: 'bg-red-400', detail: tr('jwtExpiredRel', { relative: relativeTime(value.times.exp!, now, locale) }) }
          : { label: tr('jwtActive'), cls: 'bg-emerald-500/15', dot: 'bg-emerald-400', detail: tr('jwtExpiresRel', { relative: relativeTime(value.times.exp!, now, locale) }) }
    : null;

  const claimWarnings = value
    ? CLAIMS.flatMap((claim) => {
        const v = value.payload[claim];
        if (v === undefined) return [];
        if (typeof v !== 'number') return [tr('jwtClaimNotNumber', { claim })];
        // 13 cifras: alguien lo puso en milisegundos.
        return v > 1e11 ? [tr('jwtClaimInMs', { claim })] : [];
      })
    : [];
  const alg = typeof value?.header.alg === 'string' ? value.header.alg : '—';

  return (
    <ToolFrame
      bodyClass="flex flex-col gap-4 px-5 py-4"
      status={
        <StatusArea>
          <CommonStatus cut={cut} />
          {decoded?.bearer && value && <StatusItem kind="info">{tr('jwtBearerRemoved')}</StatusItem>}
          {error && <StatusItem kind="error" id={errorId}>{error}</StatusItem>}
          {claimWarnings.map((w) => <StatusItem key={w} kind="warn">{w}</StatusItem>)}
        </StatusArea>
      }
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={tr('input')} htmlFor={inputId}>
          <IconButton icon={Eraser} label={tr('clear')} shortcut="mod+shift+backspace" disabled={!input} onClick={() => setInput('')} />
        </PanelHeader>
        <textarea
          id={inputId}
          ref={ref}
          rows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tr(toolKey('jwt', 'placeholder'))}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : undefined}
          className={textareaCls(!!error, 'min-h-[6rem]')}
          {...NO_AUTOCORRECT}
        />
      </div>

      {!input.trim() ? (
        <EmptyOutput onExample={() => setInput(EXAMPLE)} />
      ) : value && status ? (
        <>
          <p className="flex items-start gap-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            <ShieldAlert size={13} className="mt-px shrink-0 text-amber-400" aria-hidden />
            {tr('jwtNotVerified')}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--text-secondary)]">{tr('jwtStatus')}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)] ${status.cls}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden />
                {status.label}
              </span>
              {status.detail && <span className="text-[var(--text-secondary)]">{status.detail}</span>}
            </div>
            <div className="flex items-center gap-1">
              {saver.saved && <SavedInline note={saver.saved} />}
              <SaveButton disabled={!saver.can} onSave={() => void saver.save()} />
            </div>
          </div>

          {CLAIMS.some((c) => value.times[c] !== undefined) && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <PanelHeader title={tr('jwtDates')} />
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
                    <tr>
                      <th scope="col" className="px-3 py-1.5 font-semibold">{tr('jwtColClaim')}</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">{tr('jwtColLocal')}</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">{tr('jwtColUtc')}</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">{tr('jwtColRelative')}</th>
                      <th scope="col" className="w-8 px-1 py-1.5"><span className="sr-only">{tr('copy')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {CLAIMS.filter((c) => value.times[c] !== undefined).map((claim) => {
                      const ms = value.times[claim]!;
                      const local = formatInZone(ms, localTimeZone(), locale);
                      return (
                        <tr key={claim} className="border-t border-[var(--border)]">
                          <th scope="row" className="whitespace-nowrap px-3 py-1.5 font-normal text-[var(--text-secondary)]">
                            {tr(CLAIM_LABEL[claim])}
                          </th>
                          <td className="select-text px-3 py-1.5 text-[var(--text-body)]">{local}</td>
                          <td className="select-text whitespace-nowrap px-3 py-1.5 font-mono text-[var(--text-body)]">{utcText(ms)}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-[var(--text-secondary)]">{relativeTime(ms, now, locale)}</td>
                          <td className="px-1 py-1">
                            <CopyButton row text={new Date(ms).toISOString()} label={tr('copyItem', { name: claim })} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid gap-4 @3xl/tool:grid-cols-2">
            {([['jwtHeader', value.header], ['jwtPayload', value.payload]] as const).map(([key, part]) => (
              <div key={key} className="flex min-w-0 flex-col gap-1.5">
                <PanelHeader title={tr(key)}>
                  <CopyButton text={pretty(part)} label={tr('copyItem', { name: tr(key) })} showLabel shortcut={key === 'jwtPayload' ? 'mod+shift+C' : undefined} />
                </PanelHeader>
                <pre tabIndex={0} aria-label={tr(key)} className={`${PRE_CLS.replace('min-h-[12rem] ', '')} whitespace-pre`}>
                  <CodeText code={pretty(part)} language="json" />
                </pre>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]">{tr('jwtSignature')}</span>
            <span className="font-mono text-[var(--text-secondary)]">
              {decoded!.signature ? tr('jwtSignatureInfo', { alg, n: decoded!.signature.length }) : tr('jwtNoSignature')}
            </span>
            {decoded!.signature && <CopyButton row text={decoded!.signature} label={tr('copyItem', { name: tr('jwtSignature') })} />}
          </div>
        </>
      ) : null}
    </ToolFrame>
  );
}
