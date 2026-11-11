// Opciones → Skills de agentes (specs/skills-de-agentes, design "Opciones"):
// las carpetas que se revisan y qué grupos se muestran.
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { FolderOpen } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { Toggle } from '../../components/shared/FormControls';
import { ICON_BTN } from '../../components/shared/controlClasses';
import { errorCode, revealFolder } from './api';
import { AGENT_SKILLS_ID, readSettings } from './model';
import { useAgentSkills } from './store';
import { makeTr, trCode } from './text';

export default function AgentSkillsSettings() {
  const { language, raw, update } = useAppStore(
    useShallow((s) => ({ language: s.language, raw: s.extensions[AGENT_SKILLS_ID]?.settings, update: s.updateExtensionSettings })),
  );
  const settings = useMemo(() => readSettings(raw), [raw]);
  const tr = useMemo(() => makeTr(language), [language]);
  const { folders, loaded, reload } = useAgentSkills(useShallow((s) => ({ folders: s.folders, loaded: s.loaded, reload: s.reload })));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) void reload();
  }, [loaded, reload]);

  return (
    <div className="space-y-5 text-xs">
      <div className="space-y-2">
        <p className="font-medium text-[var(--text-secondary)]">{tr('settings.show')}</p>
        <Toggle label={tr('settings.showPlugins')} checked={settings.showPlugins} onChange={(v) => void update(AGENT_SKILLS_ID, { showPlugins: v })} />
        <Toggle label={tr('settings.showSystem')} checked={settings.showSystem} onChange={(v) => void update(AGENT_SKILLS_ID, { showSystem: v })} />
      </div>
      <div className="space-y-2">
        <p className="font-medium text-[var(--text-secondary)]">{tr('settings.folders')}</p>
        <p className="text-[var(--text-hint)]">{tr('settings.foldersHelp')}</p>
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border-card)]">
          {folders.map((f) => (
            <li key={f.source} className="flex items-center gap-2 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[var(--text-primary)]">{trCode(tr, 'source', f.source, 'source.claude')}</p>
                <p className="break-all font-mono text-[11px] text-[var(--text-hint)]">
                  {f.path}
                  {!f.exists && <span className="ml-2 font-sans">· {tr('settings.missing')}</span>}
                </p>
              </div>
              {f.exists && (
                <button
                  type="button"
                  className={ICON_BTN}
                  aria-label={tr('revealAria', { path: f.path })}
                  onClick={() => {
                    setError(null);
                    revealFolder(f.source).catch((err) => setError(errorCode(err)));
                  }}
                >
                  <FolderOpen size={13} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="text-red-400" role="alert">{trCode(tr, 'err', error, 'err.unknown')}</p>}
      </div>
    </div>
  );
}
