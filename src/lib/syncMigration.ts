import * as Y from 'yjs';
import { fs } from './invoke';
import {
  listTasksRemote, createTaskRemote,
  listNotesRemote, createNoteRemote, pushNoteContentRemote,
  listOvertimeEntriesRemote, createOvertimeEntryRemote,
  listOvertimeMonthMetaRemote, patchOvertimeMonthMetaRemote,
  listCalendarEventsRemote, createCalendarEventRemote,
  listAbsenceDaysRemote, createAbsenceDayRemote,
  listDailyEntriesRemote, putDailyEntryContentRemote,
} from './sync';
import {
  taskToCreatePayload,
  noteToCreatePayload,
  overtimeEntryToCreatePayload,
  overtimeMonthMetaFieldsToPatchPayload,
  calendarEventToCreatePayload,
  absenceDayToCreatePayload,
} from './syncMapping';
import { applyTextEdit, bytesToBase64, persistYDoc } from './noteContentSync';
import { persistDailyYDoc } from './dailyContentSync';
import {
  projectDir, readTaskFromPath,
  notesDir, noteFolderDir, readNoteFromPath, scanNoteFolders,
  overtimeBaseDir, overtimeMonthFilePath,
  withSyncAuth,
} from '../store/appStore';
import type { SyncGet, SyncSet } from '../store/appStore';
import { Task } from '../types/task';
import { Note } from '../types/note';
import { OvertimeEntry } from '../types/overtime';

// ── Migración de datos existentes a logday-server ──────────────────
// Ver specs/sync-primer-sincronizacion. Regla central, no negociable:
// por cada entidad, traer la lista completa remota primero y migrar
// ÚNICAMENTE lo que el id (o year_month/date, según la key natural)
// no tenga ya del lado servidor — nunca se genera un updated_at
// inventado para decidir un conflicto, nunca se pisa nada que ya
// exista. Correr esto dos veces es seguro: la segunda vez todo
// aparece como "ya existía".
//
// Todas las llamadas al servidor pasan por withSyncAuth (appStore.ts)
// — mismo access token de siempre, pero si vino vencido, renueva con
// el refresh token y reintenta una sola vez en vez de fallar directo
// (ver comentario de esa función: comparte el mismo refresh en vuelo
// que el resto de la app, no hay dos guardas de single-flight
// independientes que puedan pisarse).
//
// Enumeración de lo local: Task/Note/OvertimeEntry usan lectura
// directa de disco (funciones puras exportadas de appStore.ts), NO
// las acciones loadTasks/loadNotes/loadOvertimeMonth del store — esas
// reemplazan el estado visible (tasks/notes quedan scopeados a
// activeProject/activeNoteFolder, overtimeEntries+overtimeMonth
// cambian con cada mes recorrido), así que llamarlas en loop durante
// una migración de fondo le cambiaría al usuario lo que está viendo
// ahora mismo en Kanban/Notes/Overtime. CalendarEvent/AbsenceDay/
// DailyEntry sí reusan las acciones del store (loadCalendarEvents/
// loadAbsenceDays/loadDailyMonths+loadDailyMonth) porque esas no
// reemplazan ningún recorte visible — calendarEvents/absenceDays ya
// son siempre-completos, y dailyEntries se mergea (no reemplaza) sin
// tocar qué mes está activo.

export interface MigrationProgress {
  done: number;
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
}

export function emptyMigrationProgress(): MigrationProgress {
  return { done: 0, total: 0, migrated: 0, skipped: 0, failed: 0 };
}

type Bump = (outcome: 'migrated' | 'skipped' | 'failed') => void;

function bootstrapContentDoc(text: string): Y.Doc {
  const doc = new Y.Doc();
  applyTextEdit(doc, '', text);
  return doc;
}

// ─── Task ───

