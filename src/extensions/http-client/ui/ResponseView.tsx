// La respuesta (Interfaz §2, HT10–HT14): el estado, el tiempo, el tamaño
// y tres pestañas (cuerpo, cabeceras y la petición enviada). Una página HTML
// se ve en la vista previa aislada de `HtmlPreview` (iframe `sandbox=""`,
// CSP sin red, enlaces neutralizados; HT53) o como texto; las imágenes, en
// <img>. Nada pasa por dangerouslySetInnerHTML. Se comparte con la
// pantalla (HT33).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check, CircleAlert, CircleCheck, Copy, CornerDownRight, Download, FileQuestion, History, ShieldCheck, ShieldOff, TriangleAlert, X,
} from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../../store/appStore';
import { fs } from '../../../lib/invoke';
import { ICON_BTN, FOCUS_RING } from '../../../components/shared/controlClasses';
import { StatusItem, Toggle } from '../../../components/shared/FormControls';
import { HtmlPreview } from '../../../components/shared/HtmlPreview';
import { CodeText, HIGHLIGHT_LIMIT } from '../../devtools/ui/highlight';
import { formatHtml } from '../../devtools/tools/htmlFormat';
import { announce } from '../announce';
import { chooseBodyView, defaultFileName, mimeOf, type BodyView } from '../core/body';
import { formatAgo, formatElapsed, formatSize, makeTr, timeOfDay, type Tr } from '../core/text';
import type { ResponseOutcome } from '../store';

export type ResponseTab = 'body' | 'headers' | 'request';
type Tab = ResponseTab;

const PRE = 'max-h-[24rem] overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-body)] select-text';
const MARK = 'ml-3 rounded bg-[var(--bg-hover)] px-1 text-[10px] text-[var(--text-secondary)]';
const SEG_BTN = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-[11px] transition ${FOCUS_RING} ${
    active ? 'bg-indigo-500/10 text-[var(--text-primary)] ring-1 ring-indigo-500/40' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
  }`;

/** El chip del estado: el número y su texto bastan sin el color. */
export function StatusChip({ status, reason }: { status: number; reason: string }) {
  const range = Math.floor(status / 100);
  const [bg, Icon, iconCls] =
    range === 2 ? ['bg-emerald-500/15', CircleCheck, 'text-emerald-400']
      : range === 3 ? ['bg-[var(--bg-hover)]', CornerDownRight, 'text-[var(--text-secondary)]']
        : range === 4 ? ['bg-amber-500/15', TriangleAlert, 'text-amber-400']
          : ['bg-red-500/15', CircleAlert, 'text-red-400'];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--text-primary)] ${bg}`}>
      <Icon size={12} className={iconCls} aria-hidden />
      {status}{reason ? ` ${reason}` : ''}
    </span>
  );
}

function useFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return [on, () => {
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 1500);
  }];
}

function IconBtn({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={`${ICON_BTN} min-h-7 min-w-7 justify-center`}>
      {children}
    </button>
  );
}

function requestText(o: ResponseOutcome): string {
  const p = o.preview;
  const lines = [`${p.method} ${p.url}`, ...p.headers.map((h) => `${h.name}: ${h.value}`)];
  if (p.body !== null) lines.push('', p.body);
  return lines.join('\n');
}

/** Cómo se ve una respuesta HTML (HT53). */
export type HtmlMode = 'preview' | 'code' | 'raw';

// La última vista elegida, para la próxima respuesta HTML. Solo en memoria
// y solo la vista, nunca el contenido: se pierde al cerrar la app.
let rememberedHtmlMode: HtmlMode = 'preview';
export const rememberHtmlMode = (mode: HtmlMode) => {
  rememberedHtmlMode = mode;
};

/** El alto de la vista previa: con tope en la franja de la nota y más alto
 *  en la pantalla, que es el único sitio con el contenedor `httpview`
 *  (`ui/View.tsx`). Sin redimensionar: el iframe taparía el asa. */
const PREVIEW_HEIGHT = 'h-[min(24rem,60vh)] min-h-[10rem] @3xs/httpview:h-[60vh] @3xs/httpview:min-h-[16rem]';

