// Eventos de solo lectura que una extensión pone en el Calendario de
// Logday (R22 de specs/extensiones; la primera es Google Calendar). Viven
// en memoria: no se guardan en disco ni se sincronizan.
import { create } from 'zustand';
import type { ExtensionId } from './types';

export interface ExternalEvent {
  id: string;
  source: ExtensionId;
  title: string;
  /** YYYY-MM-DD en hora local. */
  date: string;
  /** HH:MM en hora local; '' = todo el día. */
  time: string;
  /** Dónde abrirlo (en el navegador). */
  url?: string;
}

/** Días que muestra el Calendario: `from` incluido, `to` excluido. */
export interface DateRange {
  from: string;
  to: string;
}

interface ExternalEventsState {
  range: DateRange | null;
  bySource: Partial<Record<ExtensionId, ExternalEvent[]>>;
  setRange: (range: DateRange) => void;
  setSource: (source: ExtensionId, events: ExternalEvent[]) => void;
  clearSource: (source: ExtensionId) => void;
}

export const useExternalEvents = create<ExternalEventsState>((set) => ({
  range: null,
  bySource: {},
  setRange: (range) =>
    set((s) => (s.range?.from === range.from && s.range.to === range.to ? s : { range })),
  setSource: (source, events) => set((s) => ({ bySource: { ...s.bySource, [source]: events } })),
  clearSource: (source) =>
    set((s) => {
      const next = { ...s.bySource };
      delete next[source];
      return { bySource: next };
    }),
}));

/** Todos los eventos externos por fecha, ordenados por hora (los de todo
 *  el día primero). */
export function groupByDate(bySource: ExternalEventsState['bySource']): Record<string, ExternalEvent[]> {
  const out: Record<string, ExternalEvent[]> = {};
  for (const events of Object.values(bySource)) {
    for (const ev of events ?? []) (out[ev.date] ??= []).push(ev);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}
