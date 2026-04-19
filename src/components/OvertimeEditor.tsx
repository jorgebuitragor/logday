import { useState, useEffect, useMemo } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { OvertimeEntry } from '../types';
import { calcOvertimeBreakdown } from '../lib/overtimeCalc';
import { AppDatePicker } from './AppDatePicker';

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function findConflicts(
  entries: OvertimeEntry[],
  fecha: string,
  horaInicio: string,
  horaFinal: string,
  excludeId?: string,
): OvertimeEntry[] {
  const start = toMinutes(horaInicio);
  const end = toMinutes(horaFinal);
  return entries.filter((e) => {
    if (e.fecha !== fecha) return false;
    if (excludeId && e.id === excludeId) return false;
    const s = toMinutes(e.horaInicio);
    const f = toMinutes(e.horaFinal);
    return start < f && s < end;
  });
}

interface Props {
  entry: OvertimeEntry | null; // null = nueva entrada
  onClose: () => void;
}

const COMP_OPTIONS = ['Compensatorio', 'Pago', 'Otro'] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OvertimeEditor({ entry, onClose }: Props) {
  const { saveOvertimeEntry, overtimeMonth, overtimeEntries } = useAppStore();

  const [fecha, setFecha] = useState(entry?.fecha ?? today());
  const [solicitadaPor, setSolicitadaPor] = useState(entry?.solicitadaPor ?? '');
  const [actividad, setActividad] = useState(entry?.actividad ?? '');
  const [observaciones, setObservaciones] = useState<string>(entry?.observaciones ?? 'Compensatorio');
  const [horaInicio, setHoraInicio] = useState(entry?.horaInicio ?? '18:00');
  const [horaFinal, setHoraFinal] = useState(entry?.horaFinal ?? '20:00');
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<OvertimeEntry[]>([]);

  const preview = useMemo(() => {
    if (!horaInicio || !horaFinal || !fecha) return null;
    try { return calcOvertimeBreakdown(fecha, horaInicio, horaFinal); }
    catch { return null; }
  }, [fecha, horaInicio, horaFinal]);

  const fmt = (n: number) => Math.round(n * 100) / 100;

  async function handleSave() {
    if (!fecha || !horaInicio || !horaFinal) return;
    const found = findConflicts(overtimeEntries, fecha, horaInicio, horaFinal, entry?.id);
    if (found.length > 0) {
      setConflicts(found);
      return;
    }
    await doSave();
  }

  async function doSave() {
    setSaving(true);
    setConflicts([]);
    try {
      await saveOvertimeEntry({ id: entry?.id, fecha, solicitadaPor, actividad, observaciones, horaInicio, horaFinal });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!entry) {
      const [y, m] = overtimeMonth.split('-');
      const currentMonth = new Date().toISOString().slice(0, 7);
      setFecha(currentMonth === overtimeMonth ? today() : `${y}-${m}-01`);
    }
  }, [entry, overtimeMonth]);

  const inputCls = 'w-full rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none';
  const labelCls = 'text-xs font-medium text-[var(--text-secondary)]';

  // Clave única: dispara animación al cambiar entre nuevo/edición o entre distintas entradas
  const animKey = entry ? `edit-${entry.id}` : 'new';
  const animClass = entry ? 'animate-fade-in' : 'animate-in';

  return (
    <div key={animKey} className={`${animClass} flex h-full flex-1 flex-col overflow-hidden bg-[var(--bg-base)]`}>
      {/* Modal de conflicto de horario */}
      {conflicts.length > 0 && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-400">
              <AlertTriangle size={15} />
              Conflicto de horario
            </div>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              El horario <span className="font-medium text-[var(--text-primary)]">{horaInicio}–{horaFinal}</span> se
              cruza con {conflicts.length === 1 ? 'esta entrada' : 'estas entradas'} del mismo día:
            </p>
            <ul className="mb-4 space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2.5">
              {conflicts.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[var(--text-primary)]">{c.horaInicio}–{c.horaFinal}</span>
                  <span className="text-[var(--text-secondary)] truncate ml-3">{c.actividad || c.solicitadaPor || '—'}</span>
                </li>
              ))}
            </ul>
            <p className="mb-4 text-xs text-[var(--text-hint)]">
              Revisa las horas o guarda de todas formas si el cruce es intencional.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConflicts([])}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                Revisar horas
              </button>
              <button
                onClick={doSave}
                disabled={saving}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-400 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar de todas formas'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Barra superior */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {entry ? 'Editar entrada' : 'Nueva hora extra'}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !fecha || !horaInicio || !horaFinal}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={13} />
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Detalle de la entrada */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-hint)]">Detalle de la hora extra</p>

          {/* Fecha */}
          <div className="space-y-1">
            <label className={labelCls}>Fecha</label>
            <AppDatePicker value={fecha} onChange={setFecha} />
          </div>

          {/* Horas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>Hora inicio</label>
              <input type="time" className={inputCls} value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Hora final</label>
              <input type="time" className={inputCls} value={horaFinal} onChange={(e) => setHoraFinal(e.target.value)} />
            </div>
          </div>

          {/* Solicitada por */}
          <div className="space-y-1">
            <label className={labelCls}>Solicitada por</label>
            <input
              className={inputCls}
              value={solicitadaPor}
              onChange={(e) => setSolicitadaPor(e.target.value)}
              placeholder="Nombre del solicitante"
            />
          </div>

          {/* Actividad */}
          <div className="space-y-1">
            <label className={labelCls}>Actividad realizada</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              value={actividad}
              onChange={(e) => setActividad(e.target.value)}
              placeholder="Describe la actividad realizada…"
            />
          </div>

          {/* Compensatorio/Pago — botones */}
          <div className="space-y-1.5">
            <label className={labelCls}>Compensatorio / Pago</label>
            <div className="flex gap-2">
              {COMP_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setObservaciones(opt)}
                  className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                    observaciones === opt
                      ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400'
                      : 'border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-hint)] hover:border-[var(--text-hint)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Preview del cálculo */}
        {preview && (
          <section className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Desglose automático</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-[var(--text-hint)]">Total horas:</span>
              <span className="font-semibold text-[var(--text-primary)]">{fmt(preview.totalHoras)}h</span>
              <span className="text-[var(--text-hint)]">Extras diurnas:</span>
              <span className="text-[var(--text-primary)]">{fmt(preview.extrasDiurnas)}h</span>
              <span className="text-[var(--text-hint)]">Extras nocturnas:</span>
              <span className="text-[var(--text-primary)]">{fmt(preview.extrasNocturnas)}h</span>
              <span className="text-[var(--text-hint)]">Diurnas festivas:</span>
              <span className="text-[var(--text-primary)]">{fmt(preview.extrasDiurnasFestivas)}h</span>
              <span className="text-[var(--text-hint)]">Nocturnas festivas:</span>
              <span className="text-[var(--text-primary)]">{fmt(preview.extrasNocturnasFestivas)}h</span>
            </div>
            <p className="text-xs text-[var(--text-hint)]">Diurno: 06:00–19:00 · Nocturno: 19:00–06:00</p>
          </section>
        )}
      </div>
    </div>
  );
}
