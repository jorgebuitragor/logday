import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Download, Trash2, X, User, Pencil } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { OvertimeEntry } from '../types';

interface Props {
  onEdit: (entry: OvertimeEntry | null) => void;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatFecha(fecha: string): string {
  const [, month, day] = fecha.split('-');
  return `${parseInt(day)} ${MONTH_NAMES[parseInt(month) - 1].slice(0, 3)}`;
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

export function OvertimeList({ onEdit }: Props) {
  const {
    overtimeEntries, overtimeMonth, loadOvertimeMonth,
    deleteOvertimeEntry, exportOvertimeExcel,
    overtimeMeta, setOvertimeMeta,
  } = useAppStore(
    useShallow((s) => ({
      overtimeEntries: s.overtimeEntries,
      overtimeMonth: s.overtimeMonth,
      loadOvertimeMonth: s.loadOvertimeMonth,
      deleteOvertimeEntry: s.deleteOvertimeEntry,
      exportOvertimeExcel: s.exportOvertimeExcel,
      overtimeMeta: s.overtimeMeta,
      setOvertimeMeta: s.setOvertimeMeta,
    }))
  );
  const [showConfig, setShowConfig] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<OvertimeEntry | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const [entryCtx, setEntryCtx] = useState<{ entry: OvertimeEntry; x: number; y: number } | null>(null);
  const entryCtxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (!ctxMenuRef.current?.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  useEffect(() => {
    if (!entryCtx) return;
    const handler = (e: MouseEvent) => {
      if (!entryCtxRef.current?.contains(e.target as Node)) setEntryCtx(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [entryCtx]);

  // Cargar entradas del mes al montar
  useEffect(() => {
    loadOvertimeMonth(overtimeMonth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [year, month] = overtimeMonth.split('-').map(Number);

  const totalHoras = overtimeEntries.reduce((a, e) => a + e.totalHoras, 0);
  const totalDiurnas = overtimeEntries.reduce((a, e) => a + e.extrasDiurnas, 0);
  const totalNocturnas = overtimeEntries.reduce((a, e) => a + e.extrasNocturnas, 0);
  const totalDiurnasFest = overtimeEntries.reduce((a, e) => a + e.extrasDiurnasFestivas, 0);
  const totalNocturnasFest = overtimeEntries.reduce((a, e) => a + e.extrasNocturnasFestivas, 0);

  const fmt = (n: number) => Math.round(n * 100) / 100;

  const inputCls = 'w-full rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none';

  return (<>
    <div className="flex h-full w-72 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
      {/* Navegación año / mes */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-2">
        <button
          onClick={() => loadOvertimeMonth(prevMonth(overtimeMonth))}
          className="rounded p-1 text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title="Mes anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <div className="flex flex-1 flex-col items-center">
          <span className="text-[10px] text-[var(--text-hint)] leading-none">{year}</span>
          <span className="text-xs font-semibold text-[var(--text-primary)]">{MONTH_NAMES[month - 1]}</span>
        </div>
        <button
          onClick={() => loadOvertimeMonth(nextMonth(overtimeMonth))}
          className="rounded p-1 text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title="Mes siguiente"
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
            <p className="text-sm">Sin horas extras este mes</p>
            <button
              onClick={() => onEdit(null)}
              className="text-xs text-indigo-400 hover:underline"
            >
              + Agregar primera entrada
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {overtimeEntries.map((entry) => (
              <li
                key={entry.id}
                className="group flex cursor-pointer items-start gap-2 px-3 py-2.5 hover:bg-[var(--bg-hover)]"
                onClick={() => onEdit(entry)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setEntryCtx({ entry, x: e.clientX, y: e.clientY }); }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-indigo-400">{formatFecha(entry.fecha)}</span>
                    <span className="text-[10px] text-[var(--text-hint)]">{entry.horaInicio}–{entry.horaFinal}</span>
                    <span className="ml-auto text-[10px] font-medium text-[var(--text-secondary)]">{fmt(entry.totalHoras)}h</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-primary)]">
                    {entry.actividad || <span className="italic text-[var(--text-hint)]">Sin descripción</span>}
                  </p>
                  {entry.observaciones && (
                    <span className="mt-0.5 inline-block rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-400">
                      {entry.observaciones}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(entry); }}
                  className="mt-0.5 hidden shrink-0 rounded p-1 text-[var(--text-hint)] hover:text-red-400 hover:bg-red-500/10 group-hover:flex"
                  title="Eliminar"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Totales del mes */}
      {overtimeEntries.length > 0 && (
        <div className="border-t border-[var(--border)] px-3 py-2 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-hint)]">Total del mes</p>
          <div className="grid grid-cols-2 gap-x-2 text-xs text-[var(--text-hint)]">
            <span>Total:</span><span className="text-right font-semibold text-[var(--text-primary)]">{fmt(totalHoras)}h</span>
            <span>Diurnas:</span><span className="text-right">{fmt(totalDiurnas)}h</span>
            <span>Nocturnas:</span><span className="text-right">{fmt(totalNocturnas)}h</span>
            <span>Diurnas fest.:</span><span className="text-right">{fmt(totalDiurnasFest)}h</span>
            <span>Nocturnas fest.:</span><span className="text-right">{fmt(totalNocturnasFest)}h</span>
          </div>
        </div>
      )}

      {/* Panel datos colaborador (encima del toolbar, colapsable) */}
      {showConfig && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-base)] px-3 py-3 space-y-2 animate-in">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-hint)]">Datos del colaborador</p>
            <button onClick={() => setShowConfig(false)} className="rounded p-0.5 text-[var(--text-hint)] hover:text-[var(--text-primary)]">
              <X size={12} />
            </button>
          </div>
          <div className="space-y-1.5">
            <input
              className={inputCls}
              value={overtimeMeta.colaborador}
              onChange={(e) => setOvertimeMeta({ colaborador: e.target.value })}
              placeholder="Nombre completo"
            />
            <input
              className={inputCls}
              value={overtimeMeta.cedula}
              onChange={(e) => setOvertimeMeta({ cedula: e.target.value })}
              placeholder="Número de cédula"
            />
          </div>
          <p className="text-[10px] text-[var(--text-hint)]">Se usarán en todos los reportes exportados.</p>
        </div>
      )}

      {/* Barra de acciones (bottom) */}
      <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(null)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-indigo-400 hover:bg-indigo-500/10 transition-colors"
            title="Nueva entrada"
          >
            <Plus size={14} />
            Nueva extra
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowConfig((v) => !v)}
            className={`rounded p-1.5 transition-colors ${
              showConfig
                ? 'text-indigo-400 bg-indigo-500/10'
                : 'text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
            title="Datos del colaborador"
          >
            <User size={14} />
          </button>
          <button
            onClick={() => exportOvertimeExcel(overtimeMonth)}
            className="rounded p-1.5 text-[var(--text-hint)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            title="Exportar a Excel"
          >
            <Download size={14} />
          </button>
        </div>
      </div>
    </div>

    {ctxMenu && (
      <div
        ref={ctxMenuRef}
        style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
        className="min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
      >
        <button
          onClick={() => { onEdit(null); setCtxMenu(null); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Plus size={13} />
          <span>Nueva extra</span>
        </button>
      </div>
    )}

    {entryCtx && (
      <div
        ref={entryCtxRef}
        style={{ position: 'fixed', top: entryCtx.y, left: entryCtx.x, zIndex: 9999 }}
        className="min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
      >
        <button
          onClick={() => { onEdit(entryCtx.entry); setEntryCtx(null); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Pencil size={13} />
          <span>Editar extra</span>
        </button>
        <div className="mx-2 my-1 border-t border-[var(--border)]" />
        <button
          onClick={() => { setConfirmDelete(entryCtx.entry); setEntryCtx(null); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10"
        >
          <Trash2 size={13} />
          <span>Eliminar extra</span>
        </button>
      </div>
    )}
    {confirmDelete && (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
        <div className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Trash2 size={15} className="text-red-400" />
            Eliminar extra
          </div>
          <p className="mb-4 text-xs text-[var(--text-secondary)]">
            ¿Eliminar la extra del <span className="font-medium text-[var(--text-primary)]">{formatFecha(confirmDelete.fecha)}</span>? Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
            >
              Cancelar
            </button>
            <button
              onClick={() => { deleteOvertimeEntry(confirmDelete.id); setConfirmDelete(null); }}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    )}
  </>);
}
