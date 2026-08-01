import { useEffect, useRef, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, CalendarPlus, CalendarOff, Trash2, Copy, Check, FileText, FileDown, FileType2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { toISO } from '../lib/colombianHolidays';
import { AppCalendarGrid } from './AppDatePicker';
import { AbsenceModal } from './AbsenceModal';
import { placeMenuAtPointer } from '../lib/menuPosition';
import { MONTHS_TITLE, t } from '../lib/i18n';
import { save } from '@tauri-apps/plugin-dialog';
import { fs } from '../lib/invoke';
import jsPDF from 'jspdf';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

const ESTIMATED_DAILY_ENTRY_MENU = { width: 190, height: 96 };
const ESTIMATED_DAILY_EMPTY_MENU = { width: 200, height: 130 };
const ESTIMATED_MONTH_CTX_MENU = { width: 230, height: 180 };

function formatDayLabel(iso: string, language: 'es' | 'en'): string {
  const locale = language === 'es' ? 'es-CO' : 'en-US';
  const d = new Date(iso + 'T12:00:00');
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(d);
  if (language === 'es') {
    return `${weekday} ${d.getDate()} de ${month} de ${d.getFullYear()}`;
  }
  return `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatShortWeekday(iso: string, language: 'es' | 'en') {
  const locale = language === 'es' ? 'es-CO' : 'en-US';
  const d = new Date(iso + 'T12:00:00');
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
}

export function DailyList() {
  const {
    activeSection,
    dailyEntries,
    activeDailyDate,
    activeDailyMonth,
    createTodayDaily,
    createDailyForDate,
    deleteDailyEntry,
    loadDailyMonth,
    setActiveDailyDate,
    setActiveDailyMonth,
    language,
    confirmDestructiveActions,
    deleteDailyMonth,
  } = useAppStore(
    useShallow((s) => ({
      activeSection: s.activeSection,
      dailyEntries: s.dailyEntries,
      activeDailyDate: s.activeDailyDate,
      activeDailyMonth: s.activeDailyMonth,
      createTodayDaily: s.createTodayDaily,
      createDailyForDate: s.createDailyForDate,
      deleteDailyEntry: s.deleteDailyEntry,
      deleteDailyMonth: s.deleteDailyMonth,
      loadDailyMonth: s.loadDailyMonth,
      setActiveDailyDate: s.setActiveDailyDate,
      setActiveDailyMonth: s.setActiveDailyMonth,
      language: s.language,
      confirmDestructiveActions: s.confirmDestructiveActions,
    }))
  );

  // ── Estado del picker de fecha ────────────────────────────────────────────
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, right: 0 });
  const datePickerRef = useRef<HTMLDivElement>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);

  // ── Estado de confirmación de borrado ────────────────────────────────────
  const confirmDeleteDateDialog = useConfirmDelete<string>(confirmDestructiveActions);

  const [listKey, setListKey] = useState(0);
  useEffect(() => {
    setListKey((k) => k + 1);
  }, [activeDailyMonth]);

  // ── Estado del menú contextual (sobre una entrada) ────────────────────────
  const [contextMenu, setContextMenu] = useState<{ date: string; x: number; y: number } | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuReady, setContextMenuReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // ── Estado del menú contextual (espacio vacío) ───────────────────────────
  const [emptyCtx, setEmptyCtx] = useState<{ x: number; y: number } | null>(null);
  const [emptyCtxPos, setEmptyCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [emptyCtxReady, setEmptyCtxReady] = useState(false);
  const emptyCtxRef = useRef<HTMLDivElement>(null);

  // ── Estado del menú contextual (mes) ─────────────────────────────────────
  const [monthCtx, setMonthCtx] = useState<{ x: number; y: number } | null>(null);
  const [deleteMonthConfirm, setDeleteMonthConfirm] = useState(false);
  const [exportingMonth, setExportingMonth] = useState(false);

  // Cierra el menú contextual al hacer clic fuera
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (!contextMenuRef.current?.contains(e.target as Node)) {
        setContextMenu(null);
        setContextMenuPos(null);
        setContextMenuReady(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  // Cierra el menú de espacio vacío al hacer clic fuera
  useEffect(() => {
    if (!emptyCtx) return;
    const handler = (e: MouseEvent) => {
      if (!emptyCtxRef.current?.contains(e.target as Node)) {
        setEmptyCtx(null);
        setEmptyCtxPos(null);
        setEmptyCtxReady(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [emptyCtx]);

  // Cierra el menú del mes al hacer clic fuera
  useEffect(() => {
    if (!monthCtx) return;
    const handler = () => setMonthCtx(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [monthCtx]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;

    const recalc = () => {
      if (!contextMenu || !contextMenuRef.current) return;
      const rect = contextMenuRef.current.getBoundingClientRect();
      setContextMenuPos(
        placeMenuAtPointer(
          { x: contextMenu.x, y: contextMenu.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setContextMenuReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [contextMenu]);

  useEffect(() => {
    if (!emptyCtx || !emptyCtxRef.current) return;

    const recalc = () => {
      if (!emptyCtx || !emptyCtxRef.current) return;
      const rect = emptyCtxRef.current.getBoundingClientRect();
      setEmptyCtxPos(
        placeMenuAtPointer(
          { x: emptyCtx.x, y: emptyCtx.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setEmptyCtxReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [emptyCtx]);



  // Cierra el picker al hacer clic fuera
  useEffect(() => {
    if (!showDatePicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePicker = datePickerRef.current?.contains(target);
      const insideBtn = pickerBtnRef.current?.contains(target);
      if (!insidePicker && !insideBtn) setShowDatePicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDatePicker]);

  const handleOpenPicker = () => {
    if (!showDatePicker && pickerBtnRef.current) {
      const rect = pickerBtnRef.current.getBoundingClientRect();
      const dropdownWidth = 240; // w-60
      const centeredLeft = rect.left + rect.width / 2 - dropdownWidth / 2;
      setPickerPos({
        top: rect.bottom + 4,
        right: Math.max(4, window.innerWidth - centeredLeft - dropdownWidth),
      });
    }
    setShowDatePicker((v) => !v);
  };

  const handleConfirmDelete = async (date: string) => {
    await deleteDailyEntry(date);
  };

  const handleContextMenu = (e: React.MouseEvent, date: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuReady(false);
    setContextMenuPos(
      placeMenuAtPointer(
        { x: e.clientX, y: e.clientY },
        ESTIMATED_DAILY_ENTRY_MENU,
        { padding: 8 },
      ),
    );
    setContextMenu({ date, x: e.clientX, y: e.clientY });
  };

  const handleCopyToClipboard = async () => {
    if (!contextMenu) return;
    const content = dailyEntries[contextMenu.date] ?? '';
    const label = formatDayLabel(contextMenu.date, language);
    await navigator.clipboard.writeText(`${label}\n\n${content}`);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setContextMenu(null);
      setContextMenuPos(null);
      setContextMenuReady(false);
    }, 1200);
  };

  const handleDeleteFromMenu = () => {
    if (!contextMenu) return;
    confirmDeleteDateDialog.request(contextMenu.date, (d: string) => void deleteDailyEntry(d));
    setContextMenu(null);
    setContextMenuPos(null);
    setContextMenuReady(false);
  };

  const closeMonthCtx = () => setMonthCtx(null);

  const handleExportMonth = async (format: 'pdf' | 'md' | 'txt') => {
    closeMonthCtx();
    setExportingMonth(true);
    try {
      const [yearStr, monthStr] = activeDailyMonth.split('-');
      const label = `${MONTHS_TITLE[language][parseInt(monthStr) - 1]}-${yearStr}`;
      const entries = Object.entries(dailyEntries)
        .filter(([d]) => d.startsWith(activeDailyMonth))
        .sort(([a], [b]) => a.localeCompare(b));

      if (format === 'pdf') {
        const path = await save({
          defaultPath: `dailys-${activeDailyMonth}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (!path) return;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        const margin = 15;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const maxWidth = pageWidth - margin * 2;
        let y = margin;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.text(label, margin, y);
        y += 10;
        for (const [date, content] of entries) {
          if (y > 270) { pdf.addPage(); y = margin; }
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(11);
          pdf.text(date, margin, y);
          y += 6;
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          const lines = content.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            const wrapped = pdf.splitTextToSize(line, maxWidth);
            if (y + wrapped.length * 4.5 > 280) { pdf.addPage(); y = margin; }
            pdf.text(wrapped, margin, y);
            y += wrapped.length * 4.5;
          }
          y += 5;
        }
        const base64 = pdf.output('datauristring').split(',')[1];
        await fs.writeBinary(path, base64);
      } else {
        const path = await save({
          defaultPath: `dailys-${activeDailyMonth}.${format}`,
          filters: [{ name: format === 'md' ? 'Markdown' : 'Plain text', extensions: [format] }],
        });
        if (!path) return;
        const ismd = format === 'md';
        const header = ismd ? `# ${label}\n\n` : `${label}\n${'='.repeat(label.length)}\n\n`;
        const body = entries
          .map(([date, content]) =>
            ismd ? `## ${date}\n\n${content}` : `${date}\n${'-'.repeat(date.length)}\n${content}`
          )
          .join('\n\n---\n\n');
        await fs.writeFile(path, header + body + '\n');
      }
    } finally {
      setExportingMonth(false);
    }
  };

  const todayISO = toISO(new Date());
  const tomorrowISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISO(d);
  })();
  const todayYM = todayISO.slice(0, 7);

  // Cargar mes activo al cambiar
  useEffect(() => {
    if (activeSection === 'dailys') {
      loadDailyMonth(activeDailyMonth);
    }
  }, [activeSection, activeDailyMonth]);

  if (activeSection !== 'dailys') return null;

  const [yearStr, monthStr] = activeDailyMonth.split('-');
  const monthLabel = `${MONTHS_TITLE[language][parseInt(monthStr) - 1]} ${yearStr}`;
  const isCurrentMonth = activeDailyMonth === todayYM;

  // Entradas del mes activo, ordenadas desc
  const monthDates = Object.keys(dailyEntries)
    .filter((d) => d.startsWith(activeDailyMonth))
    .sort()
    .reverse();

  const goPrevMonth = () => {
    const [y, m] = activeDailyMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setActiveDailyMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    );
  };

  const goNextMonth = () => {
    const [y, m] = activeDailyMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setActiveDailyMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    );
  };

  return (<>
    <div className="flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]" style={{ width: 'var(--logday-list-w)' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t(language, 'dailys', 'title')}</h2>
        <div className="flex items-center gap-1">
          {/* Selector de fecha – dropdown con posición fija */}
          <div className="relative">
            <button
              ref={pickerBtnRef}
              onClick={handleOpenPicker}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition ${
                showDatePicker
                  ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                  : 'text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
              title={t(language, 'dailys', 'addPreviousDateTitle')}
            >
              <CalendarPlus size={13} />
              {t(language, 'dailys', 'dateBtn')}
            </button>
          </div>
          {/* Dropdown renderizado con position:fixed para evitar clipping */}
          {showDatePicker && (
            <div
              ref={datePickerRef}
              style={{ position: 'fixed', top: pickerPos.top, right: pickerPos.right, zIndex: 9999 }}
              className="w-60 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-3 shadow-2xl"
            >
              <p className="mb-2 text-[11px] font-medium text-[var(--text-hint)]">
                {t(language, 'dailys', 'pickDateTitle')}
              </p>
              <AppCalendarGrid
                value=""
                max={tomorrowISO}
                onChange={(iso) => {
                  createDailyForDate(iso);
                  setShowDatePicker(false);
                }}
              />
            </div>
          )}
          <button
            onClick={() => setShowAbsenceModal(true)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title={t(language, 'absence', 'markButton')}
          >
            <CalendarOff size={14} />
          </button>
          <button
            onClick={createTodayDaily}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-400 transition hover:bg-indigo-500/10"
            title={t(language, 'dailys', 'createTodayTitle')}
          >
            <Plus size={14} />
            {t(language, 'dailys', 'todayBtn')}
          </button>
        </div>
      </div>

      {showAbsenceModal && (
        <AbsenceModal onClose={() => setShowAbsenceModal(false)} />
      )}

      {/* Navegación de mes */}
      <div
        className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const pos = placeMenuAtPointer(
            { x: e.clientX, y: e.clientY },
            ESTIMATED_MONTH_CTX_MENU,
            { padding: 8 },
          );
          setMonthCtx(pos);
        }}
      >
        <button
          onClick={goPrevMonth}
          className="rounded p-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title={t(language, 'dailys', 'prevMonth')}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-medium text-[var(--text-secondary)]">{monthLabel}</span>
        <button
          onClick={goNextMonth}
          disabled={isCurrentMonth}
          className="rounded p-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-30"
          title={t(language, 'dailys', 'nextMonth')}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Lista de entradas */}
      <div
        className="flex-1 overflow-y-auto p-3"
        onContextMenu={(e) => {
          e.preventDefault();
          setEmptyCtxReady(false);
          setEmptyCtxPos(
            placeMenuAtPointer(
              { x: e.clientX, y: e.clientY },
              ESTIMATED_DAILY_EMPTY_MENU,
              { padding: 8 },
            ),
          );
          setEmptyCtx({ x: e.clientX, y: e.clientY });
        }}
      >
        {monthDates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <p className="text-sm text-[var(--text-hint)]">{t(language, 'dailys', 'emptyMonth')}</p>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              {t(language, 'dailys', 'emptyMonthHint')}
            </p>
          </div>
        ) : (
          <div key={listKey} className="flex flex-col gap-2">
            {monthDates.map((date, idx) => {
            const isActive = activeDailyDate === date;
            const isToday = date === todayISO;
            const d = new Date(date + 'T12:00:00');
            const dayName = formatShortWeekday(date, language);
            const dayNum = d.getDate();
            const lines = (dailyEntries[date] ?? '').split('\n').filter((l) => l.trim().startsWith('-'));
            const taskCount = lines.length;
            const preview = lines[0]?.replace(/^-\s*/, '').slice(0, 45) ?? '';

            return (
              <div key={date} className={`task-row-enter task-d${Math.min(idx, 10)} group relative`}>
                <button
                  onContextMenu={(e) => handleContextMenu(e, date)}
                  onClick={() => setActiveDailyDate(isActive ? null : date)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    isActive
                      ? 'border-indigo-500/50 bg-indigo-500/10'
                      : isToday
                      ? 'border-indigo-500/20 bg-[var(--bg-surface)] hover:border-indigo-500/40 hover:bg-[var(--bg-hover)]'
                      : 'border-[var(--border-card)] bg-[var(--bg-surface)] hover:border-[var(--border)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xl font-bold leading-none tabular-nums ${
                          isActive
                            ? 'text-indigo-400'
                            : isToday
                            ? 'text-indigo-300'
                            : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {dayNum}
                      </span>
                      <div className="flex flex-col">
                        <span className={`text-xs font-semibold ${isActive ? 'text-indigo-400' : 'text-[var(--text-secondary)]'}`}>
                          {dayName}
                        </span>
                        {taskCount > 0 && (
                          <span className="text-[10px] text-[var(--text-faint)]">
                            {taskCount} {taskCount === 1 ? t(language, 'dailys', 'taskOne') : t(language, 'dailys', 'taskMany')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {preview && (
                    <p className="mt-1.5 truncate text-[11px] text-[var(--text-hint)]">{preview}</p>
                  )}
                  {isToday && (
                    <div className="flex justify-end mt-1">
                      <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-indigo-400">
                        {t(language, 'dailys', 'todayBadge')}
                      </span>
                    </div>
                  )}
                </button>

                {/* Botón borrar – visible al hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmDeleteDateDialog.request(date, (d: string) => void deleteDailyEntry(d));
                  }}
                  className="absolute right-2 top-2 rounded-md p-1 text-[var(--text-faint)] opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                  title={t(language, 'dailys', 'deleteDailyTitle')}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>

    {/* Menú contextual – mes */}
    {monthCtx && (
      <div
        style={{ position: 'fixed', top: monthCtx.y, left: monthCtx.x, zIndex: 9999 }}
        className="min-w-[210px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
      >
        <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--text-faint)]">
          {monthLabel}
        </p>
        <div className="mx-2 my-1 border-t border-[var(--border)]" />
        <button
          onClick={() => handleExportMonth('md')}
          disabled={exportingMonth || monthDates.length === 0}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <FileText size={13} />
          <span>{t(language, 'dailys', 'monthCtxExportMd')}</span>
        </button>
        <button
          onClick={() => handleExportMonth('txt')}
          disabled={exportingMonth || monthDates.length === 0}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <FileDown size={13} />
          <span>{t(language, 'dailys', 'monthCtxExportTxt')}</span>
        </button>
        <button
          onClick={() => handleExportMonth('pdf')}
          disabled={exportingMonth || monthDates.length === 0}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <FileType2 size={13} />
          <span>{t(language, 'dailys', 'monthCtxExportPdf')}</span>
        </button>
        <div className="mx-2 my-1 border-t border-[var(--border)]" />
        <button
          onClick={() => { closeMonthCtx(); setDeleteMonthConfirm(true); }}
          disabled={monthDates.length === 0}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
        >
          <Trash2 size={13} />
          <span>{t(language, 'dailys', 'monthCtxDelete')}</span>
        </button>
      </div>
    )}

    {/* Menú contextual – espacio vacío */}
    {emptyCtx && (
      <div
        ref={emptyCtxRef}
        style={{ position: 'fixed', top: emptyCtxPos?.y ?? 8, left: emptyCtxPos?.x ?? 8, zIndex: 9999, visibility: emptyCtxReady ? 'visible' : 'hidden' }}
        className="min-w-[190px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
      >
        <button
          onClick={() => {
            createTodayDaily();
            setEmptyCtx(null);
            setEmptyCtxPos(null);
            setEmptyCtxReady(false);
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Plus size={13} />
          <span>{t(language, 'dailys', 'addToday')}</span>
        </button>
        <button
          onClick={() => {
            setShowDatePicker(true);
            setEmptyCtx(null);
            setEmptyCtxPos(null);
            setEmptyCtxReady(false);
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <CalendarPlus size={13} />
          <span>{t(language, 'dailys', 'addOtherDate')}</span>
        </button>
        <div className="mx-2 my-1 border-t border-[var(--border)]" />
        <button
          onClick={() => {
            setActiveDailyMonth(todayYM);
            setActiveDailyDate(todayISO);
            setEmptyCtx(null);
            setEmptyCtxPos(null);
            setEmptyCtxReady(false);
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ChevronRight size={13} />
          <span>{t(language, 'dailys', 'goToCurrentDay')}</span>
        </button>
      </div>
    )}

    {/* Menú contextual – entrada específica */}
    {contextMenu && (
      <div
        ref={contextMenuRef}
        style={{ position: 'fixed', top: contextMenuPos?.y ?? 8, left: contextMenuPos?.x ?? 8, zIndex: 9999, visibility: contextMenuReady ? 'visible' : 'hidden' }}
        className="min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
      >
        <button
          onClick={handleCopyToClipboard}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          <span>{copied ? t(language, 'dailys', 'copied') : t(language, 'dailys', 'copyClipboard')}</span>
        </button>
        <div className="mx-2 my-1 border-t border-[var(--border)]" />
        <button
          onClick={handleDeleteFromMenu}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10"
        >
          <Trash2 size={13} />
          <span>{t(language, 'dailys', 'deleteDailyTitle')}</span>
        </button>
      </div>
    )}

    {/* Modal confirmación eliminar mes (siempre obligatorio) */}
    {deleteMonthConfirm && (
      <ConfirmDeleteModal
        variant="soft"
        title={t(language, 'dailys', 'deleteMonthTitle')}
        message={
          <>
            {t(language, 'dailys', 'deleteMonthConfirm')}{' '}
            <span className="font-semibold text-[var(--text-body)]">{monthLabel}</span>?
            <br />
            <span className="mt-1 inline-block text-[10px] text-red-400/80">{t(language, 'dailys', 'deleteMonthWarn')}</span>
          </>
        }
        cancelLabel={t(language, 'dailys', 'cancel')}
        confirmLabel={t(language, 'dailys', 'deleteMonth')}
        onCancel={() => setDeleteMonthConfirm(false)}
        onConfirm={async () => { setDeleteMonthConfirm(false); await deleteDailyMonth(activeDailyMonth); }}
      />
    )}

    {/* Modal de confirmación de borrado */}
    {confirmDeleteDateDialog.isOpen && confirmDeleteDateDialog.pending && (
      <ConfirmDeleteModal
        variant="soft"
        title={t(language, 'dailys', 'deleteDailyTitle')}
        message={
          <>
            {t(language, 'dailys', 'deleteConfirmPrefix')}{' '}
            <span className="font-medium text-[var(--text-body)]">{formatDayLabel(confirmDeleteDateDialog.pending, language)}</span>.
            {' '}{t(language, 'dailys', 'deleteConfirmSuffix')}
          </>
        }
        cancelLabel={t(language, 'dailys', 'cancel')}
        confirmLabel={t(language, 'dailys', 'delete')}
        onCancel={confirmDeleteDateDialog.cancel}
        onConfirm={() => { void handleConfirmDelete(confirmDeleteDateDialog.pending!); confirmDeleteDateDialog.cancel(); }}
      />
    )}
  </>);
}
