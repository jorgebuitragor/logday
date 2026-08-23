import { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { Shortcuts } from '../../types/config';
import { t } from '../../lib/i18n';

export function ShortcutsSettingsTab() {
  const { language, shortcuts, setShortcut } = useAppStore();
  const [recordingFor, setRecordingFor] = useState<keyof Shortcuts | null>(null);

  // Grabar nuevo atajo
  useEffect(() => {
    if (!recordingFor) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
      if (e.key === 'Escape') { setRecordingFor(null); return; }
      setShortcut(recordingFor, e.key.toLowerCase());
      setRecordingFor(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recordingFor, setShortcut]);

  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
        {t(language, 'settings', 'shortcuts')}
      </p>
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] divide-y divide-[var(--border)]">
        {(
          [
            { key: 'newNote' as keyof Shortcuts, label: t(language, 'settings', 'shortcutNewNote') },
            { key: 'newTask' as keyof Shortcuts, label: t(language, 'settings', 'shortcutNewTask') },
            { key: 'search'  as keyof Shortcuts, label: t(language, 'settings', 'shortcutSearch') },
          ] as { key: keyof Shortcuts; label: string }[]
        ).map(({ key, label }) => {
          const isRecording = recordingFor === key;
          const currentKey = shortcuts[key].toUpperCase();
          return (
            <div key={key} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <Keyboard size={13} className="text-[var(--text-hint)]" />
                {label}
              </div>
              <button
                onClick={() => setRecordingFor(isRecording ? null : key)}
                className={`min-w-[80px] rounded-lg border px-3 py-1 text-center text-xs font-mono transition ${
                  isRecording
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 animate-pulse'
                    : 'border-[var(--border-card)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-indigo-500/50 hover:text-indigo-400'
                }`}
              >
                {isRecording ? t(language, 'settings', 'shortcutPress') : `⌘ ${currentKey}`}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-[10px] text-[var(--text-hint)]">
        {t(language, 'settings', 'shortcutHint')}
      </p>
    </div>
  );
}
