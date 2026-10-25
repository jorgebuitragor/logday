import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { CalendarEvent, EventColor, EventRepeat } from '../../types/calendar';
import { useAppStore } from '../../store/appStore';
import { AppDatePicker } from '../shared/AppDatePicker';
import ToggleSwitch from '../shared/ToggleSwitch';
import { AppSelect, AppSelectOption } from './AppSelect';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../../lib/i18n';
import { EVENT_COLOR_DOT, EVENT_COLORS, REMINDER_OPTIONS, reminderLabel } from '../../lib/calendarEventPresentation';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';

export interface EventEditorProps {
  initial: Partial<CalendarEvent> & { date: string };
  language: 'es' | 'en';
  onSave: (ev: CalendarEvent) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function EventEditor({ initial, language, onSave, onDelete, onClose }: EventEditorProps) {
  const isNew = !initial.id;
  const [title, setTitle]   = useState(initial.title ?? '');
  const [date, setDate]     = useState(initial.date);
  const [allDay, setAllDay] = useState(!initial.time);
  const [time, setTime]     = useState(initial.time || '09:00');
  const [desc, setDesc]     = useState(initial.description ?? '');
  const [color, setColor]   = useState<EventColor>(initial.color ?? 'indigo');

  const [reminderEnabled, setReminderEnabled] = useState<boolean>(() => {
    if (isNew) return useAppStore.getState().notificationsEnabled;
    return (initial.reminderMinutes ?? 0) > 0;
  });
  const [reminder, setReminder] = useState<number>(() => {
    const m = initial.reminderMinutes ?? 0;
    return m > 0 ? m : useAppStore.getState().defaultReminderMinutes;
  });

  const initRepeat = (initial.repeat ?? 'none') as EventRepeat;
  const [repeatEnabled, setRepeatEnabled] = useState(initRepeat !== 'none');
  const [repeat, setRepeat] = useState<Exclude<EventRepeat, 'none'>>(
    initRepeat !== 'none' ? (initRepeat as Exclude<EventRepeat, 'none'>) : 'weekly'
  );

  const [confirmDel, setConfirmDel] = useState(false);

  const reminderOptions = REMINDER_OPTIONS.filter((m) => m > 0).map((m) => ({
    value: m as number,
    label: reminderLabel(language, m),
  }));

  const repeatOptions: AppSelectOption<Exclude<EventRepeat, 'none'>>[] = [
    { value: 'daily',     label: t(language, 'calendar', 'repeatDaily') },
    { value: 'weekly',    label: t(language, 'calendar', 'repeatWeekly') },
    { value: 'biweekly',  label: t(language, 'calendar', 'repeatBiweekly') },
    { value: 'monthly',   label: t(language, 'calendar', 'repeatMonthly') },
    { value: 'yearly',    label: t(language, 'calendar', 'repeatYearly') },
  ];

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: initial.id ?? uuidv4(),
      title: title.trim(),
      date,
      time: allDay ? '' : time,
      description: desc,
      color,
      reminderMinutes: (allDay || !reminderEnabled) ? 0 : reminder,
      repeat: repeatEnabled ? repeat : 'none',
    });
  };

  return (
    <ModalOverlay onClose={onClose}>
      <ModalPanel className="w-full max-w-md rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-5 py-4 shrink-0">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {initial.id ? t(language, 'calendar', 'editEvent') : t(language, 'calendar', 'addEvent')}
          </h2>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          {/* Título */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              {t(language, 'calendar', 'eventTitle')}
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t(language, 'calendar', 'eventTitlePlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-body)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Fecha */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              {t(language, 'calendar', 'eventDate')}
            </label>
            <AppDatePicker value={date} onChange={setDate} />
          </div>

          {/* Segmented: Todo el día / Hora específica */}
          <div className="flex rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-1 gap-1">
            <button
              type="button"
              onClick={() => { setAllDay(true); setReminderEnabled(false); }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                allDay
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t(language, 'calendar', 'eventAllDay')}
            </button>
            <button
              type="button"
              onClick={() => setAllDay(false)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                !allDay
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t(language, 'calendar', 'eventSpecificTime')}
            </button>
          </div>

          {/* Hora (solo si hora específica) */}
          {!allDay && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                {t(language, 'calendar', 'eventTime')}
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          )}

          {/* Recordatorio (solo si hora específica) */}
          {!allDay && (
            <div className="space-y-1.5">
              <div
                onClick={() => setReminderEnabled(!reminderEnabled)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'calendar', 'reminderLabel')}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'calendar', 'reminderToggleDesc')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${reminderEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'}`}>
                    {reminderEnabled ? t(language, 'calendar', 'reminderOn') : t(language, 'calendar', 'reminderOff')}
                  </span>
                  <ToggleSwitch checked={reminderEnabled} onChange={setReminderEnabled} size="lg" />
                </div>
              </div>
              {reminderEnabled && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
                  <p className="text-xs font-medium text-[var(--text-secondary)]">
                    {t(language, 'calendar', 'reminderWhen')}
                  </p>
                  <AppSelect
                    value={reminder}
                    options={reminderOptions}
                    onChange={(v) => setReminder(v as number)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Repetir */}
          <div className="space-y-1.5">
            <div
              onClick={() => setRepeatEnabled(!repeatEnabled)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)] cursor-pointer"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'calendar', 'repeatToggleLabel')}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'calendar', 'repeatToggleDesc')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${repeatEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'}`}>
                  {repeatEnabled ? t(language, 'calendar', 'reminderOn') : t(language, 'calendar', 'reminderOff')}
                </span>
                <ToggleSwitch checked={repeatEnabled} onChange={setRepeatEnabled} size="lg" />
              </div>
            </div>
            {repeatEnabled && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  {t(language, 'calendar', 'repeatFrequency')}
                </p>
                <AppSelect
                  value={repeat}
                  options={repeatOptions}
                  onChange={(v) => setRepeat(v as Exclude<EventRepeat, 'none'>)}
                />
              </div>
            )}
          </div>

          {/* Color */}
          <div>
            <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
              {t(language, 'calendar', 'eventColor')}
            </label>
            <div className="flex gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full transition ring-offset-2 ring-offset-[var(--bg-elevated)] ${EVENT_COLOR_DOT[c]} ${
                    color === c ? 'ring-2 ring-white/60' : 'opacity-60 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              {t(language, 'calendar', 'eventDesc')}
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t(language, 'calendar', 'eventDescPlaceholder')}
              rows={2}
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-body)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-5 py-3 flex items-center justify-between gap-2 shrink-0">
          {onDelete ? (
            confirmDel ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400">{t(language, 'calendar', 'deleteEventConfirm')}</span>
                <button onClick={onDelete} className="rounded-lg px-3 py-1.5 text-xs font-medium bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition">
                  {t(language, 'calendar', 'delete')}
                </button>
                <button onClick={() => setConfirmDel(false)} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-hint)] hover:text-[var(--text-body)] transition">
                  {t(language, 'calendar', 'cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDel(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 transition"
              >
                <Trash2 size={13} /> {t(language, 'calendar', 'deleteEvent')}
              </button>
            )
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-hint)] hover:text-[var(--text-body)] hover:bg-[var(--bg-hover)] transition">
              {t(language, 'calendar', 'cancel')}
            </button>
            <button
              disabled={!title.trim()}
              onClick={handleSave}
              className="rounded-lg px-4 py-1.5 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t(language, 'calendar', 'saveEvent')}
            </button>
          </div>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
