// Opciones → Skills de agentes (specs/skills-de-agentes, design "Opciones"):
// las carpetas que se revisan y qué grupos se muestran.
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { FolderOpen } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { Toggle } from '../../components/shared/FormControls';
import { ICON_BTN } from '../../components/shared/controlClasses';
import type { Tr } from './text';
import { errorCode, revealFolder } from './api';
import { clearExtensionSecret, getExtensionSecretHint, setExtensionSecret } from '../secrets';
import { INPUT_CLS, SECONDARY_CLS } from '../../components/shared/controlClasses';
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
      <GithubToken tr={tr} />
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

/** Token de GitHub para repos privados (SK24): va al llavero; el webview
 *  solo ve su pista y nunca lo vuelve a leer. */
function GithubToken({ tr }: { tr: Tr }) {
  const [hint, setHint] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getExtensionSecretHint(AGENT_SKILLS_ID, 'github_token')
      .then((h) => alive && setHint(h))
      .catch(() => alive && setHint(null));
    return () => {
      alive = false;
    };
  }, []);
  const save = async () => {
    if (!value.trim()) return;
    setError(null);
    try {
      setHint(await setExtensionSecret(AGENT_SKILLS_ID, 'github_token', value.trim()));
      setValue('');
    } catch (err) {
      setError(errorCode(err));
    }
  };
  const clear = async () => {
    setError(null);
    try {
      await clearExtensionSecret(AGENT_SKILLS_ID, 'github_token');
      setHint(null);
    } catch (err) {
      setError(errorCode(err));
    }
  };
  return (
    <div className="space-y-2">
      <p className="font-medium text-[var(--text-secondary)]">{tr('settings.token')}</p>
      <p className="text-[var(--text-hint)]">{tr('settings.tokenHelp')}</p>
      {hint && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[var(--text-primary)]">{tr('settings.tokenSaved', { hint })}</span>
          <button type="button" className={SECONDARY_CLS} onClick={() => void clear()}>{tr('settings.tokenClear')}</button>
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={hint ? tr('settings.tokenReplace') : 'github_pat_…'}
          autoComplete="off"
          spellCheck={false}
          aria-label={tr('settings.token')}
          className={`${INPUT_CLS} min-w-0 flex-1 font-mono`}
        />
        <button type="submit" className={SECONDARY_CLS} disabled={!value.trim()}>{tr('settings.tokenSave')}</button>
      </form>
      {error && <p className="text-red-400" role="alert">{trCode(tr, 'err', error, 'err.unknown')}</p>}
    </div>
  );
}
