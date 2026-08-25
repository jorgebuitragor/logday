import { fs } from './invoke';

// ── Papelera de reciclaje — local, por instalación ───────────────────────
// Cada entidad borrada (Task, Note, OvertimeEntry, entrada de Daily) se
// guarda como un snapshot JSON en <basePath>/.trash/<entidad>/<key>.json
// en vez de mezclar "mover el archivo" (Task/Note, un archivo por entidad)
// con "sintetizar un registro" (OvertimeEntry/Daily, que viven dentro de un
// archivo compartido por mes) — un solo mecanismo uniforme para las 4.
// No es un reemplazo del DELETE al servidor (que se sigue mandando igual
// que siempre desde appStore.ts) — solo retrasa la purga del archivo local.

export type TrashEntity = 'task' | 'note' | 'overtime_entry' | 'daily_entry';

const TRASH_ENTITIES: TrashEntity[] = ['task', 'note', 'overtime_entry', 'daily_entry'];

/** Ventana de retención para la purga automática — fija, no configurable
 *  (solo el on/off del job lo es, ver trashAutoPurgeEnabled en appStore.ts). */
export const TRASH_RETENTION_DAYS = 60;

export interface TrashRecord {
  trashedAt: string; // ISO
  label: string;     // para mostrar en la lista, sin tener que reconstruir la entidad
  data: unknown;      // shape completo de la entidad, distinto por tipo — quien restaura sabe castearlo
}

export interface TrashListItem {
  entity: TrashEntity;
  key: string;
  trashedAt: string;
  label: string;
}

function trashDir(basePath: string, entity: TrashEntity): string {
  return `${basePath}/.trash/${entity}`;
}

function trashFilePath(basePath: string, entity: TrashEntity, key: string): string {
  return `${trashDir(basePath, entity)}/${key}.json`;
}

export async function writeTrashRecord(
  basePath: string,
  entity: TrashEntity,
  key: string,
  label: string,
  data: unknown,
): Promise<void> {
  await fs.createDir(trashDir(basePath, entity));
  const record: TrashRecord = { trashedAt: new Date().toISOString(), label, data };
  await fs.writeFile(trashFilePath(basePath, entity, key), JSON.stringify(record, null, 2));
}

export async function readTrashRecord(basePath: string, entity: TrashEntity, key: string): Promise<TrashRecord | null> {
  try {
    const raw = await fs.readFile(trashFilePath(basePath, entity, key));
    return JSON.parse(raw) as TrashRecord;
  } catch {
    return null;
  }
}

export async function deleteTrashRecord(basePath: string, entity: TrashEntity, key: string): Promise<void> {
  await fs.deleteFile(trashFilePath(basePath, entity, key)).catch(() => {});
}

export async function listTrashRecords(basePath: string): Promise<TrashListItem[]> {
  const items: TrashListItem[] = [];
  for (const entity of TRASH_ENTITIES) {
    let entries: Awaited<ReturnType<typeof fs.listDir>>;
    try {
      entries = await fs.listDir(trashDir(basePath, entity));
    } catch {
      continue; // sin carpeta todavía = sin nada en la papelera de esta entidad
    }
    for (const entry of entries) {
      if (entry.is_dir || !entry.name.endsWith('.json')) continue;
      const key = entry.name.replace(/\.json$/, '');
      const record = await readTrashRecord(basePath, entity, key);
      if (!record) continue;
      items.push({ entity, key, trashedAt: record.trashedAt, label: record.label });
    }
  }
  return items.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

/** Borra para siempre lo que supere TRASH_RETENTION_DAYS — llamado por el
 *  job periódico (ver startTrashPurgeInterval en appStore.ts), solo si
 *  trashAutoPurgeEnabled está prendido. */
export async function purgeExpiredTrash(basePath: string): Promise<void> {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const items = await listTrashRecords(basePath);
  for (const item of items) {
    if (new Date(item.trashedAt).getTime() < cutoff) {
      await deleteTrashRecord(basePath, item.entity, item.key);
    }
  }
}
