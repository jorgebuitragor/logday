import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';
import ToggleSwitch from './ToggleSwitch';

export function WorkSettingsTab() {
  const {
    language,
    confirmDestructiveActions, setConfirmDestructiveActions,
    notificationsEnabled, setNotificationsEnabled,
    defaultReminderMinutes, setDefaultReminderMinutes,
    workWeekDays, setWorkWeekDays,
    holidaysAsNonWork, setHolidaysAsNonWork,
    animationsEnabled, setAnimationsEnabled,
  } = useAppStore();

  const [isReminderMenuOpen, setIsReminderMenuOpen] = useState(false);
  const reminderMenuRef = useRef<HTMLDivElement | null>(null);

  // Cerrar dropdown de anticipación al hacer clic fuera
  useEffect(() => {
    if (!isReminderMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!reminderMenuRef.current?.contains(e.target as Node)) setIsReminderMenuOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [isReminderMenuOpen]);

  return <>

  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'behavior')}
    </p>
    <div
      onClick={() => void setConfirmDestructiveActions(!confirmDestructiveActions)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)] cursor-pointer"
    >
      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'confirmDeleteTitle')}</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'confirmDeleteDesc')}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${confirmDestructiveActions ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'}`}>
          {confirmDestructiveActions ? t(language, 'settings', 'confirmDeleteEnabled') : t(language, 'settings', 'confirmDeleteDisabled')}
        </span>
        <ToggleSwitch checked={confirmDestructiveActions} onChange={setConfirmDestructiveActions} size="lg" />
      </div>
    </div>
  </div>

  {/* Notificaciones */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'notificationsSection')}
    </p>
    <div className="space-y-2">
      <div
        onClick={() => void setNotificationsEnabled(!notificationsEnabled)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)] cursor-pointer"
      >
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'notificationsEnabledTitle')}</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'notificationsEnabledDesc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${notificationsEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'}`}>
            {notificationsEnabled ? t(language, 'settings', 'notificationsOn') : t(language, 'settings', 'notificationsOff')}
          </span>
          <ToggleSwitch checked={notificationsEnabled} onChange={setNotificationsEnabled} size="lg" />
        </div>
      </div>
      {notificationsEnabled && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
          <div>
            <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'notificationsDefaultMinutes')}</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'notificationsDefaultMinutesDesc')}</p>
          </div>
          <div ref={reminderMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsReminderMenuOpen((s) => !s)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                isReminderMenuOpen
                  ? 'border-indigo-500/60 bg-indigo-500/10 text-[var(--text-secondary)]'
                  : 'border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-body)] hover:border-[var(--border-high)]'
              }`}
            >
              <span>{defaultReminderMinutes} min</span>
              <ChevronDown size={11} className={`text-[var(--text-hint)] transition-transform ${isReminderMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {isReminderMenuOpen && (
              <div className="absolute right-0 z-50 mt-1 min-w-[7rem] overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-panel)] py-1 shadow-xl">
                {[5, 10, 15, 30, 60, 120].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { void setDefaultReminderMinutes(m); setIsReminderMenuOpen(false); }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition ${
                      defaultReminderMinutes === m
                        ? 'bg-indigo-500/10 text-indigo-400'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </div>

  {/* Semana laboral */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'workWeekSection')}
    </p>
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'workWeekTitle')}</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'workWeekDesc')}</p>
      </div>
      <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
        {([5, 6] as (5 | 6)[]).map((d) => (
          <button
            key={d}
            onClick={() => void setWorkWeekDays(d)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              workWeekDays === d
                ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/40'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {t(language, 'settings', d === 5 ? 'workWeek5' : 'workWeek6')}
          </button>
        ))}
      </div>
    </div>
    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'holidaysTitle')}</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'holidaysDesc')}</p>
      </div>
      <div
        onClick={() => void setHolidaysAsNonWork(!holidaysAsNonWork)}
        className="flex shrink-0 cursor-pointer items-center gap-2"
      >
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${
          holidaysAsNonWork ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'
        }`}>
          {holidaysAsNonWork
            ? t(language, 'settings', 'holidaysEnabled')
            : t(language, 'settings', 'holidaysDisabled')}
        </span>
        <ToggleSwitch checked={holidaysAsNonWork} onChange={setHolidaysAsNonWork} size="lg" />
      </div>
    </div>
  </div>

  {/* Accesibilidad */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'accessibility')}
    </p>
    <div
      onClick={() => void setAnimationsEnabled(!animationsEnabled)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)] cursor-pointer"
    >
      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'animationsTitle')}</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'animationsDesc')}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${
          animationsEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'
        }`}>
          {animationsEnabled
            ? t(language, 'settings', 'animationsEnabled')
            : t(language, 'settings', 'animationsDisabled')}
        </span>
        <ToggleSwitch checked={animationsEnabled} onChange={setAnimationsEnabled} size="lg" />
      </div>
    </div>
  </div>

  </>;
}