/** El segmentado de las vistas del cuerpo (botones con `aria-pressed`). */
function ViewSwitch<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 self-start rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={SEG_BTN(value === o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const headersText = (o: ResponseOutcome) => o.output.headers.map(([n, v]) => `${n}: ${v}`).join('\n');

/** El texto entero del cuerpo (no solo lo que se muestra), para copiar o guardar. */
function fullBodyText(o: ResponseOutcome): string | null {
  return o.output.body.kind === 'text' ? o.output.body.text : null;
}

type TextView = Extract<BodyView, { kind: 'text' }>;

/** HT53: Vista previa (aislada), Código (formateado y resaltado) o Sin
 *  formato (tal cual). Lo que no llegó entero se previsualiza igual, con
 *  aviso. "Cargar recursos externos" empieza apagado y no se recuerda, como
 *  en el Visor HTML de DevTools: cargar de internet deja ver a terceros qué
 *  se mira. */
function HtmlBody({ view, tr, incomplete }: { view: TextView; tr: Tr; incomplete: boolean }) {
  const [mode, setModeState] = useState<HtmlMode>(() => rememberedHtmlMode);
  const [external, setExternal] = useState(false);
  const setMode = (next: HtmlMode) => {
    setModeState(next);
    rememberHtmlMode(next);
  };
  // Se formatea solo al pedir Código: formatHtml nunca falla, pero 2 MB cuestan.
  const formatted = useMemo(() => (mode === 'code' ? formatHtml(view.raw, 2) : null), [mode, view.raw]);
  const text = formatted ?? view.raw;
  const modes = [
    { id: 'preview' as const, label: tr('htmlPreview') },
    { id: 'code' as const, label: tr('htmlCode') },
    { id: 'raw' as const, label: tr('viewRaw') },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      {view.lossy && <StatusItem kind="warn">{tr('notUtf8')}</StatusItem>}
      {mode === 'preview' && incomplete && <StatusItem kind="warn">{tr('htmlIncomplete')}</StatusItem>}
      {mode !== 'preview' && view.partial && <StatusItem kind="info">{tr('partialView')}</StatusItem>}
      {mode !== 'preview' && text.length > HIGHLIGHT_LIMIT && <StatusItem kind="info">{tr('noHighlight')}</StatusItem>}
      <ViewSwitch label={tr('tabBody')} value={mode} options={modes} onChange={setMode} />
      {mode === 'preview' ? (
        <>
          <HtmlPreview html={view.raw} allowExternal={external} title={tr('htmlPreviewFrame')} heightClass={PREVIEW_HEIGHT} />
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-[11px]">
            <p className="flex items-start gap-1.5 text-[var(--text-hint)]">
              {external ? (
                <TriangleAlert size={12} className="mt-px shrink-0 text-amber-400" aria-hidden />
              ) : (
                <ShieldCheck size={12} className="mt-px shrink-0" aria-hidden />
              )}
              {tr(external ? 'htmlIsolatedExternal' : 'htmlIsolated')}
            </p>
            <Toggle label={tr('htmlExternal')} checked={external} onChange={setExternal} />
          </div>
        </>
      ) : (
        <pre tabIndex={0} aria-label={tr('bodyAria')} className={`${PRE} ${mode === 'code' ? 'whitespace-pre' : 'whitespace-pre-wrap break-all'}`}>
          <CodeText code={text} language="xml" />
        </pre>
      )}
    </div>
  );
}

function BodyPanel({ view, tr, pretty, setPretty, truncated, sentAt }: {
  view: BodyView;
  tr: Tr;
  pretty: boolean;
  setPretty: (v: boolean) => void;
  /** Rust cortó el cuerpo en el máximo de las opciones (HT24). */
  truncated: boolean;
  /** Identifica la respuesta: con una nueva, "Cargar recursos externos"
   *  vuelve a apagarse aunque la vista siga montada. */
  sentAt: number;
}) {
  const language = useAppStore((s) => s.language);
  if (view.kind === 'empty') return <p className="text-[11px] text-[var(--text-hint)]">{tr('emptyBody')}</p>;
  if (view.kind === 'image') {
    return (
      <img
        src={`data:${view.mime};base64,${view.base64}`}
        alt={tr('imageAlt', { type: view.mime, size: formatSize(view.bytes, language) })}
        className="max-h-[20rem] max-w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)]"
      />
    );
  }
  if (view.kind === 'binary') {
    return (
      <div className="flex items-center gap-3 rounded-md border border-dashed border-[var(--border-high)] px-4 py-4 text-[11px] text-[var(--text-secondary)]">
        <FileQuestion size={16} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
        <span>{tr('binary', { type: view.mime, size: formatSize(view.bytes, language) })}</span>
      </div>
    );
  }
  if (view.html) return <HtmlBody key={sentAt} view={view} tr={tr} incomplete={truncated || view.partial} />;
  const showPretty = pretty && view.pretty !== null;
  const text = showPretty ? view.pretty! : view.raw;
  return (
    <div className="flex flex-col gap-1.5">
      {view.invalid && <StatusItem kind="info">{tr(view.invalid === 'json' ? 'notJson' : 'notXml')}</StatusItem>}
      {view.lossy && <StatusItem kind="warn">{tr('notUtf8')}</StatusItem>}
      {view.partial && <StatusItem kind="info">{tr('partialView')}</StatusItem>}
      {view.language && text.length > HIGHLIGHT_LIMIT && <StatusItem kind="info">{tr('noHighlight')}</StatusItem>}
      {view.pretty !== null && (
        <ViewSwitch
          label={tr('tabBody')}
          value={pretty ? 'pretty' : 'raw'}
          options={[{ id: 'pretty', label: tr('viewPretty') }, { id: 'raw', label: tr('viewRaw') }]}
          onChange={(v) => setPretty(v === 'pretty')}
        />
      )}
      <pre tabIndex={0} aria-label={tr('bodyAria')} className={`${PRE} ${showPretty ? 'whitespace-pre' : 'whitespace-pre-wrap break-all'}`}>
        <CodeText code={text} language={view.language} />
      </pre>
    </div>
  );
}

function HeadersPanel({ o, tr }: { o: ResponseOutcome; tr: Tr }) {
  if (o.output.headers.length === 0) return <p className="text-[11px] text-[var(--text-hint)]">—</p>;
  return (
    <div tabIndex={0} aria-label={tr('headersAria')} className={`${PRE} whitespace-normal`}>
      <table>
        <tbody>
          {o.output.headers.map(([name, value], i) => (
            <tr key={`${name}-${i}`}>
              <th scope="row" className="whitespace-nowrap pr-3 text-left align-top font-mono text-[11px] text-[var(--text-secondary)]">{name}</th>
              <td className="break-all font-mono text-[11px] text-[var(--text-body)] select-text">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequestPanel({ o, tr }: { o: ResponseOutcome; tr: Tr }) {
  const language = useAppStore((s) => s.language);
  const p = o.preview;
  const out = o.output;
  const meta = o.envName
    ? tr('sentMeta', { env: o.envName, time: timeOfDay(o.sentAt, language) })
    : tr('sentMetaNoEnv', { time: timeOfDay(o.sentAt, language) });
  return (
    <pre tabIndex={0} aria-label={tr('requestAria')} className={`${PRE} whitespace-pre-wrap break-all`}>
      <code className="devtools-code">
        {`${p.method} ${p.url}\n`}
        {p.headers.map((h, i) => (
          <span key={`${h.name}-${i}`}>
            {`${h.name}: ${h.value}`}
            {h.secret && <span className={MARK}>{tr('markSecret')}</span>}
            {h.auto && <span className={MARK}>{tr('markAuto')}</span>}
            {'\n'}
          </span>
        ))}
        {p.body !== null && `\n${p.body}\n`}
        {out.droppedHeaders.map((name) => `\n${tr('droppedHeader', { name })}`)}
        {out.redirects.length > 0 && `\n${tr('redirects', { n: out.redirects.length, chain: out.redirects.map((r) => `${r.status} → ${r.location}`).join(', ') })}`}
        {`\n${meta}${out.tlsUnverified ? ` · ${tr('tlsUnverified')}` : ''}`}
      </code>
    </pre>
  );
}

export function ResponseView({
  outcome, stale = false, dim = false, previous = false, onDismiss, now, initialTab = 'body', tab: tabProp, onTabChange,
}: {
  outcome: ResponseOutcome;
  /** La petición cambió después de esta respuesta. */
  stale?: boolean;
  /** Atenuada: se está enviando otra, o la última falló. */
  dim?: boolean;
  /** "Respuesta anterior". */
  previous?: boolean;
  onDismiss?: () => void;
  now: number;
  initialTab?: Tab;
  /** La pestaña, si la lleva quien la dibuja (la pantalla la conserva
   *  al cambiar de petición). */
  tab?: Tab;
  onTabChange?: (tab: Tab) => void;
}) {
  const language = useAppStore((s) => s.language);
  const showToast = useAppStore((s) => s.showToast);
  const tr = makeTr(language);
  const [ownTab, setOwnTab] = useState<Tab>(initialTab);
  const tab = tabProp ?? ownTab;
  const setTab = (next: Tab) => {
    setOwnTab(next);
    onTabChange?.(next);
  };
  const [pretty, setPretty] = useState(true);
  const [copied, flash] = useFlash();
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ body: null, headers: null, request: null });
  const out = outcome.output;
  const view = useMemo(() => chooseBodyView(out.body, out.headers), [out.body, out.headers]);
  const mime = mimeOf(out.headers);
  const status = `${out.status}${out.reason ? ` ${out.reason}` : ''}`;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'body', label: tr('tabBody') },
    { id: 'headers', label: tr('tabHeaders', { n: out.headers.length }) },
    { id: 'request', label: tr('tabRequest') },
  ];

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = tabs.length;
    const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(tabs[to].id);
    tabRefs.current[tabs[to].id]?.focus();
  };

  const copyText = tab === 'body' ? (view.kind === 'text' ? fullBodyText(outcome) : null) : tab === 'headers' ? headersText(outcome) : requestText(outcome);
  const copy = async () => {
    if (copyText === null) return;
    try {
      await navigator.clipboard.writeText(copyText);
      flash();
      announce(tr('copied'));
    } catch {
      // Sin permiso del portapapeles: no hay nada más que hacer.
    }
  };

  const saveBody = async () => {
    try {
      const path = await save({ defaultPath: defaultFileName(out.finalUrl, mime, tr('saveDefaultName')) });
      if (!path) return;
      if (out.body.kind === 'binary') await fs.writeBinary(path, out.body.base64);
      else if (out.body.kind === 'text') await fs.writeFile(path, out.body.text);
      else await fs.writeFile(path, '');
      const fileName = path.split(/[\\/]/).pop() ?? path;
      showToast({ kind: 'success', title: tr('saved'), description: fileName });
      announce(tr('saved'));
    } catch {
      showToast({ kind: 'error', title: tr('saveError') });
    }
  };

  const copyLabel = tab === 'body' ? tr('copyBody') : tab === 'headers' ? tr('copyHeaders') : tr('copyRequest');

  return (
    <section aria-label={tr('responseAria', { status })} className={`flex flex-col gap-2 ${dim ? 'opacity-60' : ''}`}>
      {previous && <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">{tr('previous')}</p>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip status={out.status} reason={out.reason} />
        {out.tlsUnverified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-[var(--text-primary)]">
            <ShieldOff size={10} className="text-amber-400" aria-hidden />
            {tr('tlsUnverified')}
          </span>
        )}
        <span className="text-[11px] tabular-nums text-[var(--text-secondary)]">
          {tr('statusSummary', { ms: formatElapsed(out.elapsedMs, language), size: formatSize(out.bodyBytes, language) })}
          {out.truncated && ` ${tr('cut')}`}
          {` · ${formatAgo(tr, outcome.sentAt, now, language)}`}
        </span>
      </div>
      {stale && (
        <p className="flex items-center gap-1 text-[10px] text-[var(--text-hint)]">
          <History size={10} aria-hidden />
          {tr('stale')}
        </p>
      )}
      {out.truncated && <StatusItem kind="warn">{tr('truncated', { limit: formatSize(out.bodyBytes, language) })}</StatusItem>}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={tr('tabsAria')} className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={SEG_BTN(tab === t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <IconBtn label={copied ? tr('copied') : copyLabel} onClick={() => void copy()} disabled={copyText === null}>
          {copied ? <Check size={14} className="text-emerald-400" aria-hidden /> : <Copy size={14} aria-hidden />}
        </IconBtn>
        {out.body.kind !== 'empty' && (
          <IconBtn label={tr('saveBody')} onClick={() => void saveBody()}>
            <Download size={14} aria-hidden />
          </IconBtn>
        )}
        {onDismiss && (
          <IconBtn label={tr('dismiss')} onClick={onDismiss}>
            <X size={14} aria-hidden />
          </IconBtn>
        )}
      </div>
      <div role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === 'body' && <BodyPanel view={view} tr={tr} pretty={pretty} setPretty={setPretty} truncated={out.truncated} sentAt={outcome.sentAt} />}
        {tab === 'headers' && <HeadersPanel o={outcome} tr={tr} />}
        {tab === 'request' && <RequestPanel o={outcome} tr={tr} />}
      </div>
    </section>
  );
}
