// Opciones → Plantillas (logday-server specs/plantillas, v1): qué plantilla
// usan el mensaje del Daily y el Excel de horas extra.
// - Daily: la de Logday (el mensaje de siempre, predeterminada) o una propia,
//   un texto con marcadores.
// - Excel: Legacy (el de siempre, predeterminado), la de Logday (genérica) o
//   un .xlsx cargado.
// Se guarda en este equipo, sin sync.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { getPreviousWorkingDay } from '../../lib/colombianHolidays';
import { buildDailyMessage } from '../../lib/templates/choice';
import { DAILY_TEMPLATE_EXAMPLES, DAILY_TEMPLATE_MARKERS, LOGDAY_DAILY_TEMPLATE, dailyTemplateContext, renderTemplate } from '../../lib/templates/dailyTemplate';
import { OVERTIME_TEMPLATE_MARKERS } from '../../lib/templates/overtimeTemplate';
import { StatusItem } from '../shared/FormControls';
import { FOCUS_RING, PANEL_TITLE, SECONDARY_CLS } from '../shared/controlClasses';
import { TONE_BG, TemplateTextEditor, type MarkerDef, type MarkerTone, type TemplateTextEditorHandle } from './TemplateTextEditor';

const SECTION_TITLE = 'mb-1 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]';
const marker = (name: string) => `{{${name}}}`;

type TemplatesKey = Parameters<typeof t<'templates'>>[2];
/** `anterior.fecha` → la clave de su nombre (`marker_anterior_fecha`). */
const markerKey = (name: string, kind: 'marker' | 'markerExample') => `${kind}_${name.replace(/\./g, '_')}` as TemplatesKey;

/** El color de cada marcador: el día anterior en ámbar, el del Daily en
 *  índigo, el usuario en verde azulado; en el Excel, la fila en índigo. */
const dailyTone = (name: string): MarkerTone => (name.startsWith('anterior.') ? 'amber' : name.startsWith('hoy.') ? 'indigo' : 'teal');

/** Un recuadro de color como los del editor, con su ejemplo debajo. */
function MarkerChip({ label, example, tone, onClick }: { label: string; example: string; tone: MarkerTone; onClick?: () => void }) {
  const body = (
    <>
      <span className="block text-[11px] font-medium text-[var(--text-primary)]">{label}</span>
      <span className="block text-[10px] text-[var(--text-hint)]">{example}</span>
    </>
  );
  const cls = `rounded-md px-2 py-1 text-left ${FOCUS_RING}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition hover:brightness-110`} style={{ background: TONE_BG[tone] }}>
      {body}
    </button>
  ) : (
    <span className={`${cls} inline-block`} style={{ background: TONE_BG[tone] }}>{body}</span>
  );
}

