import { EventColor } from '../types/calendar';
import { t } from './i18n';

export const EVENT_COLOR_DOT: Record<EventColor, string> = {
  indigo:  'bg-[#818cf8]',
  amber:   'bg-amber-400',
  emerald: 'bg-emerald-400',
  rose:    'bg-rose-400',
  sky:     'bg-sky-400',
  violet:  'bg-violet-400',
};

export const EVENT_COLORS: EventColor[] = ['indigo', 'amber', 'emerald', 'rose', 'sky', 'violet'];
export const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

export function reminderLabel(lang: 'es' | 'en', mins: number): string {
  if (mins === 0)    return t(lang, 'calendar', 'reminderNone');
  if (mins === 5)    return t(lang, 'calendar', 'reminder5m');
  if (mins === 10)   return t(lang, 'calendar', 'reminder10m');
  if (mins === 15)   return t(lang, 'calendar', 'reminder15m');
  if (mins === 30)   return t(lang, 'calendar', 'reminder30m');
  if (mins === 60)   return t(lang, 'calendar', 'reminder1h');
  if (mins === 120)  return t(lang, 'calendar', 'reminder2h');
  if (mins === 1440) return t(lang, 'calendar', 'reminder1d');
  return `${mins}m`;
}
