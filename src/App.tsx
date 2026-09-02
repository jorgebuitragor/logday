import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Clock, Plus } from 'lucide-react';
import './App.css';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './store/appStore';
import { t } from './lib/i18n';
import { Onboarding } from './pages/Onboarding';
import { Sidebar } from './components/sidebar/Sidebar';
import { ResizeHandle } from './components/ResizeHandle';
import { DashboardView } from './components/dashboard/DashboardView';
import { TaskList } from './components/tasks/TaskList';
import { SearchModal } from './components/SearchModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { ToastViewport } from './components/ToastViewport';
import { UpdateRestartBanner } from './components/UpdateRestartBanner';
import { PolicyGateModal } from './components/PolicyGateModal';
import { OvertimeEntry } from './types/overtime';
import { useEventNotifier } from './lib/eventNotifier';

const KanbanBoard   = lazy(() => import('./components/tasks/KanbanBoard').then(m => ({ default: m.KanbanBoard })));
const CalendarView  = lazy(() => import('./components/calendar/CalendarView').then(m => ({ default: m.CalendarView })));
const TaskEditor    = lazy(() => import('./components/tasks/TaskEditor').then(m => ({ default: m.TaskEditor })));
const NoteList      = lazy(() => import('./components/notes/NoteList').then(m => ({ default: m.NoteList })));
const NoteEditor    = lazy(() => import('./components/notes/NoteEditor').then(m => ({ default: m.NoteEditor })));
const DailyList     = lazy(() => import('./components/daily/DailyList').then(m => ({ default: m.DailyList })));
const DailyEditor   = lazy(() => import('./components/daily/DailyEditor').then(m => ({ default: m.DailyEditor })));
const OvertimeList  = lazy(() => import('./components/overtime/OvertimeList').then(m => ({ default: m.OvertimeList })));
const OvertimeEditor = lazy(() => import('./components/overtime/OvertimeEditor').then(m => ({ default: m.OvertimeEditor })));

