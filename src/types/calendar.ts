export type EventColor = 'indigo' | 'amber' | 'emerald' | 'rose' | 'sky' | 'violet';
export type EventRepeat = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;              // YYYY-MM-DD
  time: string;              // HH:MM   ('' = todo el día)
  description: string;
  color: EventColor;
  reminderMinutes: number;   // 0 = sin recordatorio
  repeat: EventRepeat;       // 'none' = sin repetición
}
