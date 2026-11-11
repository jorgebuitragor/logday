// Opciones → Skills de agentes (specs/skills-de-agentes, design "Opciones"):
// los servidores de repos con sus tokens, las carpetas que se revisan y
// qué grupos se muestran.
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { FolderOpen, Plus, Server, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { Toggle } from '../../components/shared/FormControls';
import { CHIP, ICON_BTN } from '../../components/shared/controlClasses';
import type { Tr } from './text';
import type { Language } from '../../lib/i18n';
import { addServer, errorCode, removeServer, revealFolder, type ServerInfo } from './api';
import { clearExtensionSecret, getExtensionSecretHint, setExtensionSecret } from '../secrets';
import { INPUT_CLS, SECONDARY_CLS } from '../../components/shared/controlClasses';
import { AGENT_SKILLS_ID, readSettings } from './model';
import { normalizeHost } from './repos';
import { agentSkillsSecretKeys, TOKEN_KEY_RE } from './secretKeys';
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
      <ServersSettings tr={tr} language={language} />
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

/** Servidores de repos (SK24, SK36): los de serie y los propios, con un
 *  token por servidor. El token va al llavero; el webview solo ve su pista
 *  y nunca lo vuelve a leer. Añadir un servidor pide confirmación nativa. */
function ServersSettings({ tr, language }: { tr: Tr; language: Language }) {
  const { servers, loadServers } = useAgentSkills(useShallow((s) => ({ servers: s.servers, loadServers: s.loadServers })));
  const { raw, update } = useAppStore(useShallow((s) => ({ raw: s.extensions[AGENT_SKILLS_ID]?.settings, update: s.updateExtensionSettings })));
  const [host, setHost] = useState('');
  const [kind, setKind] = useState<'gitlab' | 'gitea'>('gitlab');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  // Las claves de los tokens propios van en la configuración para que
  // "Quitar configuración" las borre (R8).
  const trackKey = (key: string, on: boolean) => {
    if (!TOKEN_KEY_RE.test(key)) return;
    const keys = agentSkillsSecretKeys(raw).filter((k) => k !== key);
    void update(AGENT_SKILLS_ID, { tokenKeys: on ? [...keys, key] : keys });
  };

  const add = async () => {
    const h = normalizeHost(host);
    if (!h) {
      setError('settings.serverInvalid');
      return;
    }
    setError(null);
    try {
      await addServer(language, h, kind);
      await loadServers();
      setHost('');
    } catch (err) {
      const code = errorCode(err);
      if (code !== 'cancelled') setError(`err.${code}`);
    }
  };

  const remove = async (s: ServerInfo) => {
    setError(null);
    try {
      await removeServer(s.host);
      trackKey(s.tokenKey, false);
      await loadServers();
    } catch (err) {
      setError(`err.${errorCode(err)}`);
    }
  };

  return (
    <div className="space-y-2">
      <p className="font-medium text-[var(--text-secondary)]">{tr('settings.servers')}</p>
      <p className="text-[var(--text-hint)]">{tr('settings.serversHelp')}</p>
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border-card)]">
        {servers.map((s) => (
          <li key={s.host} className="space-y-1.5 px-3 py-2">
            <div className="flex items-center gap-2">
              <Server size={13} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-primary)]">{s.host}</span>
              <span className={CHIP}>{tr(`server.kind.${s.kind}`)}</span>
              {s.builtin ? (
                <span className="text-[10px] text-[var(--text-hint)]">{tr('settings.serverBuiltin')}</span>
              ) : (
                <button type="button" className={ICON_BTN} aria-label={tr('settings.serverRemove', { host: s.host })} title={tr('settings.serverRemove', { host: s.host })} onClick={() => void remove(s)}>
                  <Trash2 size={12} aria-hidden />
                </button>
              )}
            </div>
            <ServerToken tr={tr} server={s} onChange={(on) => trackKey(s.tokenKey, on)} />
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          value={host}
          onChange={(e) => {
            setHost(e.target.value);
            setError(null);
          }}
          placeholder="gitlab.empresa.com"
          spellCheck={false}
          autoCapitalize="off"
          aria-label={tr('settings.serverHost')}
          className={`${INPUT_CLS} min-w-0 flex-1 font-mono`}
        />
        <select value={kind} onChange={(e) => setKind(e.target.value as 'gitlab' | 'gitea')} aria-label={tr('settings.serverKind')} className={`${INPUT_CLS} w-auto`}>
          <option value="gitlab">{tr('server.kind.gitlab')}</option>
          <option value="gitea">{tr('server.kind.gitea')}</option>
        </select>
        <button type="submit" className={SECONDARY_CLS} disabled={!host.trim()}>
          <Plus size={13} aria-hidden />
          {tr('settings.serverAdd')}
        </button>
      </form>
      {error && (
        <p className="text-red-400" role="alert">
          {(() => {
            const text = tr(error as Parameters<Tr>[0]);
            return text === error ? tr('err.unknown') : text;
          })()}
        </p>
      )}
    </div>
  );
}

/** El token de un servidor: su pista, Quitar, y un campo para pegar otro. */
function ServerToken({ tr, server, onChange }: { tr: Tr; server: ServerInfo; onChange: (saved: boolean) => void }) {
  const [hint, setHint] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getExtensionSecretHint(AGENT_SKILLS_ID, server.tokenKey)
      .then((h) => alive && setHint(h))
      .catch(() => alive && setHint(null));
    return () => {
      alive = false;
    };
  }, [server.tokenKey]);
  const save = async () => {
    if (!value.trim()) return;
    setError(null);
    try {
      setHint(await setExtensionSecret(AGENT_SKILLS_ID, server.tokenKey, value.trim()));
      onChange(true);
      setValue('');
      setOpen(false);
    } catch (err) {
      setError(errorCode(err));
    }
  };
  const clear = async () => {
    setError(null);
    try {
      await clearExtensionSecret(AGENT_SKILLS_ID, server.tokenKey);
      onChange(false);
      setHint(null);
    } catch (err) {
      setError(errorCode(err));
    }
  };
  return (
    <div className="space-y-1.5 pl-5">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={hint ? 'font-mono text-[var(--text-secondary)]' : 'text-[var(--text-hint)]'}>
          {hint ? tr('settings.tokenSaved', { hint }) : tr('settings.tokenNone')}
        </span>
        <button type="button" className="text-[var(--accent-link)] hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {tr(hint ? 'settings.tokenChange' : 'settings.tokenAdd')}
        </button>
        {hint && (
          <button type="button" className="text-[var(--text-hint)] hover:text-red-400 hover:underline" onClick={() => void clear()}>
            {tr('settings.tokenClear')}
          </button>
        )}
      </div>
      {open && (
        <>
          <p className="text-[11px] text-[var(--text-hint)]">{tr(`settings.tokenHelp.${server.kind}`, { host: server.host })}</p>
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
              placeholder={server.kind === 'github' ? 'github_pat_…' : server.kind === 'gitlab' ? 'glpat-…' : '…'}
              autoComplete="off"
              spellCheck={false}
              aria-label={tr('settings.tokenFor', { host: server.host })}
              className={`${INPUT_CLS} min-w-0 flex-1 font-mono`}
              autoFocus
            />
            <button type="submit" className={SECONDARY_CLS} disabled={!value.trim()}>{tr('settings.tokenSave')}</button>
          </form>
        </>
      )}
      {error && <p className="text-red-400" role="alert">{trCode(tr, 'err', error, 'err.unknown')}</p>}
    </div>
  );
}
