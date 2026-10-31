// "Reuniones de hoy" en Inicio (G12, specs/extensiones R27). Si el
// Calendario ya tiene a la vista un rango con hoy, usa esos eventos; si no,
// pide solo los de hoy (`refreshToday`) al montarse y cada 10 minutos, sin
// cambiar el rango compartido. Con "Mostrar en Inicio" apagado no se dibuja.
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertCircle, CalendarDays, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t, type Language } from '../../lib/i18n';
import { interpolate } from '../../lib/interpolate';
import { fs } from '../../lib/invoke';
import { localISODate } from '../../lib/localDate';
import { CHIP, FOCUS_RING, SECONDARY_CLS, TEXT_LINK } from '../../components/shared/controlClasses';
import { HomeCardShell } from '../../components/dashboard/HomeCardShell';
import { useExternalEvents, type ExternalEvent } from '../externalEvents';
import type { CalendarCommandError } from './api';
import { GOOGLE_CALENDAR_ID, homeAgenda, rangeIncludes, readCalendarSettings, showsOnHome } from './model';
import { calendarErrorMessage } from './Settings';
import { REFRESH_MS, refreshGoogleCalendar, refreshToday, useCalendarSync, useHomeToday } from './sync';

type GcKey = Parameters<typeof t<'googleCalendar'>>[2];
const tr = (language: Language, key: GcKey, vars?: Record<string, string | number>) =>
  interpolate(t(language, 'googleCalendar', key), vars);

const pad = (n: number) => String(n).padStart(2, '0');

/** La hora, al minuto: para "Siguiente" y para cambiar de día. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const ROW_CLS = 'flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-left text-xs';

export default function GoogleCalendarHomeCard() {
  const { language, raw, openExtensionSettings, setSection, setView } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[GOOGLE_CALENDAR_ID]?.settings,
      openExtensionSettings: s.openExtensionSettings,
      setSection: s.setSection,
      setView: s.setView,
    })),
  );
  const range = useExternalEvents((s) => s.range);
  const shared = useExternalEvents((s) => s.bySource[GOOGLE_CALENDAR_ID]);
  const status = useCalendarSync((s) => s.status);
  const own = useHomeToday();
  const now = useMinuteClock();

  const settings = readCalendarSettings(raw);
  const show = showsOnHome(raw);
  const clientId = settings.clientId && settings.account ? settings.clientId : null;
  const date = new Date(now);
  const today = localISODate(date);
  const fromCalendar = rangeIncludes(range, today);
  // Sin el rango del Calendario, la consulta propia de hoy.
  const ownClientId = show && clientId && !fromCalendar ? clientId : null;

  useEffect(() => {
    if (!ownClientId) return;
    void refreshToday(ownClientId);
    const timer = window.setInterval(() => void refreshToday(ownClientId), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [ownClientId, today]);

  if (!show) return null;

  const openCalendar = () => {
    void setSection('tasks');
    setView('calendar');
  };

  let events: ExternalEvent[] | null;
  let error: CalendarCommandError | null;
  let retry: () => void;
  if (fromCalendar) {
    events = shared ?? null;
    error = status.state === 'error' ? status : null;
    retry = () => void refreshGoogleCalendar();
  } else {
    const sameDay = own.day === today;
    events = sameDay ? own.events : null;
    error = sameDay ? own.error : null;
    retry = () => { if (clientId) void refreshToday(clientId); };
  }
  const retrying = fromCalendar ? status.state === 'loading' : own.loading;

  let body;
  if (!clientId) {
    body = (
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-secondary)]">{tr(language, 'homeNotConnected')}</p>
        <button
          type="button"
          onClick={() => openExtensionSettings(GOOGLE_CALENDAR_ID)}
          aria-label={tr(language, 'homeConnectAria')}
          className={SECONDARY_CLS}
        >
          {tr(language, 'homeConnect')}
        </button>
      </div>
    );
  } else if (events === null && !error) {
    body = <p className="text-xs text-[var(--text-hint)]">{tr(language, 'homeLoading')}</p>;
  } else {
    const agenda = homeAgenda(events ?? [], today, `${pad(date.getHours())}:${pad(date.getMinutes())}`);
    body = (
      <div className="space-y-2">
        {error && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">
            <span className="flex min-w-0 items-start gap-1.5">
              <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden />
              <span>{tr(language, 'homeError')} {calendarErrorMessage(language, error)}</span>
            </span>
            <button type="button" onClick={retry} disabled={retrying} className={SECONDARY_CLS}>
              <RefreshCw size={12} className={retrying ? 'animate-spin' : ''} aria-hidden />
              {tr(language, 'homeRetry')}
            </button>
          </div>
        )}
        {events && agenda.rows.length === 0 && (
          <p className="text-xs text-[var(--text-hint)]">{tr(language, 'homeEmpty')}</p>
        )}
        {agenda.rows.length > 0 && (
          <ul className="space-y-1.5">
            {agenda.rows.map((ev, i) => {
              const content = (
                <>
                  <span className="w-16 shrink-0 tabular-nums text-[var(--text-hint)]">{ev.time || tr(language, 'homeAllDay')}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">{ev.title}</span>
                  {i === agenda.next && <span className={`${CHIP} shrink-0`}>{tr(language, 'homeNext')}</span>}
                </>
              );
              const url = ev.url;
              return (
                <li key={`${ev.id}:${i}`}>
                  {url ? (
                    <button
                      type="button"
                      onClick={() => void fs.openUrl(url)}
                      title={tr(language, 'homeOpenEvent', { title: ev.title })}
                      className={`${ROW_CLS} transition-colors hover:bg-[var(--bg-hover)] ${FOCUS_RING}`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={ROW_CLS}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {agenda.more > 0 && (
          <button
            type="button"
            onClick={openCalendar}
            aria-label={tr(language, 'homeMoreAria', { n: agenda.more })}
            className={`text-xs ${TEXT_LINK}`}
          >
            {tr(language, 'homeMore', { n: agenda.more })}
          </button>
        )}
      </div>
    );
  }

  return (
    <HomeCardShell
      icon={CalendarDays}
      title={tr(language, 'homeTitle')}
      aside={tr(language, 'homeSource')}
      titleId="home-google-calendar-title"
      link={{
        label: t(language, 'dashboard', 'calendarLabel'),
        ariaLabel: tr(language, 'homeCalendarAria'),
        onClick: openCalendar,
      }}
    >
      {body}
    </HomeCardShell>
  );
}
