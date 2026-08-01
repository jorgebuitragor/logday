import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Download, Trash2, X, User, Pencil, Eye, Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { OvertimeEntry } from '../types';
import { MONTHS_TITLE, t } from '../lib/i18n';
import { OvertimePreviewModal } from './OvertimePreviewModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { usePositionedMenu } from '../hooks/usePositionedMenu';

const ESTIMATED_OVERTIME_CTX_MENU = { width: 180, height: 44 };
const ESTIMATED_OVERTIME_ENTRY_MENU = { width: 180, height: 90 };

interface Props {
  activeEntryId?: string | null;
  onEdit: (entry: OvertimeEntry | null | undefined) => void;
}

function formatFecha(fecha: string, language: 'es' | 'en'): string {
  const [, month, day] = fecha.split('-');
  return `${parseInt(day)} ${MONTHS_TITLE[language][parseInt(month) - 1].slice(0, 3)}`;
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function OvertimeList({ onEdit, activeEntryId }: Props) {
  const {
    overtimeEntries, overtimeMonth, loadOvertimeMonth,
    deleteOvertimeEntry, exportOvertimeExcel,
    overtimeMeta, setOvertimeMeta,
    language, confirmDestructiveActions,
  } = useAppStore(
    useShallow((s) => ({
      overtimeEntries: s.overtimeEntries,
      overtimeMonth: s.overtimeMonth,
      loadOvertimeMonth: s.loadOvertimeMonth,
      deleteOvertimeEntry: s.deleteOvertimeEntry,
      exportOvertimeExcel: s.exportOvertimeExcel,
      overtimeMeta: s.overtimeMeta,
      setOvertimeMeta: s.setOvertimeMeta,
      language: s.language,
      confirmDestructiveActions: s.confirmDestructiveActions,
    }))
  );
  const [showConfig, setShowConfig] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport(yearMonth: string) {
    setExporting(true);
    try {
      await exportOvertimeExcel(yearMonth);
    } finally {
      setExporting(false);
    }
  }
  const confirmDeleteDialog = useConfirmDelete<OvertimeEntry>(confirmDestructiveActions);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const ctxMenuLayout = usePositionedMenu(ctxMenu, {
    estimatedSize: ESTIMATED_OVERTIME_CTX_MENU,
    onClose: () => setCtxMenu(null),
  });
  const [entryCtx, setEntryCtx] = useState<{ entry: OvertimeEntry; x: number; y: number } | null>(null);
  const entryCtxLayout = usePositionedMenu(entryCtx, {
    estimatedSize: ESTIMATED_OVERTIME_ENTRY_MENU,
    onClose: () => setEntryCtx(null),
  });
  const [listKey, setListKey] = useState(0);

  // Cargar entradas del mes al montar
  useEffect(() => {
    loadOvertimeMonth(overtimeMonth);
    setListKey((k) => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overtimeMonth]);

  const [year, month] = overtimeMonth.split('-').map(Number);

  const totalHoras = overtimeEntries.reduce((a, e) => a + e.totalHoras, 0);
  const totalDiurnas = overtimeEntries.reduce((a, e) => a + e.extrasDiurnas, 0);
  const totalNocturnas = overtimeEntries.reduce((a, e) => a + e.extrasNocturnas, 0);
  const totalDiurnasFest = overtimeEntries.reduce((a, e) => a + e.extrasDiurnasFestivas, 0);
  const totalNocturnasFest = overtimeEntries.reduce((a, e) => a + e.extrasNocturnasFestivas, 0);

  const fmt = (n: number) => Math.round(n * 100) / 100;

  const inputCls = 'w-full rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none';

  const COMP_KEYS = new Set(['comp', 'pay', 'other']);

  return (<>
    <div className="flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]" style={{ width: 'var(--logday-list-w)' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t(language, 'overtime', 'title')}</h2>
        <button
          onClick={() => onEdit(null)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-400 transition hover:bg-indigo-500/10"
          title={t(language, 'overtime', 'newOvertimeTitle')}
        >
          <Plus size={14} />
          {t(language, 'overtime', 'newBtn')}
        </button>
      </div>
      {/* Navegación año / mes */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-2">
        <button
          onClick={() => loadOvertimeMonth(prevMonth(overtimeMonth))}
          className="rounded p-1 text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title={t(language, 'overtime', 'prevMonth')}
        >
          <ChevronLeft size={14} />
        </button>
        <div className="flex flex-1 flex-col items-center">
          <span className="text-[10px] text-[var(--text-hint)] leading-none">{year}</span>
          <span className="text-xs font-semibold text-[var(--text-primary)]">{MONTHS_TITLE[language][month - 1]}</span>
        </div>
        <button
          onClick={() => loadOvertimeMonth(nextMonth(overtimeMonth))}
          className="rounded p-1 text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title={t(language, 'overtime', 'nextMonth')}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Historial de entradas */}
      <div
        className="flex-1 overflow-y-auto"
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
      >
        {overtimeEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--text-hint)]">
            <p className="text-sm">{t(language, 'overtime', 'emptyMonth')}</p>
            <button
              onClick={() => onEdit(null)}
              className="text-xs text-indigo-400 hover:underline"
            >
              {t(language, 'overtime', 'addFirstEntry')}
            </button>
          </div>
        ) : (
          <ul key={listKey} className="divide-y divide-[var(--border)]">
            {overtimeEntries.map((entry, idx) => {
              const isActive = entry.id === activeEntryId;
              return (
              <li
                key={entry.id}
                className={`group flex cursor-pointer items-start gap-2 px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'border-l-2 border-l-[var(--accent)] bg-[var(--accent-soft)] pl-[10px]'
                    : 'border-l-2 border-l-transparent hover:bg-[var(--bg-hover)]'
                }`}
                onClick={() => onEdit(isActive ? undefined : entry)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setEntryCtx({ entry, x: e.clientX, y: e.clientY }); }}
              >
                <div className={`task-row-enter task-d${Math.min(idx, 10)} contents`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-indigo-400">{formatFecha(entry.fecha, language)}</span>
                    <span className="text-[10px] text-[var(--text-hint)]">{entry.horaInicio}–{entry.horaFinal}</span>
                    <span className="ml-auto text-[10px] font-medium text-[var(--text-secondary)]">{fmt(entry.totalHoras)}h</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-primary)]">
                    {entry.actividad || <span className="italic text-[var(--text-hint)]">{t(language, 'overtime', 'noDescription')}</span>}
                  </p>
                  {entry.observaciones && (
                    <span className="mt-0.5 inline-block rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-400">
                      {COMP_KEYS.has(entry.observaciones)
                        ? t(language, 'overtime', entry.observaciones as 'comp' | 'pay' | 'other')
                        : entry.observaciones}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmDeleteDialog.request(entry, (en) => void deleteOvertimeEntry(en.id));
                  }}
                  className="mt-0.5 hidden shrink-0 rounded p-1 text-[var(--text-hint)] hover:text-red-400 hover:bg-red-500/10 group-hover:flex"
                  title={t(language, 'overtime', 'deleteTitle')}
                >
                  <Trash2 size={13} />
                </button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Totales del mes */}
      {overtimeEntries.length > 0 && (
        <div className="border-t border-[var(--border)] px-3 py-2 space-y-0.5">
          {/* Barra de escaneo — aparece solo durante la exportación */}
          <div className="relative h-0.5 overflow-hidden rounded-full mb-1.5" style={{ visibility: exporting ? 'visible' : 'hidden' }}>
            <div className="absolute inset-0 bg-[var(--border)]" />
            <div className="export-scan-bar absolute inset-y-0 left-0 w-1/4 rounded-full bg-indigo-500/70" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-hint)]">{t(language, 'overtime', 'monthTotal')}</p>
          <div className="grid grid-cols-2 gap-x-2 text-xs text-[var(--text-hint)]">
            <span>{t(language, 'overtime', 'total')}</span><span className="text-right font-semibold text-[var(--text-primary)]">{fmt(totalHoras)}h</span>
            <span>{t(language, 'overtime', 'day')}</span><span className="text-right">{fmt(totalDiurnas)}h</span>
            <span>{t(language, 'overtime', 'night')}</span><span className="text-right">{fmt(totalNocturnas)}h</span>
            <span>{t(language, 'overtime', 'dayHoliday')}</span><span className="text-right">{fmt(totalDiurnasFest)}h</span>
            <span>{t(language, 'overtime', 'nightHoliday')}</span><span className="text-right">{fmt(totalNocturnasFest)}h</span>
          </div>
        </div>
      )}

      {/* Panel datos colaborador (encima del toolbar, colapsable) */}
      {showConfig && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-base)] px-3 py-3 space-y-2 modal-spring-in">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-hint)]">{t(language, 'overtime', 'collaboratorData')}</p>
            <button onClick={() => setShowConfig(false)} className="rounded p-0.5 text-[var(--text-hint)] hover:text-[var(--text-primary)]">
              <X size={12} />
            </button>
          </div>
          <div className="space-y-1.5">
            <input
              className={inputCls}
              value={overtimeMeta.colaborador}
              onChange={(e) => setOvertimeMeta({ colaborador: e.target.value })}
              placeholder={t(language, 'overtime', 'fullNamePlaceholder')}
            />
            <input
              className={inputCls}
              value={overtimeMeta.cedula}
              onChange={(e) => setOvertimeMeta({ cedula: e.target.value })}
              placeholder={t(language, 'overtime', 'idPlaceholder')}
            />
          </div>
          <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'overtime', 'collaboratorHint')}</p>
        </div>
      )}

      {/* Barra de acciones (bottom) */}
      <div className="flex items-center justify-end border-t border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowConfig((v) => !v)}
            className={`rounded p-1.5 transition-colors ${
              showConfig
                ? 'text-indigo-400 bg-indigo-500/10'
                : 'text-[var(--text-hint)] hover:text-indigo-400 hover:bg-indigo-500/10'
            }`}
            title={t(language, 'overtime', 'collaboratorData')}
          >
            <User size={14} />
          </button>
          <button
            onClick={() => setShowPreview(true)}
            className="rounded p-1.5 text-[var(--text-hint)] hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
            title={t(language, 'overtime', 'previewTitle')}
          >
            <Eye size={14} />
          </button>
          <button
            onClick={() => handleExport(overtimeMonth)}
            disabled={exporting}
            className="rounded p-1.5 text-[var(--text-hint)] hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title={t(language, 'overtime', 'exportExcel')}
          >
            {exporting
              ? <Loader2 size={14} className="animate-spin text-indigo-400" />
              : <Download size={14} />}
          </button>
        </div>
      </div>
    </div>

    {ctxMenu && (
      <div
        ref={ctxMenuLayout.ref}
        style={{ ...ctxMenuLayout.style, zIndex: 9999 }}
        className="min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
      >
        <button
          onClick={() => { onEdit(null); setCtxMenu(null); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Plus size={13} />
          <span>{t(language, 'overtime', 'newExtra')}</span>
        </button>
      </div>
    )}

    {entryCtx && (
      <div
        ref={entryCtxLayout.ref}
        style={{ ...entryCtxLayout.style, zIndex: 9999 }}
        className="min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
      >
        <button
          onClick={() => { onEdit(entryCtx.entry); setEntryCtx(null); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Pencil size={13} />
          <span>{t(language, 'overtime', 'editExtra')}</span>
        </button>
        <div className="mx-2 my-1 border-t border-[var(--border)]" />
        <button
          onClick={() => {
            confirmDeleteDialog.request(entryCtx.entry, (en) => void deleteOvertimeEntry(en.id));
            setEntryCtx(null);
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10"
        >
          <Trash2 size={13} />
          <span>{t(language, 'overtime', 'deleteExtra')}</span>
        </button>
      </div>
    )}
    {showPreview && (
      <OvertimePreviewModal
        entries={overtimeEntries}
        meta={overtimeMeta}
        month={overtimeMonth}
        language={language}
        onClose={() => setShowPreview(false)}
        onExport={() => { void handleExport(overtimeMonth); setShowPreview(false); }}
      />
    )}
    {confirmDeleteDialog.isOpen && confirmDeleteDialog.pending && (
      <ConfirmDeleteModal
        title={t(language, 'overtime', 'deleteExtra')}
        message={
          <>
            {t(language, 'overtime', 'deleteExtraAskPrefix')}{' '}
            <span className="font-medium text-[var(--text-primary)]">{formatFecha(confirmDeleteDialog.pending.fecha, language)}</span>
            ? {t(language, 'overtime', 'deleteExtraAskSuffix')}
          </>
        }
        cancelLabel={t(language, 'overtime', 'cancel')}
        confirmLabel={t(language, 'overtime', 'delete')}
        onCancel={confirmDeleteDialog.cancel}
        onConfirm={() => { deleteOvertimeEntry(confirmDeleteDialog.pending!.id); confirmDeleteDialog.cancel(); }}
      />
    )}
  </>);
}
