// Importar reuniones de Granola como notas de Logday (specs/granola N4–N8).
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { nowInstant } from '../../lib/localDate';
import {
  GRANOLA_ID, UnexpectedFormatError, meetingToNote, parseMeetingDetails, parseMeetingList, readGranolaSettings,
  type MeetingRef,
} from './model';

const MAX_PAGES = 5;
const DETAILS_BATCH = 10;

const granolaCall = (tool: 'list_meetings' | 'get_meetings', args: Record<string, unknown>) =>
  invoke<string>('granola_call', { tool, args });

function errorCode(err: unknown): string {
  if (err instanceof UnexpectedFormatError) return 'unexpected_format';
  return typeof err === 'string' ? err : 'unknown';
}

let importing: Promise<number> | null = null;

/** Importa lo nuevo y devuelve cuántas notas creó. Si ya hay una
 *  importación en curso, espera esa en vez de empezar otra. */
export function importFromGranola(): Promise<number> {
  importing ??= run().finally(() => { importing = null; });
  return importing;
}

async function run(): Promise<number> {
  const store = useAppStore.getState;
  const settings = readGranolaSettings(store().extensions[GRANOLA_ID]?.settings);
  const startedAt = nowInstant();
  try {
    // 1. Lo nuevo o cambiado desde la última vez (la primera, todo lo que
    //    da el plan: 30 días en el gratuito).
    const refs: MeetingRef[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const args: Record<string, unknown> = { limit: 100, max_participants: 0 };
      if (settings.lastImportAt) args.updated_after = settings.lastImportAt;
      else args.time_range = 'last_30_days';
      if (cursor) args.cursor = cursor;
      const list = parseMeetingList(await granolaCall('list_meetings', args));
      refs.push(...list.meetings);
      if (!list.hasMore || !list.nextCursor) break;
      cursor = list.nextCursor;
    }
    // 2. N6: nunca dos veces la misma reunión.
    const pending = [...new Map(refs.filter((r) => !settings.imported[r.id]).map((r) => [r.id, r])).values()];

    // 3. La carpeta, si no existe.
    if (pending.length && !store().noteFolders.includes(settings.folder)) {
      await store().createNoteFolder(settings.folder);
    }

    // 4. El detalle de a 10 y una nota por reunión, de la más vieja a la
    //    más nueva para que la lista quede en orden.
    const language = store().language;
    const locale = language === 'en' ? 'en-US' : 'es-CO';
    const texts = {
      date: t(language, 'granola', 'noteDate'),
      participants: t(language, 'granola', 'noteParticipants'),
      open: t(language, 'granola', 'noteOpen'),
      summary: t(language, 'granola', 'noteSummary'),
      privateNotes: t(language, 'granola', 'notePrivate'),
      untitled: t(language, 'granola', 'noteUntitled'),
    };
    const imported = { ...settings.imported };
    let created = 0;
    for (let i = 0; i < pending.length; i += DETAILS_BATCH) {
      const ids = pending.slice(i, i + DETAILS_BATCH).map((r) => r.id);
      const details = parseMeetingDetails(await granolaCall('get_meetings', { meeting_ids: ids, attachments: 'none' }));
      details.sort((a, b) => (a.meetingAt ?? '').localeCompare(b.meetingAt ?? ''));
      for (const d of details) {
        if (imported[d.id]) continue;
        // Sin resumen ni notas todavía (Granola lo está armando): se deja
        // para la próxima. Al terminar cambia su `updated_at` y vuelve a
        // salir en `updated_after`.
        if (!d.summary && !d.privateNotes) continue;
        const { title, content } = meetingToNote(d, texts, locale);
        const note = await store().createNoteWith({ title, content, folder: settings.folder, tags: ['granola'] });
        imported[d.id] = note.id;
        created++;
        // Se guarda tras cada nota: si algo falla a mitad, lo creado ya no
        // se repite en la próxima importación.
        await store().updateExtensionSettings(GRANOLA_ID, { imported });
      }
    }
    await store().updateExtensionSettings(GRANOLA_ID, {
      imported,
      lastImportAt: startedAt,
      last: { at: nowInstant(), status: 'ok', created },
    });
    return created;
  } catch (err) {
    await store().updateExtensionSettings(GRANOLA_ID, { last: { at: nowInstant(), status: 'error', error: errorCode(err) } }).catch(() => {});
    throw err;
  }
}
