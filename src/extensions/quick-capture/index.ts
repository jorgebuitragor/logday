// Módulo de "Captura rápida" en la ventana principal. Se carga con
// `import()` solo cuando la extensión está activa (specs/extensiones R16).
// La ventana de captura no escribe: este módulo crea lo que le manda,
// con las acciones del store (C15).
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { t } from '../../lib/i18n';
import { useAppStore } from '../../store/appStore';
import type { ExtensionModule } from '../types';
import { configureShortcut, disableQuickCapture } from './api';
import {
  EVT_REPLY, EVT_REQUEST, INBOX_PROJECT, QUICK_CAPTURE_ID, readCaptureSettings,
  type CaptureReply, type CaptureRequest,
} from './model';
import Settings from './Settings';

async function handle(req: CaptureRequest): Promise<CaptureReply> {
  const s = useAppStore.getState();
  const defaults = readCaptureSettings(s.extensions[QUICK_CAPTURE_ID]?.settings);
  if (req.type === 'context') {
    return {
      id: req.id,
      ok: true,
      context: {
        configured: s.isConfigured && !!s.basePath,
        language: s.language,
        theme: s.theme,
        customThemes: s.customThemes,
        projects: s.projects.includes(INBOX_PROJECT) ? s.projects : [INBOX_PROJECT, ...s.projects],
        folders: s.noteFolders,
        defaults,
      },
    };
  }
  if (req.kind === 'task') {
    const project = req.target || INBOX_PROJECT;
    if (req.open) await s.setSection('tasks');
    // Con `open`, la tarea queda abierta en el panel lateral, como al
    // crearla desde la app.
    await s.createTask(req.title, project, req.content, undefined, { open: req.open });
    if (req.open) await invoke('quick_capture_open_main');
    return { id: req.id, ok: true, where: project };
  }
  const note = await s.createNoteWith({ title: req.title, content: req.content, folder: req.target });
  if (req.open) {
    await s.setSection('notes');
    s.setActiveNote(note);
    await invoke('quick_capture_open_main');
  }
  return { id: req.id, ok: true, where: req.target || t(s.language, 'quickCapture', 'rootFolder') };
}

const currentShortcut = () => readCaptureSettings(useAppStore.getState().extensions[QUICK_CAPTURE_ID]?.settings).shortcut;

function start(): () => void {
  void configureShortcut(currentShortcut());
  // El texto de la bandeja va en el idioma de la app.
  const unsubscribe = useAppStore.subscribe((s, prev) => {
    if (s.language !== prev.language) void configureShortcut(currentShortcut());
  });
  const unlisten = listen<CaptureRequest>(EVT_REQUEST, ({ payload }) => {
    void handle(payload)
      .catch((err): CaptureReply => ({ id: payload.id, ok: false, error: String(err instanceof Error ? err.message : err) }))
      .then((reply) => emit(EVT_REPLY, reply));
  });
  return () => {
    unsubscribe();
    void unlisten.then((fn) => fn());
    void disableQuickCapture();
  };
}

const quickCapture: ExtensionModule = { Settings, start };

export default quickCapture;
