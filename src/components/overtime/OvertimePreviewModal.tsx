import { X, Download } from 'lucide-react';
import { OvertimeEntry, OvertimeMonthMeta } from '../../types/overtime';
import { MONTHS_TITLE, t } from '../../lib/i18n';
import type { Language } from '../../lib/i18n';

interface Props {
  entries: OvertimeEntry[];
  meta: OvertimeMonthMeta;
  month: string; // "YYYY-MM"
  language: Language;
  onClose: () => void;
  onExport: () => void;
}

function formatDate(fecha: string): string {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

const COMP_KEYS = new Set(['comp', 'pay', 'other']);

const thCls =
  'sticky top-0 z-10 bg-[var(--bg-surface)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] whitespace-nowrap';
const tdCls = 'px-3 py-2 text-xs text-[var(--text-primary)] border-b border-[var(--border)]';
const tdNumCls = `${tdCls} text-right font-mono tabular-nums`;

export function OvertimePreviewModal({ entries, meta, month, language, onClose, onExport }: Props) {
  const [year, m] = month.split('-').map(Number);
  const monthLabel = `${MONTHS_TITLE[language][m - 1]} ${year}`;

  const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

  const totHoras      = entries.reduce((a, e) => a + e.totalHoras, 0);
  const totDiurnas    = entries.reduce((a, e) => a + e.extrasDiurnas, 0);
  const totNocturnas  = entries.reduce((a, e) => a + e.extrasNocturnas, 0);
  const totDiurnasFest   = entries.reduce((a, e) => a + e.extrasDiurnasFestivas, 0);
  const totNocturnasFest = entries.reduce((a, e) => a + e.extrasNocturnasFestivas, 0);

  const HEADERS = [
    t(language, 'overtime', 'date'),
    t(language, 'overtime', 'requestedBy'),
    t(language, 'overtime', 'activityDone'),
    t(language, 'overtime', 'compPay'),
    t(language, 'overtime', 'startTime'),
    t(language, 'overtime', 'endTime'),
    t(language, 'overtime', 'previewColTotal'),
    t(language, 'overtime', 'previewColDay'),
    t(language, 'overtime', 'previewColNight'),
    t(language, 'overtime', 'previewColDayFest'),
    t(language, 'overtime', 'previewColNightFest'),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="modal-spring-in flex max-h-[85vh] w-full max-w-6xl flex-col rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Cabecera del modal ───────────────────────────────────────── */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {t(language, 'overtime', 'previewTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-hint)]">{monthLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-md p-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Datos del colaborador ─────────────────────────────────────── */}
        <div className="flex items-center gap-6 border-b border-[var(--border)] bg-[var(--bg-base)] px-5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-hint)]">
              {t(language, 'overtime', 'collaboratorData')}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              {meta.colaborador || <span className="italic text-[var(--text-hint)]">{t(language, 'overtime', 'dash')}</span>}
            </span>
          </div>
          {meta.cedula && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-hint)]">CC</span>
              <span className="text-xs text-[var(--text-secondary)]">{meta.cedula}</span>
            </div>
          )}
        </div>

        {/* ── Tabla ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {HEADERS.map((h) => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-xs text-[var(--text-hint)]">
                    {t(language, 'overtime', 'emptyMonth')}
                  </td>
                </tr>
              ) : (
                entries.map((entry, i) => (
                  <tr
                    key={entry.id}
                    className={i % 2 === 0 ? 'bg-transparent' : 'bg-[var(--bg-base)]/40'}
                  >
                    <td className={`${tdCls} whitespace-nowrap`}>{formatDate(entry.fecha)}</td>
                    <td className={tdCls}>{entry.solicitadaPor || <span className="text-[var(--text-hint)]">{t(language, 'overtime', 'dash')}</span>}</td>
                    <td className={`${tdCls} max-w-xs`}>
                      <span className="line-clamp-2">{entry.actividad || <span className="italic text-[var(--text-hint)]">{t(language, 'overtime', 'noDescription')}</span>}</span>
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      {entry.observaciones
                        ? COMP_KEYS.has(entry.observaciones)
                          ? t(language, 'overtime', entry.observaciones as 'comp' | 'pay' | 'other')
                          : entry.observaciones
                        : <span className="text-[var(--text-hint)]">{t(language, 'overtime', 'dash')}</span>}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>{entry.horaInicio}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{entry.horaFinal}</td>
                    <td className={`${tdNumCls} font-semibold text-[var(--text-primary)]`}>{fmt(entry.totalHoras)}</td>
                    <td className={tdNumCls}>{fmt(entry.extrasDiurnas)}</td>
                    <td className={tdNumCls}>{fmt(entry.extrasNocturnas)}</td>
                    <td className={tdNumCls}>{fmt(entry.extrasDiurnasFestivas)}</td>
                    <td className={tdNumCls}>{fmt(entry.extrasNocturnasFestivas)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {/* ── Fila de totales ──────────────────────────────────────── */}
            {entries.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-indigo-500/30 bg-indigo-500/[0.06]">
                  <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
                    {t(language, 'overtime', 'previewTotalsRow')}
                  </td>
                  <td className={`${tdNumCls} font-bold text-indigo-400`}>{fmt(totHoras)}</td>
                  <td className={`${tdNumCls} font-semibold`}>{fmt(totDiurnas)}</td>
                  <td className={`${tdNumCls} font-semibold`}>{fmt(totNocturnas)}</td>
                  <td className={`${tdNumCls} font-semibold`}>{fmt(totDiurnasFest)}</td>
                  <td className={`${tdNumCls} font-semibold`}>{fmt(totNocturnasFest)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            {t(language, 'overtime', 'close')}
          </button>
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
          >
            <Download size={13} />
            {t(language, 'overtime', 'exportExcel')}
          </button>
        </div>
      </div>
    </div>
  );
}
