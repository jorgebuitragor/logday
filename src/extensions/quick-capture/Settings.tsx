import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertCircle, CheckCircle2, Keyboard } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { AppSelect } from '../../components/calendar/AppSelect';
import { configureShortcut, shortcutLabel, useRegistrationStatus } from './api';
import {
  DEFAULT_SHORTCUT, INBOX_PROJECT, QUICK_CAPTURE_ID, isMacPlatform, readCaptureSettings, shortcutFromKeyEvent,
  type CaptureKind,
} from './model';

const SECONDARY_CLS =
  'flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50';

const ERROR_KEY = {
  invalid: 'errorInvalid',
  taken: 'errorTaken',
  unsupported: 'errorUnsupported',
  unknown: 'errorUnknown',
} as const;

/** Panel de la captura rápida en Opciones (specs/captura-rapida C2, C3, C8). */
export default function QuickCaptureSettings() {
  const { language, raw, update, projects, folders } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[QUICK_CAPTURE_ID]?.settings,
      update: s.updateExtensionSettings,
      projects: s.projects,
      folders: s.noteFolders,
    })),
  );
  const settings = readCaptureSettings(raw);
  const status = useRegistrationStatus();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = async (shortcut: string) => {
    setBusy(true);
    try {
      const result = await configureShortcut(shortcut);
      if (result === 'ok') {
        await update(QUICK_CAPTURE_ID, { shortcut });
      } else if (shortcut !== settings.shortcut) {
        // C3: el nuevo no se pudo registrar; vuelve el que estaba, y el
        // aviso sigue hablando del nuevo.
        await configureShortcut(settings.shortcut, { keepStatus: true });
      }
    } finally {
      setBusy(false);
    }
  };

  // C2: se graba el siguiente atajo que se pulse. Esc cancela.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setRecording(false);
        return;
      }
      const shortcut = shortcutFromKeyEvent(e, isMacPlatform());
      if (!shortcut) return;
      setRecording(false);
      void apply(shortcut);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const failed = status && status.result !== 'ok' && status.shortcut !== settings.shortcut ? status : null;
  const current = status?.shortcut === settings.shortcut ? status : null;

  const kindOptions: { value: CaptureKind; label: string }[] = [
    { value: 'task', label: t(language, 'quickCapture', 'kindTask') },
    { value: 'note', label: t(language, 'quickCapture', 'kindNote') },
  ];
  const projectOptions = (projects.includes(INBOX_PROJECT) ? projects : [INBOX_PROJECT, ...projects])
    .map((p) => ({ value: p, label: p }));
  const folderOptions = [
    { value: '', label: t(language, 'quickCapture', 'rootFolder') },
    ...folders.map((f) => ({ value: f, label: f })),
  ];

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-1.5">
        <p className="text-[var(--text-secondary)]">{t(language, 'quickCapture', 'shortcut')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <kbd className="rounded-md border border-[var(--border-card)] bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-[var(--text-primary)]">
            {recording ? t(language, 'quickCapture', 'recording') : shortcutLabel(settings.shortcut)}
          </kbd>
          <button type="button" className={SECONDARY_CLS} disabled={busy} onClick={() => setRecording((r) => !r)}>
            <Keyboard size={13} />
            {recording ? t(language, 'quickCapture', 'cancel') : t(language, 'quickCapture', 'change')}
          </button>
          {settings.shortcut !== DEFAULT_SHORTCUT && (
            <button type="button" className={SECONDARY_CLS} disabled={busy || recording} onClick={() => void apply(DEFAULT_SHORTCUT)}>
              {t(language, 'quickCapture', 'reset')}
            </button>
          )}
        </div>
        {recording && <p className="text-[11px] text-[var(--text-hint)]">{t(language, 'quickCapture', 'recordingHint')}</p>}
        {failed && (
          <p className="flex items-start gap-1.5 text-[11px] text-red-400">
            <AlertCircle size={12} className="mt-px shrink-0" />
            <span>
              {shortcutLabel(failed.shortcut)}: {t(language, 'quickCapture', ERROR_KEY[failed.result as keyof typeof ERROR_KEY])}
            </span>
          </p>
        )}
        {!failed && current?.result === 'ok' && (
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <CheckCircle2 size={12} className="shrink-0 text-emerald-400" />
            {t(language, 'quickCapture', 'registered')}
          </p>
        )}
        {!failed && current && current.result !== 'ok' && (
          <p className="flex items-start gap-1.5 text-[11px] text-red-400">
            <AlertCircle size={12} className="mt-px shrink-0" />
            <span>{t(language, 'quickCapture', ERROR_KEY[current.result as keyof typeof ERROR_KEY])}</span>
          </p>
        )}
        <p className="text-[11px] text-[var(--text-hint)]">{t(language, 'quickCapture', 'trayHint')}</p>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
        <span className="text-[var(--text-secondary)]">{t(language, 'quickCapture', 'defaultKind')}</span>
        <AppSelect value={settings.kind} options={kindOptions} onChange={(kind) => void update(QUICK_CAPTURE_ID, { kind })} />
        <span className="text-[var(--text-secondary)]">{t(language, 'quickCapture', 'defaultProject')}</span>
        <AppSelect value={settings.project} options={projectOptions} onChange={(project) => void update(QUICK_CAPTURE_ID, { project })} />
        <span className="text-[var(--text-secondary)]">{t(language, 'quickCapture', 'defaultFolder')}</span>
        <AppSelect value={settings.folder} options={folderOptions} onChange={(folder) => void update(QUICK_CAPTURE_ID, { folder })} />
      </div>
    </div>
  );
}