async function readAllLocalTasks(basePath: string, projects: string[]): Promise<Task[]> {
  const byProject = await Promise.all(
    projects.map(async (p) => {
      const dir = projectDir(basePath, p);
      const entries = await fs.listDir(dir).catch(() => []);
      const mdFiles = (entries as { name: string; path: string; is_dir: boolean }[]).filter(
        (e) => !e.is_dir && e.name.endsWith('.md'),
      );
      const tasks = await Promise.all(mdFiles.map((f) => readTaskFromPath(f.path)));
      return tasks.filter((t): t is Task => t !== null);
    }),
  );
  return byProject.flat();
}

async function migrateTasks(get: SyncGet, set: SyncSet, localTasks: Task[], bump: Bump): Promise<void> {
  const { syncConfig } = get();
  const remoteRows = await withSyncAuth(get, set, (token) => listTasksRemote(syncConfig.serverUrl, token));
  const remoteIds = new Set(remoteRows.map((r) => r.id));
  for (const task of localTasks) {
    if (remoteIds.has(task.id)) { bump('skipped'); continue; }
    try {
      await withSyncAuth(get, set, (token) => createTaskRemote(syncConfig.serverUrl, token, taskToCreatePayload(task)));
      bump('migrated');
    } catch { bump('failed'); }
  }
}

// ─── Note (metadata + contenido CRDT) ───

async function readAllLocalNotes(basePath: string): Promise<Note[]> {
  const nDir = notesDir(basePath);
  const folders = await scanNoteFolders(nDir, '');
  const rootEntries = await fs.listDir(nDir).catch(() => []);
  const rootFiles = (rootEntries as { name: string; path: string; is_dir: boolean }[]).filter(
    (e) => !e.is_dir && e.name.endsWith('.md'),
  );
  const rootNotes = await Promise.all(rootFiles.map((f) => readNoteFromPath(f.path)));
  const folderNotes = await Promise.all(
    folders.map(async (folder) => {
      const entries = await fs.listDir(noteFolderDir(basePath, folder)).catch(() => []);
      const mdFiles = (entries as { name: string; path: string; is_dir: boolean }[]).filter(
        (e) => !e.is_dir && e.name.endsWith('.md'),
      );
      const notes = await Promise.all(mdFiles.map((f) => readNoteFromPath(f.path)));
      return notes.filter((n): n is Note => n !== null);
    }),
  );
  return [...rootNotes.filter((n): n is Note => n !== null), ...folderNotes.flat()];
}

async function migrateNotes(get: SyncGet, set: SyncSet, localNotes: Note[], bump: Bump): Promise<void> {
  const { syncConfig } = get();
  const remoteRows = await withSyncAuth(get, set, (token) => listNotesRemote(syncConfig.serverUrl, token));
  const remoteById = new Map(remoteRows.map((r) => [r.id, r]));
  for (const note of localNotes) {
    const remote = remoteById.get(note.id);
    // Ya existe con contenido real — no se toca nada, ni metadata ni
    // contenido (regla central: nunca pisar lo que ya está).
    if (remote && remote.content.trim()) { bump('skipped'); continue; }
    try {
      if (!remote) {
        await withSyncAuth(get, set, (token) => createNoteRemote(syncConfig.serverUrl, token, noteToCreatePayload(note)));
      }
      // Completa el contenido si falta — tanto para una nota recién
      // creada acá arriba como para una cuya metadata ya había
      // migrado en una corrida anterior interrumpida antes de llegar
      // al contenido (nunca se re-crea la metadata en ese caso, solo
      // se rellena lo que falta).
      if (note.content.trim()) {
        const doc = bootstrapContentDoc(note.content);
        const updateB64 = bytesToBase64(Y.encodeStateAsUpdate(doc));
        await withSyncAuth(get, set, (token) => pushNoteContentRemote(syncConfig.serverUrl, token, note.id, updateB64));
        await persistYDoc(note.filePath, doc);
        doc.destroy();
      }
      bump('migrated');
    } catch { bump('failed'); }
  }
}

// ─── OvertimeEntry ───

