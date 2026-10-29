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
import { isImporting } from './importer';
import { OPENPROJECT_ID, changesToPush, lockVersionOf, readOpenProjectSettings } from './model';

/** Sin red o sin VPN: queda pendiente y se reintenta. */
const RETRY = new Set(['network', 'timeout']);

/** El oyente de `task.updated`. */
export async function onTaskUpdated(prev: Task | undefined, next: Task): Promise<void> {
  if (isImporting()) return;
  const store = useAppStore.getState;
  const settings = readOpenProjectSettings(store().extensions[OPENPROJECT_ID]?.settings);
  if (!settings.writeBack || !settings.account) return;
  const wpId = Object.keys(settings.imported).find((k) => settings.imported[k] === next.id);
  if (!wpId) return;
  const change = changesToPush(prev, next, (s) => !!settings.statusMap[s]);
  if (!change) return;
  const pending = { ...settings.pending, [wpId]: { ...settings.pending[wpId], ...change } };
  await store().updateExtensionSettings(OPENPROJECT_ID, { pending });
  await flushPending();
}

let flushing: Promise<void> | null = null;

/** Envía lo pendiente; si ya está enviando, espera ese envío. */
export function flushPending(): Promise<void> {
  flushing ??= flush().finally(() => { flushing = null; });
  return flushing;
}

async function flush(): Promise<void> {
  const store = useAppStore.getState;
  const settings = readOpenProjectSettings(store().extensions[OPENPROJECT_ID]?.settings);
  if (!settings.writeBack || !settings.account) return;
  const pending = { ...settings.pending };
  const managed = { ...settings.managed };
  const language = store().language;
  let lastPush = settings.lastPush;
  for (const [wpId, change] of Object.entries(pending)) {
    const prev = managed[wpId];
    const title = await taskTitle(settings.imported[wpId]);
    if (prev?.lockVersion === undefined) {
      // Importada antes de P12: hace falta importar una vez para tener la versión.
      lastPush = { at: nowInstant(), status: 'error', error: 'needs_import', title };
      continue;
    }
    const status = change.status ? settings.statusMap[change.status]?.id : undefined;
    try {
      const body = await invoke<string>('openproject_update_work_package', {
        id: Number(wpId),
        lockVersion: prev.lockVersion,
        progress: change.progress ?? null,
        status: status ? Number(status) : null,
      });
      // Ahora OpenProject tiene lo mismo que Logday: la importación sigue
      // trayendo lo que cambie allá (P5d, P5e).
      managed[wpId] = {
        ...prev,
        ...(change.progress !== undefined ? { progress: change.progress } : {}),
        ...(change.status && status ? { status: change.status } : {}),
        lockVersion: lockVersionOf(body) ?? prev.lockVersion + 1,
      };
      delete pending[wpId];
      lastPush = { at: nowInstant(), status: 'ok', title };
    } catch (err) {
      const code = typeof err === 'string' ? err : 'unknown';
      if (RETRY.has(code)) {
        lastPush = { at: nowInstant(), status: 'error', error: code, title };
        break;
      }
      // Rechazado: no se reintenta; se avisa.
      delete pending[wpId];
      lastPush = { at: nowInstant(), status: 'error', error: code, title };
      const [kind, detail] = code.split('|');
      store().showToast({
        kind: 'error',
        title: t(language, 'openproject', 'pushFailed').replace('{title}', title ?? `#${wpId}`),
        description: kind === 'rejected' && detail ? detail : pushErrorText(language, kind),
        durationMs: 8000,
      });
    }
  }
  await store().updateExtensionSettings(OPENPROJECT_ID, { pending, managed, ...(lastPush ? { lastPush } : {}) });
}

async function taskTitle(taskId: string | undefined): Promise<string | undefined> {
  const { tasks, activeTask } = useAppStore.getState();
  return [...tasks, ...(activeTask ? [activeTask] : [])].find((t) => t.id === taskId)?.title;
}

const PUSH_ERRORS = new Set(['conflict', 'rejected', 'needs_import', 'forbidden', 'unauthorized', 'not_found', 'network', 'timeout', 'needs_connect']);

export function pushErrorText(language: 'es' | 'en', code: string | undefined): string {
  const c = code && PUSH_ERRORS.has(code.split('|')[0]) ? code.split('|')[0] : 'unknown';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t(language, 'openproject', `push_${c}` as any);
}
