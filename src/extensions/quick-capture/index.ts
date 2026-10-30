// Módulo de "Captura rápida" en la ventana principal. Se carga con
// `import()` solo cuando la extensión está activa (specs/extensiones R16).
// La ventana de captura no escribe: este módulo crea lo que le manda,
// con las acciones del store (C15).
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { t } from '../../lib/i18n';
import { useAppStore } from '../../store/appStore';
import type { Note } from '../../types/note';
import type { Task } from '../../types/task';
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
    const task = await s.createTask(req.title, project, req.content, undefined, { open: false });
    if (req.open && task) {
      await showMain();
      await openTask(task);
    }
    return { id: req.id, ok: true, where: project };
  }
  const note = await s.createNoteWith({ title: req.title, content: req.content, folder: req.target });
  if (req.open) {
    await showMain();
    await openNote(note);
  }
  return { id: req.id, ok: true, where: req.target || t(s.language, 'quickCapture', 'rootFolder') };
}

/** C13: primero se muestra la ventana principal y después se abre lo
 *  creado, como "Nueva nota" de la bandeja. Abrir la nota con la ventana
 *  oculta rompía el editor al montarse (QA, 29 oct 2026). */
async function showMain() {
  await invoke('quick_capture_open_main');
  await new Promise((resolve) => window.setTimeout(resolve, 50));
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

/** Abre la tarea en su proyecto, para que se vea en la lista, y con el
 *  panel lateral, como la nota de abajo: primero la vista y después la
 *  tarea. Kanban y Calendario se cargan con `lazy` y, al montarse, cierran
 *  el panel (CalendarView lo hace al cambiar de día), así que se esperan
 *  antes de abrirlo (QA, 29 oct 2026). */
async function openTask(task: Task) {
  const s = useAppStore.getState();
  s.setActiveTask(null);
  await s.setSection('tasks');
  s.selectProject(task.project);
  await Promise.all([
    s.loadTasks(task.project),
    import('../../components/tasks/TaskEditor'),
    import('../../components/tasks/KanbanBoard'),
    import('../../components/calendar/CalendarView'),
  ]);
  await nextFrame();
  await nextFrame();
  useAppStore.getState().setActiveTask(task);
}

/** Abre la nota con el editor ya montado. Si el editor de notas se monta
 *  por primera vez con una nota ya elegida (su `lazy` todavía cargando),
 *  falla con `commandManager` nulo; desde la lista no pasa, porque ahí el
 *  editor ya está montado vacío (QA, 29 oct 2026). Por eso primero la
 *  sección con el editor vacío, y después la nota. */
async function openNote(note: Note) {
  const s = useAppStore.getState();
  s.setActiveNote(null);
  await s.setSection('notes');
  await import('../../components/notes/NoteEditor');
  await nextFrame();
  await nextFrame();
  useAppStore.getState().setActiveNote(note);
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
