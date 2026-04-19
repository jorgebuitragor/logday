import { useEffect, useState } from 'react';
import './App.css';
import { useAppStore } from './store/appStore';
import { Onboarding } from './pages/Onboarding';
import { Sidebar } from './components/Sidebar';
import { TaskList } from './components/TaskList';
import { KanbanBoard } from './components/KanbanBoard';
import { CalendarView } from './components/CalendarView';
import { TaskEditor } from './components/TaskEditor';
import { NoteList } from './components/NoteList';
import { NoteEditor } from './components/NoteEditor';
import { DailyList } from './components/DailyList';
import { DailyEditor } from './components/DailyEditor';
import { OvertimeList } from './components/OvertimeList';
import { OvertimeEditor } from './components/OvertimeEditor';
import { SearchModal } from './components/SearchModal';
import { SettingsModal } from './components/SettingsModal';
import { OvertimeEntry } from './types';

export default function App() {
  const { init, isLoading, isConfigured, activeTask, activeSection, createNote, setSection, shortcuts } = useAppStore();
  const [editingEntry, setEditingEntry] = useState<OvertimeEntry | null | undefined>(undefined);

  useEffect(() => {
    init();
  }, []);

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

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-[var(--text-hint)]">Cargando Logday…</p>
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
        {activeSection === 'tasks' ? (
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
            <OvertimeList onEdit={(e) => setEditingEntry(e ?? null)} />
            {editingEntry !== undefined && (
              <OvertimeEditor entry={editingEntry} onClose={() => setEditingEntry(undefined)} />
            )}
          </>
        ) : (
          <>
            <DailyList />
            <DailyEditor />
          </>
        )}
      </div>

      {/* Global search overlay */}
      <SearchModal />
      <SettingsModal />
    </div>
  );
}
