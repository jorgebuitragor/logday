import { useState, useEffect, useMemo } from 'react';
import { X, Save, AlertTriangle, Plus, Pencil, RotateCcw } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { OvertimeEntry } from '../types';
import { calcOvertimeBreakdown } from '../lib/overtimeCalc';
import { AppDatePicker } from './AppDatePicker';
import { t, MONTHS_TITLE } from '../lib/i18n';
import { toISO } from '../lib/colombianHolidays';

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

const COMP_OPTIONS = ['comp', 'pay', 'other'] as const;

function today(): string {
  return toISO(new Date());
}

export function OvertimeEditor({ entry, onClose }: Props) {
  const { saveOvertimeEntry, overtimeMonth, overtimeEntries, language, showToast } = useAppStore();

  const [fecha, setFecha] = useState(entry?.fecha ?? today());
  const [solicitadaPor, setSolicitadaPor] = useState(entry?.solicitadaPor ?? '');
  const [actividad, setActividad] = useState(entry?.actividad ?? '');
  const [observaciones, setObservaciones] = useState<string>(entry?.observaciones ?? 'pay');
  const [horaInicio, setHoraInicio] = useState(entry?.horaInicio ?? '18:00');
  const [horaFinal, setHoraFinal] = useState(entry?.horaFinal ?? '20:00');
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<OvertimeEntry[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState(entry ? {
    fecha: entry.fecha,
    solicitadaPor: entry.solicitadaPor ?? '',
    actividad: entry.actividad ?? '',
    observaciones: entry.observaciones ?? 'pay',
    horaInicio: entry.horaInicio,
    horaFinal: entry.horaFinal,
  } : null);

  const preview = useMemo(() => {
    if (!horaInicio || !horaFinal || !fecha) return null;
    try { return calcOvertimeBreakdown(fecha, horaInicio, horaFinal); }
    catch { return null; }
  }, [fecha, horaInicio, horaFinal]);

  const fmt = (n: number) => Math.round(n * 100) / 100;

  async function handleSave() {
    if (!fecha || !horaInicio || !horaFinal || !actividad.trim()) return;
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
      showToast({ kind: 'success', title: t(language, 'overtime', 'savedToast') });
      if (entry) {
        setSavedSnapshot({ fecha, solicitadaPor, actividad, observaciones, horaInicio, horaFinal });
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!entry) {
      setFecha(today());
    }
  }, [entry]);

  const isDirty = Boolean(entry) && Boolean(savedSnapshot) && (
    fecha !== savedSnapshot!.fecha ||
    solicitadaPor !== savedSnapshot!.solicitadaPor ||
    actividad !== savedSnapshot!.actividad ||
    observaciones !== savedSnapshot!.observaciones ||
    horaInicio !== savedSnapshot!.horaInicio ||
    horaFinal !== savedSnapshot!.horaFinal
  );

  function cancelChanges() {
    if (!savedSnapshot) return;
    setFecha(savedSnapshot.fecha);
    setSolicitadaPor(savedSnapshot.solicitadaPor);
    setActividad(savedSnapshot.actividad);
    setObservaciones(savedSnapshot.observaciones);
    setHoraInicio(savedSnapshot.horaInicio);
    setHoraFinal(savedSnapshot.horaFinal);
  }

  const inputCls = 'w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none';
  const labelCls = 'text-xs font-medium text-[var(--text-secondary)]';

  // Clave única: dispara animación al cambiar entre nuevo/edición o entre distintas entradas
  const animKey = entry ? `edit-${entry.id}` : 'new';

  return (
    <div key={animKey} className="flex h-full flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Modal de conflicto de horario */}
      {conflicts.length > 0 && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
          <div className="modal-spring-in w-96 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-400">
              <AlertTriangle size={15} />
              {t(language, 'overtime', 'conflictTitle')}
            </div>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              {t(language, 'overtime', 'conflictLineA')} <span className="font-medium text-[var(--text-primary)]">{horaInicio}–{horaFinal}</span>{' '}
              {conflicts.length === 1 ? t(language, 'overtime', 'conflictLineBOne') : t(language, 'overtime', 'conflictLineBMany')}
            </p>
            <ul className="mb-4 space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2.5">
              {conflicts.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[var(--text-primary)]">{c.horaInicio}–{c.horaFinal}</span>
                  <span className="text-[var(--text-secondary)] truncate ml-3">{c.actividad || c.solicitadaPor || t(language, 'overtime', 'dash')}</span>
                </li>
              ))}
            </ul>
            <p className="mb-4 text-xs text-[var(--text-hint)]">
              {t(language, 'overtime', 'conflictReview')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConflicts([])}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                {t(language, 'overtime', 'reviewHours')}
              </button>
              <button
                onClick={doSave}
                disabled={saving}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-400 disabled:opacity-50"
              >
                {saving ? t(language, 'overtime', 'saving') : t(language, 'overtime', 'saveAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Barra superior */}
      <div className={`flex items-center justify-between border-b px-4 py-2.5 ${
        entry
          ? 'border-[var(--border)] bg-[var(--bg-base)]'
          : 'border-indigo-500/20 bg-indigo-500/[0.06]'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          {entry
            ? <Pencil size={13} className="shrink-0 text-[var(--text-hint)]" />
            : <Plus size={13} className="shrink-0 text-indigo-400" />
          }
          <div className="min-w-0">
            <h2 className={`text-sm font-semibold ${
              entry ? 'text-[var(--text-primary)]' : 'text-indigo-300'
            }`}>
              {entry ? t(language, 'overtime', 'editEntry') : t(language, 'overtime', 'newOvertime')}
            </h2>
            <p className="text-[10px] text-[var(--text-hint)] truncate mt-0.5">
              {entry ? (
                <>
                  {entry.fecha} · {entry.horaInicio}–{entry.horaFinal}
                  {isDirty && <span className="ml-1.5 text-indigo-400">● {t(language, 'overtime', 'unsaved')}</span>}
                </>
              ) : t(language, 'overtime', 'newEntryHint')}
            </p>
            {fecha && fecha.slice(0, 7) !== overtimeMonth && (
              <p className="mt-0.5 text-[10px] text-amber-400/80">
                {t(language, 'overtime', 'filedUnder')} {MONTHS_TITLE[language][parseInt(fecha.slice(5, 7)) - 1]} {fecha.slice(0, 4)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {entry && isDirty && (
            <button
              onClick={cancelChanges}
              className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <RotateCcw size={12} />
              {t(language, 'overtime', 'cancelChanges')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !fecha || !horaInicio || !horaFinal || !actividad.trim()}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 transition ${
              entry
                ? 'bg-indigo-600 hover:bg-indigo-500'
                : 'bg-indigo-500 hover:bg-indigo-400'
            }`}
          >
            {entry ? <Save size={13} /> : <Plus size={13} />}
            {saving
              ? t(language, 'overtime', 'saving')
              : entry
                ? t(language, 'overtime', 'save')
                : t(language, 'overtime', 'create')
            }
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
        <section className={`space-y-3 ${!entry ? 'rounded-lg border border-[var(--border)] p-3' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-hint)]">{t(language, 'overtime', 'detailSection')}</p>

          {/* Fecha */}
          <div className="space-y-1">
            <label className={labelCls}>{t(language, 'overtime', 'date')}</label>
            <AppDatePicker value={fecha} onChange={setFecha} />
          </div>

          {/* Horas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>{t(language, 'overtime', 'startTime')}</label>
              <input type="time" className={inputCls} value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>{t(language, 'overtime', 'endTime')}</label>
              <input type="time" className={inputCls} value={horaFinal} onChange={(e) => setHoraFinal(e.target.value)} />
            </div>
          </div>

          {/* Solicitada por */}
          <div className="space-y-1">
            <label className={labelCls}>{t(language, 'overtime', 'requestedBy')}</label>
            <input
              className={inputCls}
              value={solicitadaPor}
              onChange={(e) => setSolicitadaPor(e.target.value)}
              placeholder={t(language, 'overtime', 'requesterPlaceholder')}
            />
          </div>

          {/* Actividad */}
          <div className="space-y-1">
            <label className={labelCls}>{t(language, 'overtime', 'activityDone')}</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              value={actividad}
              onChange={(e) => setActividad(e.target.value)}
              placeholder={t(language, 'overtime', 'activityPlaceholder')}
            />
          </div>

          {/* Compensatorio/Pago — botones */}
          <div className="space-y-1.5">
            <label className={labelCls}>{t(language, 'overtime', 'compPay')}</label>
            <div className="flex gap-2">
              {COMP_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setObservaciones(opt)}
                  className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                    observaciones === opt
                      ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400'
                      : 'border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-hint)] hover:border-[var(--text-hint)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {t(language, 'overtime', opt)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Preview del cálculo */}
        {preview && (
          <section className="animate-fade-in rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">{t(language, 'overtime', 'breakdown')}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-[var(--text-hint)]">{t(language, 'overtime', 'totalHours')}</span>
              <span className="font-semibold text-[var(--text-primary)]">{fmt(preview.totalHoras)}h</span>
              <span className="text-[var(--text-hint)]">{t(language, 'overtime', 'extraDay')}</span>
              <span className="text-[var(--text-primary)]">{fmt(preview.extrasDiurnas)}h</span>
              <span className="text-[var(--text-hint)]">{t(language, 'overtime', 'extraNight')}</span>
              <span className="text-[var(--text-primary)]">{fmt(preview.extrasNocturnas)}h</span>
              <span className="text-[var(--text-hint)]">{t(language, 'overtime', 'holidayDay')}</span>
              <span className="text-[var(--text-primary)]">{fmt(preview.extrasDiurnasFestivas)}h</span>
              <span className="text-[var(--text-hint)]">{t(language, 'overtime', 'holidayNight')}</span>
              <span className="text-[var(--text-primary)]">{fmt(preview.extrasNocturnasFestivas)}h</span>
            </div>
            <p className="text-xs text-[var(--text-hint)]">{t(language, 'overtime', 'rangesHint')}</p>
          </section>
        )}
      </div>
    </div>
  );
}
