// P12: enviar a OpenProject el avance y el estado que el usuario cambia en
// Logday, si lo activó en el panel (apagado por defecto). Solo esos dos
// campos, solo de tareas importadas, y con la versión del work package de
// la última importación: si alguien lo cambió en OpenProject entretanto,
// OpenProject rechaza el envío y se avisa, en vez de pisarlo.
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { nowInstant } from '../../lib/localDate';
import type { Task } from '../../types/task';
import { isImporting, onImportDone } from './importer';
import { OPENPROJECT_ID, changesToPush, lockVersionOf, readOpenProjectSettings, type Managed, type PendingPush } from './model';

/** Sin red o sin VPN: queda pendiente y se reintenta. */
const RETRY = new Set(['network', 'timeout']);

// Los cambios de la configuración van en fila: dos ediciones seguidas (o una
// edición mientras se envía otra) no se pisan entre sí.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const settingsNow = () => readOpenProjectSettings(useAppStore.getState().extensions[OPENPROJECT_ID]?.settings);

/** El oyente de `task.updated`. */
export async function onTaskUpdated(prev: Task | undefined, next: Task): Promise<void> {
  if (isImporting()) return;
  const queued = await serial(async () => {
    const settings = settingsNow();
    if (!settings.writeBack || !settings.account) return false;
    const wpId = Object.keys(settings.imported).find((k) => settings.imported[k] === next.id);
    if (!wpId) return false;
    const change = changesToPush(prev, next, (s) => !!settings.statusMap[s]);
    if (!change) return false;
    const pending = { ...settings.pending, [wpId]: { ...settings.pending[wpId], ...change } };
    await useAppStore.getState().updateExtensionSettings(OPENPROJECT_ID, { pending });
    return true;
  });
  if (queued) await flushPending();
}

let flushing: Promise<void> | null = null;
let again = false;

/** Envía lo pendiente; si ya está enviando, vuelve a mirar al terminar. */
export function flushPending(): Promise<void> {
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = (async () => {
    do {
      again = false;
      await flush();
    } while (again);
  })().finally(() => { flushing = null; });
  return flushing;
}

const same = (a: PendingPush | undefined, b: PendingPush) => !!a && a.progress === b.progress && a.status === b.status;

async function flush(): Promise<void> {
  const store = useAppStore.getState;
  const settings = settingsNow();
  if (!settings.writeBack || !settings.account) return;
  const language = store().language;
  // Lo que se resolvió (enviado o rechazado), para quitarlo de la fila al
  // final sin pisar lo que llegó mientras tanto.
  const done: { wpId: string; sent: PendingPush; managed?: Managed }[] = [];
  let lastPush = settings.lastPush;
  for (const [wpId, change] of Object.entries(settings.pending)) {
    const title = taskTitle(settings.imported[wpId]);
    const status = change.status ? settings.statusMap[change.status]?.id : undefined;
    try {
      let prev = settings.managed[wpId];
      if (prev?.lockVersion === undefined) {
        // Importada antes de P12: no hay versión de referencia. Se toma la
        // de ahora (una sola vez); desde aquí, la de cada envío.
        const current = lockVersionOf(await invoke<string>('openproject_work_package', { id: Number(wpId) }));
        if (current === undefined) throw 'needs_import';
        prev = { ...(prev ?? { code: '', project: '' }), lockVersion: current };
      }
      const lockVersion = prev.lockVersion!;
      const body = await invoke<string>('openproject_update_work_package', {
        id: Number(wpId),
        lockVersion,
        progress: change.progress ?? null,
        status: status ? Number(status) : null,
      });
      // Ahora OpenProject tiene lo mismo que Logday: la importación sigue
      // trayendo lo que cambie allá (P5d, P5e).
      done.push({
        wpId,
        sent: change,
        managed: {
          ...prev,
          ...(change.progress !== undefined ? { progress: change.progress } : {}),
          ...(change.status && status ? { status: change.status } : {}),
          lockVersion: lockVersionOf(body) ?? lockVersion + 1,
        },
      });
      lastPush = { at: nowInstant(), status: 'ok', title };
    } catch (err) {
      const code = typeof err === 'string' ? err : 'unknown';
      lastPush = { at: nowInstant(), status: 'error', error: code, title };
      if (RETRY.has(code)) break;
      // Rechazado: no se reintenta; se avisa.
      done.push({ wpId, sent: change });
      const [kind, detail] = code.split('|');
      store().showToast({
        kind: 'error',
        title: t(language, 'openproject', 'pushFailed').replace('{title}', title ?? `#${wpId}`),
        description: kind === 'rejected' && detail ? detail : pushErrorText(language, kind),
        durationMs: 8000,
      });
    }
  }
  await serial(async () => {
    const cur = settingsNow();
    const pending = { ...cur.pending };
    const managed = { ...cur.managed };
    for (const d of done) {
      // Si la tarea volvió a cambiar mientras se enviaba, eso sigue en la fila.
      if (same(pending[d.wpId], d.sent)) delete pending[d.wpId];
      if (d.managed) managed[d.wpId] = d.managed;
    }
    await store().updateExtensionSettings(OPENPROJECT_ID, { pending, managed, ...(lastPush ? { lastPush } : {}) });
  });
}

function taskTitle(taskId: string | undefined): string | undefined {
  const { tasks, activeTask } = useAppStore.getState();
  return [...tasks, ...(activeTask ? [activeTask] : [])].find((t) => t.id === taskId)?.title;
}

const PUSH_ERRORS = new Set(['conflict', 'rejected', 'needs_import', 'forbidden', 'unauthorized', 'not_found', 'network', 'timeout', 'needs_connect']);

export function pushErrorText(language: 'es' | 'en', code: string | undefined): string {
  const c = code && PUSH_ERRORS.has(code.split('|')[0]) ? code.split('|')[0] : 'unknown';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t(language, 'openproject', `push_${c}` as any);
}

// Al terminar cada importación, lo que esperaba se intenta enviar.
onImportDone(() => {
  const s = settingsNow();
  if (s.writeBack && Object.keys(s.pending).length) void flushPending().catch(() => {});
});