async function readAllLocalOvertimeEntries(basePath: string): Promise<{ months: string[]; entries: OvertimeEntry[] }> {
  const base = overtimeBaseDir(basePath);
  const yearDirs = await fs.listDir(base).catch(() => []);
  const months: string[] = [];
  for (const y of (yearDirs as { name: string; is_dir: boolean }[]).filter((e) => e.is_dir)) {
    const monthDirs = await fs.listDir(`${base}/${y.name}`).catch(() => []);
    for (const mo of (monthDirs as { name: string; is_dir: boolean }[]).filter((e) => e.is_dir)) {
      months.push(`${y.name}-${mo.name}`);
    }
  }
  const entriesByMonth = await Promise.all(
    months.map(async (ym) => {
      const [year, month] = ym.split('-');
      const path = overtimeMonthFilePath(basePath, year, month);
      try {
        const raw = await fs.readFile(path);
        const match = raw.match(/^---\n([\s\S]*?)\n---/);
        return match ? ((JSON.parse(match[1]).entries ?? []) as OvertimeEntry[]) : [];
      } catch { return []; }
    }),
  );
  return { months, entries: entriesByMonth.flat() };
}

async function migrateOvertimeEntries(get: SyncGet, set: SyncSet, localEntries: OvertimeEntry[], bump: Bump): Promise<void> {
  const { syncConfig } = get();
  const remoteRows = await withSyncAuth(get, set, (token) => listOvertimeEntriesRemote(syncConfig.serverUrl, token));
  const remoteIds = new Set(remoteRows.map((r) => r.id));
  for (const entry of localEntries) {
    if (remoteIds.has(entry.id)) { bump('skipped'); continue; }
    try {
      await withSyncAuth(get, set, (token) => createOvertimeEntryRemote(syncConfig.serverUrl, token, overtimeEntryToCreatePayload(entry)));
      bump('migrated');
    } catch { bump('failed'); }
  }
}

// ─── OvertimeMonthMeta ───
// Caso especial: local es un único valor global (overtimeMeta), no
// uno por mes. Se aplica ese mismo valor a todo year_month con datos
// de horas extra que el servidor todavía no tenga — ver design.md.

async function migrateOvertimeMonthMeta(get: SyncGet, set: SyncSet, months: string[], bump: Bump): Promise<void> {
  const { syncConfig, overtimeMeta } = get();
  if (!overtimeMeta.colaborador.trim() && !overtimeMeta.cedula.trim()) return; // nada que migrar
  const remoteRows = await withSyncAuth(get, set, (token) => listOvertimeMonthMetaRemote(syncConfig.serverUrl, token));
  const remoteMonths = new Set(remoteRows.map((r) => r.year_month));
  for (const ym of months) {
    if (remoteMonths.has(ym)) { bump('skipped'); continue; }
    try {
      await withSyncAuth(get, set, (token) => patchOvertimeMonthMetaRemote(syncConfig.serverUrl, token, ym, overtimeMonthMetaFieldsToPatchPayload(overtimeMeta)));
      bump('migrated');
    } catch { bump('failed'); }
  }
}

// ─── CalendarEvent / AbsenceDay ───
// Siempre-completos localmente (un solo archivo plano) — reusar las
// acciones del store es seguro, no reemplazan ningún recorte visible.

async function migrateCalendarEvents(get: SyncGet, set: SyncSet, bump: Bump): Promise<void> {
  const { syncConfig } = get();
  const remoteRows = await withSyncAuth(get, set, (token) => listCalendarEventsRemote(syncConfig.serverUrl, token));
  const remoteIds = new Set(remoteRows.map((r) => r.id));
  for (const event of get().calendarEvents) {
    if (remoteIds.has(event.id)) { bump('skipped'); continue; }
    try {
      await withSyncAuth(get, set, (token) => createCalendarEventRemote(syncConfig.serverUrl, token, calendarEventToCreatePayload(event)));
      bump('migrated');
    } catch { bump('failed'); }
  }
}