/** Las opciones como radios en tarjetas. */
function SourcePicker<T extends string>({ label, value, onChange, options }: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; title: string; desc: string; disabled?: boolean }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.id)}
            className={`rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${
              active
                ? 'border-indigo-500/60 bg-indigo-500/10 ring-1 ring-indigo-500/40'
                : 'border-[var(--border-card)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <span className="block text-xs font-medium text-[var(--text-primary)]">{o.title}</span>
            <span className="mt-0.5 block text-[10px] leading-snug text-[var(--text-hint)]">{o.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

function DailyTemplateSection() {
  const { language, templates, setDailyTemplate } = useAppStore();
  const tt = (key: Parameters<typeof t<'templates'>>[2]) => t(language, 'templates', key);
  const source = templates.daily?.source ?? 'logday';
  const saved = templates.daily?.text ?? '';
  const [draft, setDraft] = useState(saved);
  const editor = useRef<TemplateTextEditorHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markers: MarkerDef[] = useMemo(
    () => DAILY_TEMPLATE_MARKERS.map((key) => ({ key, label: tt(markerKey(key, 'marker')), tone: dailyTone(key) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language],
  );

  // Lo guardado manda cuando cambia por fuera (otra pestaña de Opciones).
  useEffect(() => setDraft(saved), [saved]);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const save = (text: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void setDailyTemplate({ source: 'custom', text }), 500);
  };
  const edit = (text: string) => {
    setDraft(text);
    save(text);
  };

  const choose = (next: 'logday' | 'custom') => {
    // Al pasar a Propia por primera vez se parte del mensaje de siempre.
    if (next === 'custom' && !saved.trim()) {
      setDraft(LOGDAY_DAILY_TEMPLATE);
      void setDailyTemplate({ source: 'custom', text: LOGDAY_DAILY_TEMPLATE });
      return;
    }
    void setDailyTemplate({ source: next });
  };

  // Vista previa con datos de ejemplo: hoy y el día laborable anterior.
  const input = useMemo(() => {
    const today = new Date();
    return {
      prevDate: getPreviousWorkingDay(today),
      prevActivities: tt('previewPrev'),
      todayDate: today,
      todayActivities: tt('previewToday'),
      language,
      userName: tt('markerExample_usuario_nombre'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);
  const preview = buildDailyMessage(source === 'custom' ? { source, text: draft } : { source }, input);
  const check = source === 'custom' && draft.trim() ? renderTemplate(draft, dailyTemplateContext(input)) : null;

  return (
    <section className="space-y-3">
      <div>
        <p className={SECTION_TITLE}>{tt('dailyTitle')}</p>
        <p className="text-[11px] text-[var(--text-hint)]">{tt('dailyDesc')}</p>
      </div>
      <SourcePicker
        label={`${tt('dailyTitle')}: ${tt('sourceLabel')}`}
        value={source}
        onChange={choose}
        options={[
          { id: 'logday', title: tt('sourceLogday'), desc: tt('sourceLogdayDailyDesc') },
          { id: 'custom', title: tt('sourceCustom'), desc: tt('sourceCustomDailyDesc') },
        ]}
      />

      {source === 'custom' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tt('examplesLabel')}>
            <span className="text-[10px] text-[var(--text-hint)]">{tt('examplesLabel')}:</span>
            {DAILY_TEMPLATE_EXAMPLES[language].map((ex) => (
              <button key={ex.id} type="button" className={SECONDARY_CLS} onClick={() => edit(ex.template)}>
                {tt(ex.id === 'usual' ? 'exampleUsual' : ex.id === 'short' ? 'exampleShort' : 'exampleNamed')}
              </button>
            ))}
          </div>
          <label htmlFor="daily-template-text" className={`${PANEL_TITLE} block`}>{tt('editorLabel')}</label>
          <TemplateTextEditor
            ref={editor}
            id="daily-template-text"
            value={draft}
            markers={markers}
            onChange={edit}
            onBlur={() => {
              if (saveTimer.current) clearTimeout(saveTimer.current);
              if (draft !== saved) void setDailyTemplate({ source: 'custom', text: draft });
            }}
          />
          <div className="flex flex-wrap items-start gap-1.5" role="group" aria-label={tt('insertMarker')}>
            {markers.map((m) => (
              <MarkerChip key={m.key} label={m.label} example={tt(markerKey(m.key, 'markerExample'))} tone={m.tone} onClick={() => editor.current?.insert(m.key)} />
            ))}
          </div>
          <p className="text-[10px] leading-relaxed text-[var(--text-hint)]">{tt('insertHint')}</p>
          {!draft.trim() && <StatusItem kind="info">{tt('emptyCustom')}</StatusItem>}
          {check?.error && <StatusItem kind="error">{tt('syntaxError').replace('{detail}', check.error)}</StatusItem>}
          {check && check.unknown.length > 0 && (
            <StatusItem kind="warn">{tt('unknownMarkers').replace('{list}', check.unknown.map(marker).join(', '))}</StatusItem>
          )}
        </div>
      )}

      <div>
        <p className={`${PANEL_TITLE} mb-1.5`}>{tt('preview')}</p>
        <pre className="whitespace-pre-wrap rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 font-sans text-xs leading-relaxed text-[var(--text-body)]">
          {preview}
        </pre>
      </div>
    </section>
  );
}

function OvertimeTemplateSection() {
  const { language, templates, setOvertimeTemplateSource, loadOvertimeTemplate, downloadOvertimeTemplate } = useAppStore();
  const tt = (key: Parameters<typeof t<'templates'>>[2]) => t(language, 'templates', key);
  const overtime = templates.overtime;
  const source = overtime?.source ?? 'legacy';
  const hasFile = Boolean(overtime?.fileName);
  const loadedDate = overtime?.loadedAt
    ? new Date(overtime.loadedAt).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <section className="space-y-3">
      <div>
        <p className={SECTION_TITLE}>{tt('overtimeTitle')}</p>
        <p className="text-[11px] text-[var(--text-hint)]">{tt('overtimeDesc')}</p>
      </div>
      <SourcePicker
        label={`${tt('overtimeTitle')}: ${tt('sourceLabel')}`}
        value={source}
        onChange={(next) => void setOvertimeTemplateSource(next)}
        options={[
          { id: 'legacy', title: tt('sourceLegacy'), desc: tt('sourceLegacyDesc') },
          { id: 'logday', title: tt('sourceLogday'), desc: tt('sourceLogdayXlsxDesc') },
          { id: 'custom', title: tt('sourceCustom'), desc: hasFile ? tt('sourceCustomXlsxDesc') : tt('sourceCustomXlsxEmpty'), disabled: !hasFile },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
        <FileSpreadsheet size={16} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
          {hasFile ? tt('loadedFile').replace('{name}', overtime!.fileName!).replace('{date}', loadedDate) : tt('noFile')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={SECONDARY_CLS} onClick={() => void loadOvertimeTemplate()}>
            <Upload size={12} aria-hidden />
            {hasFile ? tt('replace') : tt('load')}
          </button>
          {hasFile && (
            <button type="button" className={SECONDARY_CLS} onClick={() => void downloadOvertimeTemplate('custom')}>
              <Download size={12} aria-hidden />
              {tt('downloadCustom')}
            </button>
          )}
          <button type="button" className={SECONDARY_CLS} onClick={() => void downloadOvertimeTemplate('logday')}>
            <Download size={12} aria-hidden />
            {tt('downloadLogday')}
          </button>
        </div>
      </div>

      <details className="rounded-xl border border-[var(--border-card)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
        <summary className={`cursor-pointer select-none text-xs font-medium text-[var(--text-secondary)] ${FOCUS_RING} rounded`}>{tt('xlsxHelpTitle')}</summary>
        <div className="mt-2 space-y-2">
          <p>{tt('xlsxIntro')}</p>
          {([['xlsxGroupValues', OVERTIME_TEMPLATE_MARKERS.values, 'amber'], ['xlsxGroupRow', OVERTIME_TEMPLATE_MARKERS.row, 'indigo']] as const).map(([group, keys, tone]) => (
            <table key={group} className="w-full table-fixed border-collapse text-[11px]">
              <caption className="pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-hint)]">{tt(group)}</caption>
              <colgroup>
                <col className="w-[42%]" />
                <col className="w-[30%]" />
                <col />
              </colgroup>
              <thead>
                <tr className="text-left text-[10px] text-[var(--text-hint)]">
                  <th className="py-1 pr-3 font-medium">{tt('xlsxColWrite')}</th>
                  <th className="py-1 pr-3 font-medium">{tt('xlsxColWhat')}</th>
                  <th className="py-1 font-medium">{tt('xlsxColExample')}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key} className="border-t border-[var(--border-card)]">
                    <td className="py-1 pr-3 font-mono text-[10px] select-all">{marker(key)}</td>
                    <td className="py-1 pr-3">
                      <span className="rounded px-1.5 py-0.5" style={{ background: TONE_BG[tone] }}>{tt(markerKey(key, 'marker'))}</span>
                    </td>
                    <td className="py-1 text-[var(--text-hint)]">{tt(markerKey(key, 'markerExample'))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          <p>{tt('xlsxRowNote')}</p>
        </div>
      </details>
    </section>
  );
}

export function TemplatesSettingsTab() {
  const language = useAppStore((s) => s.language);
  return (
    <>
      <p className="text-xs text-[var(--text-secondary)]">{t(language, 'templates', 'intro')}</p>
      <DailyTemplateSection />
      <OvertimeTemplateSection />
    </>
  );
}