export default function App() {
  const { init, isLoading, isConfigured, activeTask, activeNoteId, activeSection, createNote, createTodayDaily, setSection, shortcuts, overtimeMonth, language, isSidebarCollapsed } = useAppStore(
    useShallow((s) => ({
      init: s.init,
      isLoading: s.isLoading,
      isConfigured: s.isConfigured,
      activeTask: s.activeTask,
      activeNoteId: s.activeNote?.id ?? null,
      activeSection: s.activeSection,
      createNote: s.createNote,
      createTodayDaily: s.createTodayDaily,
      setSection: s.setSection,
      shortcuts: s.shortcuts,
      overtimeMonth: s.overtimeMonth,
      language: s.language,
      isSidebarCollapsed: s.isSidebarCollapsed,
    }))
  );
  const [editingEntry, setEditingEntry] = useState<OvertimeEntry | null | undefined>(undefined);

  // ── Panel resize ───────────────────────────────────────────────
  const SIDEBAR_W_KEY = 'logday_sidebar_w';
  const LIST_W_KEY = 'logday_list_w';
  const DEFAULT_SIDEBAR_W = 224;
  const DEFAULT_LIST_W = 288;

  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    Number(localStorage.getItem(SIDEBAR_W_KEY) || DEFAULT_SIDEBAR_W)
  );
  const [listPanelWidth, setListPanelWidth] = useState<number>(() =>
    Number(localStorage.getItem(LIST_W_KEY) || DEFAULT_LIST_W)
  );

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => {
      const next = Math.max(160, Math.min(420, w + delta));
      localStorage.setItem(SIDEBAR_W_KEY, String(next));
      return next;
    });
  }, []);

  const handleListResize = useCallback((delta: number) => {
    setListPanelWidth((w) => {
      const next = Math.max(200, Math.min(520, w + delta));
      localStorage.setItem(LIST_W_KEY, String(next));
      return next;
    });
  }, []);

  const resetSidebarWidth = useCallback(() => {
    setSidebarWidth(DEFAULT_SIDEBAR_W);
    localStorage.setItem(SIDEBAR_W_KEY, String(DEFAULT_SIDEBAR_W));
  }, []);

  const resetListWidth = useCallback(() => {
    setListPanelWidth(DEFAULT_LIST_W);
    localStorage.setItem(LIST_W_KEY, String(DEFAULT_LIST_W));
  }, []);
  // ──────────────────────────────────────────────────────────────

  // Cerrar el editor de extras al cambiar de mes
  useEffect(() => {
    setEditingEntry(undefined);
  }, [overtimeMonth]);

  useEffect(() => {
    init();
  }, []);

  useEventNotifier();

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const tag = (e.target as HTMLElement).tagName;
      const isEditable = (e.target as HTMLElement).isContentEditable;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || isEditable;

      // nueva nota
      if (e.key === shortcuts.newNote && !inField) {
        e.preventDefault();
        setSection('notes');
        await createNote();
      }

      // nueva tarea
      if (e.key === shortcuts.newTask && !inField) {
        e.preventDefault();
        setSection('tasks');
        setTimeout(() => window.dispatchEvent(new CustomEvent('logday:new-task')), 50);
      }

      // daily de hoy
      if (e.key === shortcuts.newDaily && !inField) {
        e.preventDefault();
        setSection('dailys');
        createTodayDaily();
      }

      // marcar ausencia
      if (e.key === shortcuts.markAbsence && !inField) {
        e.preventDefault();
        setSection('dailys');
        setTimeout(() => window.dispatchEvent(new CustomEvent('logday:mark-absence')), 50);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [createNote, createTodayDaily, setSection, shortcuts]);

  useEffect(() => {
    const unNote = listen('tray:new-note', async () => {
      setSection('notes');
      await createNote();
    });
    const unTask = listen('tray:new-task', () => {
      setSection('tasks');
      setTimeout(() => window.dispatchEvent(new CustomEvent('logday:new-task')), 50);
    });
    return () => {
      unNote.then(fn => fn());
      unTask.then(fn => fn());
    };
  }, [createNote, setSection]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-[var(--text-hint)]">{t((localStorage.getItem('language') as 'es' | 'en') || 'es', 'loading')}</p>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return <Onboarding />;
  }

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-[var(--bg-base)]"
      style={{
        '--logday-sidebar-w': `${sidebarWidth}px`,
        '--logday-list-w': `${listPanelWidth}px`,
      } as React.CSSProperties}
    >
      {/* Sidebar */}
      <Sidebar />
      {!isSidebarCollapsed && (
        <ResizeHandle onResize={handleSidebarResize} onReset={resetSidebarWidth} />
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        <Suspense fallback={null}>
        {activeSection === 'dashboard' ? (
          <DashboardView />
        ) : activeSection === 'tasks' ? (
          <>
            <TaskList />
            <KanbanBoard />
            <CalendarView />
            {activeTask && <TaskEditor />}
          </>
        ) : activeSection === 'notes' ? (
          <>
            <NoteList />
            <ResizeHandle onResize={handleListResize} onReset={resetListWidth} />
            <NoteEditor key={activeNoteId ?? 'none'} />
          </>
        ) : activeSection === 'overtime' ? (
          <>
            <OvertimeList
              activeEntryId={editingEntry?.id ?? null}
              onEdit={setEditingEntry}
            />
            <ResizeHandle onResize={handleListResize} onReset={resetListWidth} />
            {editingEntry !== undefined ? (
              <Suspense fallback={null}>
                <OvertimeEditor key={editingEntry?.id ?? 'new'} entry={editingEntry} onClose={() => setEditingEntry(undefined)} />
              </Suspense>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[var(--bg-base)] text-[var(--text-hint)]">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                  <Clock size={28} className="text-[var(--text-hint)]" />
                </div>
                <p className="text-sm font-medium text-[var(--text-secondary)]">{t(language, 'overtime', 'emptyPanelTitle')}</p>
                <p className="text-xs text-[var(--text-hint)]">{t(language, 'overtime', 'emptyPanelDesc')}</p>
                <button
                  onClick={() => setEditingEntry(null)}
                  className="mt-1 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-indigo-500"
                >
                  <Plus size={13} />
                  {t(language, 'overtime', 'emptyPanelBtn')}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <DailyList />
            <ResizeHandle onResize={handleListResize} onReset={resetListWidth} />
            <DailyEditor />
          </>
        )}
        </Suspense>
      </div>

      {/* Global search overlay */}
      <SearchModal />
      <SettingsModal />
      <ToastViewport />
      <UpdateRestartBanner />
      <PolicyGateModal />
    </div>
  );
}