async function migrateAbsenceDays(get: SyncGet, set: SyncSet, bump: Bump): Promise<void> {
  const { syncConfig } = get();
  const remoteRows = await withSyncAuth(get, set, (token) => listAbsenceDaysRemote(syncConfig.serverUrl, token));
  const remoteIds = new Set(remoteRows.map((r) => r.id));
  for (const absence of get().absenceDays) {
    if (remoteIds.has(absence.id)) { bump('skipped'); continue; }
    try {
      await withSyncAuth(get, set, (token) => createAbsenceDayRemote(syncConfig.serverUrl, token, absenceDayToCreatePayload(absence)));
      bump('migrated');
    } catch { bump('failed'); }
  }
}

// ─── DailyEntry (contenido CRDT, sin metadata separada) ───
// dailyEntries se mergea (no reemplaza) al cargar meses — a
// diferencia de Task/Note/Overtime, reusar loadDailyMonths/
// loadDailyMonth no le cambia nada al usuario que esté viendo ahora
// mismo (no toca activeDailyDate).

async function migrateDailyEntries(get: SyncGet, set: SyncSet, basePath: string, bump: Bump): Promise<void> {
  const { syncConfig } = get();
  const remoteRows = await withSyncAuth(get, set, (token) => listDailyEntriesRemote(syncConfig.serverUrl, token));
  const remoteByDate = new Map(remoteRows.map((r) => [r.date, r]));

  for (const [date, text] of Object.entries(get().dailyEntries)) {
    const remote = remoteByDate.get(date);
    if (remote && remote.content.trim()) { bump('skipped'); continue; }
    if (!text.trim()) { bump('skipped'); continue; }
    try {
      const doc = bootstrapContentDoc(text);
      const updateB64 = bytesToBase64(Y.encodeStateAsUpdate(doc));
      await withSyncAuth(get, set, (token) => putDailyEntryContentRemote(syncConfig.serverUrl, token, date, updateB64));
      await persistDailyYDoc(basePath, date, doc);
      doc.destroy();
      bump('migrated');
    } catch { bump('failed'); }
  }
}

// ─── Orquestador ───

export async function migrateExistingData(get: SyncGet, set: SyncSet): Promise<MigrationProgress> {
  const progress = emptyMigrationProgress();
  const basePath = get().basePath;
  if (!basePath) return progress; // sin carpeta local abierta no hay nada que migrar
  const publish = () => set({ syncMigrationProgress: { ...progress } });

  // Enumera TODO lo local primero (una sola vez — los migradores de
  // abajo reciben la lista ya leída, no vuelven a golpear el disco)
  // para poder mostrar un total real desde el arranque en vez de
  // 0/0 hasta que termine.
  const { projects } = get();
  const [localTasks, localNotes, localOvertime] = await Promise.all([
    readAllLocalTasks(basePath, projects),
    readAllLocalNotes(basePath),
    readAllLocalOvertimeEntries(basePath),
  ]);
  await Promise.all([get().loadCalendarEvents(), get().loadAbsenceDays(), get().loadDailyMonths()]);
  for (const ym of get().dailyMonths) await get().loadDailyMonth(ym);

  progress.total =
    localTasks.length + localNotes.length + localOvertime.entries.length +
    localOvertime.months.length + // OvertimeMonthMeta, un intento por mes
    get().calendarEvents.length + get().absenceDays.length +
    Object.keys(get().dailyEntries).length;
  publish();

  const bump: Bump = (outcome) => {
    progress.done += 1;
    progress[outcome] += 1;
    publish();
  };

  set({ syncMigrationStatus: 'running' });
  try {
    await migrateTasks(get, set, localTasks, bump);
    await migrateNotes(get, set, localNotes, bump);
    await migrateOvertimeEntries(get, set, localOvertime.entries, bump);
    await migrateOvertimeMonthMeta(get, set, localOvertime.months, bump);
    await migrateCalendarEvents(get, set, bump);
    await migrateAbsenceDays(get, set, bump);
    await migrateDailyEntries(get, set, basePath, bump);
    set({ syncMigrationStatus: 'done' });
  } catch {
    set({ syncMigrationStatus: 'error' });
  }
  return progress;
}
