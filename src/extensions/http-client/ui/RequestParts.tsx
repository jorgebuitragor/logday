// Piezas del editor de la pantalla (RequestForm.tsx, design §14.4): las
// pestañas, las cabeceras que agrega Logday, qué zona tiene un error, el
// cuerpo y la línea de la procedencia. Aparte para que el editor se lea.
import { useId, useState } from 'react';
import { FOCUS_RING, PANEL_TITLE } from '../../../components/shared/controlClasses';
import type { HttpClientKey } from '../../../lib/i18n';
import { parseJson } from '../../devtools/tools/formats';
import { NO_AUTOCORRECT, textareaCls } from '../../devtools/ui/classes';
import { replaceVariables, type ParsedRequest, type ParseIssue } from '../core/parse';
import type { Tr } from '../core/text';
import type { FormOrigin } from '../store';
import { TEXT_LINK } from './SendStatus';

export type RequestTab = 'params' | 'headers' | 'auth' | 'body' | 'text';
export const TABS: RequestTab[] = ['params', 'headers', 'auth', 'body', 'text'];
export const TAB_KEY: Record<RequestTab, HttpClientKey> = {
  params: 'tabParams', headers: 'tabHeadersReq', auth: 'tabAuth', body: 'tabBodyReq', text: 'tabText',
};

export const SEG_BTN = (active: boolean) =>
  `flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] transition ${FOCUS_RING} ${
    active ? 'bg-indigo-500/10 text-[var(--text-primary)] ring-1 ring-indigo-500/40' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
  }`;

/** Las que agrega Logday al enviar (HT42, decisión 6), para mostrarlas en
 *  solo lectura: el Content-Type de un cuerpo JSON y el User-Agent. El JSON
 *  se mira con las variables cambiadas por un valor cualquiera, como queda
 *  al enviarse. */
export function automaticHeaders(req: ParsedRequest | undefined, userAgent: string): { name: string; value: string }[] {
  if (!req) return [];
  const has = (n: string) => req.headers.some((h) => h.name.toLowerCase() === n);
  const out: { name: string; value: string }[] = [];
  const body = req.method === 'HEAD' ? null : req.body;
  if (body !== null && !has('content-type') && parseJson(replaceVariables(body, () => '0')).ok) out.push({ name: 'Content-Type', value: 'application/json' });
  if (!has('user-agent')) out.push({ name: 'User-Agent', value: userAgent });
  return out;
}

/** Qué zonas tienen un error de sintaxis: su tabla queda de solo lectura
 *  (HT40), para no pisar un texto que no entiende. */
export function zoneErrors(req: ParsedRequest | undefined): { params: ParseIssue | null; headers: ParseIssue | null } {
  if (!req) return { params: null, headers: null };
  const errors = req.issues.filter((i) => i.severity === 'error');
  const inHeaders = (i: ParseIssue) => i.line >= req.headerStart && i.line < req.headerEnd;
  return {
    params: errors.find((i) => i.code === 'missing_request_line' || (i.code === 'reserved_syntax' && i.line < req.headerStart)) ?? null,
    headers: errors.find((i) => (i.code === 'invalid_header' || i.code === 'reserved_syntax') && inHeaders(i)) ?? null,
  };
}

/** El cuerpo: como `LiveInput`, muestra lo que se escribe mientras tiene
 *  el foco (el texto le quita las líneas en blanco del final, y un Enter
 *  al final desaparecería). Hasta A2 es el `textarea` de siempre. */
export function BodyArea({
  label, value, onValue, disabled, describedBy, placeholder, invalid,
}: {
  label: string;
  value: string;
  onValue: (value: string) => void;
  disabled: boolean;
  describedBy?: string;
  placeholder: string;
  invalid: boolean;
}) {
  const [local, setLocal] = useState<string | null>(null);
  const uid = useId().replace(/:/g, '');
  return (
    <>
      <label htmlFor={`http-body-${uid}`} className={PANEL_TITLE}>{label}</label>
      <textarea
        id={`http-body-${uid}`}
        value={local ?? value}
        onFocus={() => setLocal(value)}
        onBlur={() => setLocal(null)}
        onChange={(e) => {
          setLocal(e.target.value);
          onValue(e.target.value);
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${textareaCls(invalid, 'min-h-[7rem] h-[20vh]')} disabled:cursor-not-allowed disabled:opacity-50`}
        {...NO_AUTOCORRECT}
      />
    </>
  );
}

/** "De «API» · Abrir la nota · ● Cambios sin guardar", bajo el título. */
export function OriginLine({
  tr, origin, dirty, onOpenNote,
}: {
  tr: Tr;
  origin: FormOrigin;
  dirty: boolean;
  onOpenNote: (target: { filePath: string; noteId: string }) => void;
}) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--text-hint)]">
      <span className="min-w-0 truncate">{tr('viewFrom', { title: origin.title })}</span>
      <span aria-hidden>·</span>
      <button type="button" className={TEXT_LINK} onClick={() => onOpenNote({ filePath: origin.filePath, noteId: origin.noteId })}>
        {tr('viewOpenNote')}
      </button>
      {dirty && (
        <>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
            {tr('unsaved')}
          </span>
        </>
      )}
    </p>
  );
}
