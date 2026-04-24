import { useEffect, useRef, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, CalendarPlus, Trash2, Copy, Check } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { toISO } from '../lib/colombianHolidays';
import { AppCalendarGrid } from './AppDatePicker';
import { placeMenuAtPointer } from '../lib/menuPosition';

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const ESTIMATED_DAILY_ENTRY_MENU = { width: 190, height: 96 };
const ESTIMATED_DAILY_EMPTY_MENU = { width: 200, height: 130 };

function formatDayLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`;
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
  } = useAppStore(
    useShallow((s) => ({
      activeSection: s.activeSection,
      dailyEntries: s.dailyEntries,
      activeDailyDate: s.activeDailyDate,
      activeDailyMonth: s.activeDailyMonth,
      createTodayDaily: s.createTodayDaily,
      createDailyForDate: s.createDailyForDate,
      deleteDailyEntry: s.deleteDailyEntry,
      loadDailyMonth: s.loadDailyMonth,
      setActiveDailyDate: s.setActiveDailyDate,
      setActiveDailyMonth: s.setActiveDailyMonth,
    }))
  );

  // ── Estado del picker de fecha ────────────────────────────────────────────
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, right: 0 });
  const datePickerRef = useRef<HTMLDivElement>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);

  // ── Estado de confirmación de borrado ────────────────────────────────────
  const [deleteConfirmDate, setDeleteConfirmDate] = useState<string | null>(null);

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

  const handleConfirmDelete = async () => {
    if (!deleteConfirmDate) return;
    await deleteDailyEntry(deleteConfirmDate);
    setDeleteConfirmDate(null);
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
    const label = formatDayLabel(contextMenu.date);
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
    setDeleteConfirmDate(contextMenu.date);
    setContextMenu(null);
    setContextMenuPos(null);
    setContextMenuReady(false);
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
  const monthLabel = `${MONTHS_ES[parseInt(monthStr) - 1]} ${yearStr}`;
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
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Dailys</h2>
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
              title="Añadir daily para una fecha anterior"
            >
              <CalendarPlus size={13} />
              Fecha
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
                Elegir fecha para daily
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
            onClick={createTodayDaily}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-400 transition hover:bg-indigo-500/10"
            title="Crear daily de hoy"
          >
            <Plus size={14} />
            Hoy
          </button>
        </div>
      </div>

      {/* Navegación de mes */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <button
          onClick={goPrevMonth}
          className="rounded p-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Mes anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-medium text-[var(--text-secondary)]">{monthLabel}</span>
        <button
          onClick={goNextMonth}
          disabled={isCurrentMonth}
          className="rounded p-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-30"
          title="Mes siguiente"
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
            <p className="text-sm text-[var(--text-hint)]">Sin dailys este mes</p>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              Pulsa "Hoy" o elige una fecha con el botón "Fecha"
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {monthDates.map((date) => {
            const isActive = activeDailyDate === date;
            const isToday = date === todayISO;
            const d = new Date(date + 'T12:00:00');
            const dayName = DAYS_SHORT[d.getDay()];
            const dayNum = d.getDate();
            const lines = (dailyEntries[date] ?? '').split('\n').filter((l) => l.trim().startsWith('-'));
            const taskCount = lines.length;
            const preview = lines[0]?.replace(/^-\s*/, '').slice(0, 45) ?? '';

            return (
              <div key={date} className="animate-in group relative">
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
                            {taskCount} {taskCount === 1 ? 'tarea' : 'tareas'}
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
                        HOY
                      </span>
                    </div>
                  )}
                </button>

                {/* Botón borrar – visible al hover */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmDate(date); }}
                  className="absolute right-2 top-2 rounded-md p-1 text-[var(--text-faint)] opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                  title="Eliminar daily"
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
          <span>Añadir daily de hoy</span>
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
          <span>Añadir daily para otra fecha</span>
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
          <span>Ir al día actual</span>
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
          <span>{copied ? 'Copiado' : 'Copiar al portapapeles'}</span>
        </button>
        <div className="mx-2 my-1 border-t border-[var(--border)]" />
        <button
          onClick={handleDeleteFromMenu}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10"
        >
          <Trash2 size={13} />
          <span>Eliminar daily</span>
        </button>
      </div>
    )}

    {/* Modal de confirmación de borrado */}
    {deleteConfirmDate && (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50">
        <div className="w-80 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 shadow-2xl">
          <div className="mb-3 flex items-center gap-2 text-red-400">
            <Trash2 size={16} />
            <h3 className="text-sm font-semibold">Eliminar daily</h3>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-hint)]">
            Se eliminará el registro del{' '}
            <span className="font-medium text-[var(--text-body)]">{formatDayLabel(deleteConfirmDate)}</span>.
            Esta acción no se puede deshacer.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setDeleteConfirmDate(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmDelete}
              className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    )}
  </>);
}
