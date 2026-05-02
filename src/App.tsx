import { lazy, Suspense, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Clock, Plus } from 'lucide-react';
import './App.css';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './store/appStore';
import { t } from './lib/i18n';
import { Onboarding } from './pages/Onboarding';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { TaskList } from './components/TaskList';
import { SearchModal } from './components/SearchModal';
import { SettingsModal } from './components/SettingsModal';
import { GitModal } from './components/GitModal';
import { ToastViewport } from './components/ToastViewport';
import { OvertimeEntry } from './types';
import { useEventNotifier } from './lib/eventNotifier';

const KanbanBoard   = lazy(() => import('./components/KanbanBoard').then(m => ({ default: m.KanbanBoard })));
const CalendarView  = lazy(() => import('./components/CalendarView').then(m => ({ default: m.CalendarView })));
const TaskEditor    = lazy(() => import('./components/TaskEditor').then(m => ({ default: m.TaskEditor })));
const NoteList      = lazy(() => import('./components/NoteList').then(m => ({ default: m.NoteList })));
const NoteEditor    = lazy(() => import('./components/NoteEditor').then(m => ({ default: m.NoteEditor })));
const DailyList     = lazy(() => import('./components/DailyList').then(m => ({ default: m.DailyList })));
const DailyEditor   = lazy(() => import('./components/DailyEditor').then(m => ({ default: m.DailyEditor })));
const OvertimeList  = lazy(() => import('./components/OvertimeList').then(m => ({ default: m.OvertimeList })));
const OvertimeEditor = lazy(() => import('./components/OvertimeEditor').then(m => ({ default: m.OvertimeEditor })));

export default function App() {
  const { init, isLoading, isConfigured, activeTask, activeSection, createNote, setSection, shortcuts, overtimeMonth, language } = useAppStore(
    useShallow((s) => ({
      init: s.init,
      isLoading: s.isLoading,
      isConfigured: s.isConfigured,
      activeTask: s.activeTask,
      activeSection: s.activeSection,
      createNote: s.createNote,
      setSection: s.setSection,
      shortcuts: s.shortcuts,
      overtimeMonth: s.overtimeMonth,
      language: s.language,
    }))
  );
  const [editingEntry, setEditingEntry] = useState<OvertimeEntry | null | undefined>(undefined);

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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [createNote, setSection, shortcuts]);

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
    <div className="flex h-screen w-full overflow-hidden bg-[var(--bg-base)]">
      {/* Sidebar */}
      <Sidebar />

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
            <NoteEditor />
          </>
        ) : activeSection === 'overtime' ? (
          <>
            <OvertimeList
              activeEntryId={editingEntry?.id ?? null}
              onEdit={setEditingEntry}
            />
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
            <DailyEditor />
          </>
        )}
        </Suspense>
      </div>

      {/* Global search overlay */}
      <SearchModal />
      <SettingsModal />
      <GitModal />
      <ToastViewport />
    </div>
  );
}
