import { useEffect, useRef, useState } from 'react';
import { GitCommit, RefreshCw, CheckCircle2, AlertCircle, Clock, Upload, Download, CloudOff, ArrowDown } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { GitConfig } from '../types/git';
import { t } from '../lib/i18n';
import ToggleSwitch from './ToggleSwitch';

function timeAgo(iso: string, lang: 'es' | 'en'): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (lang === 'en') {
    if (diff < 60) return 'less than 1 min ago';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  }
  if (diff < 60) return 'hace menos de 1 min';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} días`;
}

interface GitSettingsTabProps {
  // Si la pestaña Git es la actualmente visible. El componente sigue
  // montado (y sus efectos de sincronización en segundo plano siguen
  // corriendo) incluso cuando active es false — igual que el resto de
  // este módulo, el auto-commit/fetch periódico de git debe seguir
  // funcionando aunque el usuario esté viendo otra pestaña.
  active: boolean;
}

export function GitSettingsTab({ active }: GitSettingsTabProps) {
  const {
    gitConfig, saveGitConfig,
    gitStatus, gitRemoteStatus, lastCommitTime,
    gitInit, gitCommit, gitPush, gitPull, gitFetch,
    basePath, language,
  } = useAppStore();

  const [gitRemote, setGitRemote] = useState(gitConfig.remote);
  const [gitAutoCommit, setGitAutoCommit] = useState(gitConfig.autoCommitHourly);
  const [gitAutoPush, setGitAutoPush] = useState(gitConfig.autoPushDaily);
  const [gitEnabled, setGitEnabled] = useState(gitConfig.enabled);
  const [gitUserName, setGitUserName] = useState(gitConfig.userName ?? '');
  const [gitUserEmail, setGitUserEmail] = useState(gitConfig.userEmail ?? '');
  const [gitBusy, setGitBusy] = useState(false);
  const [gitFetchBusy, setGitFetchBusy] = useState(false);
  const [gitErrorMsg, setGitErrorMsg] = useState('');
  const [gitNow, setGitNow] = useState(Date.now());
  const gitAutoCommitRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Actualizar "hace X min" cada 30 s
  useEffect(() => {
    const interval = setInterval(() => setGitNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  void gitNow;

  // Auto-commit horario mientras la app está abierta
  useEffect(() => {
    if (gitAutoCommitRef.current) clearInterval(gitAutoCommitRef.current);
    if (gitEnabled && gitAutoCommit && basePath) {
      gitAutoCommitRef.current = setInterval(() => {
        gitCommit().catch(() => {});
      }, 60 * 60 * 1000);
    }
    return () => {
      if (gitAutoCommitRef.current) clearInterval(gitAutoCommitRef.current);
    };
  }, [gitEnabled, gitAutoCommit, basePath, gitCommit]);

  // Sincronizar estado local con gitConfig al entrar a esta pestaña
  useEffect(() => {
    if (!active) return;
    setGitRemote(gitConfig.remote);
    setGitAutoCommit(gitConfig.autoCommitHourly);
    setGitAutoPush(gitConfig.autoPushDaily);
    setGitEnabled(gitConfig.enabled);
    setGitUserName(gitConfig.userName ?? '');
    setGitUserEmail(gitConfig.userEmail ?? '');
    setGitErrorMsg('');
    if (gitConfig.enabled && gitConfig.remote.trim()) {
      setGitFetchBusy(true);
      gitFetch().catch(() => {}).finally(() => setGitFetchBusy(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Fetch periódico cada 30 min
  useEffect(() => {
    if (!gitConfig.enabled || !gitConfig.remote.trim()) return;
    const interval = setInterval(() => {
      gitFetch().catch(() => {});
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [gitConfig.enabled, gitConfig.remote, gitFetch]);

  const handleGitSave = async () => {
    setGitBusy(true);
    setGitErrorMsg('');
    try {
      const newCfg: GitConfig = {
        enabled: gitEnabled,
        remote: gitRemote,
        autoCommitHourly: gitAutoCommit,
        autoPushDaily: gitAutoPush,
        userName: gitUserName,
        userEmail: gitUserEmail,
      };
      saveGitConfig(newCfg);
      if (gitEnabled && basePath) {
        await gitInit(gitRemote);
      }
    } catch (e) {
      setGitErrorMsg(String(e));
    } finally {
      setGitBusy(false);
    }
  };

  const handleGitSync = async () => {
    setGitBusy(true);
    setGitErrorMsg('');
    try {
      if (gitRemote.trim()) {
        await gitPush();
      } else {
        await gitCommit();
      }
    } catch (e) {
      setGitErrorMsg(String(e));
    } finally {
      setGitBusy(false);
    }
  };

  const handleGitPull = async () => {
    setGitBusy(true);
    setGitErrorMsg('');
    try {
      await gitPull();
    } catch (e) {
      setGitErrorMsg(String(e));
    } finally {
      setGitBusy(false);
    }
  };

  const handleGitFetch = async () => {
    setGitFetchBusy(true);
    setGitErrorMsg('');
    try {
      await gitFetch();
    } catch (e) {
      setGitErrorMsg(String(e));
    } finally {
      setGitFetchBusy(false);
    }
  };

  if (!active) return null;

  const statusIcon = {
    idle:    <Clock size={12} className="text-[var(--text-hint)]" />,
    synced:  <CheckCircle2 size={12} className="text-green-400" />,
    pending: <RefreshCw size={12} className="text-amber-400 animate-spin" />,
    error:   <AlertCircle size={12} className="text-red-400" />,
  }[gitStatus];

  const remoteStatusInfo: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    synced:   { label: t(language, 'extras', 'remoteSynced'),   cls: 'text-green-400',  icon: <CheckCircle2 size={12} className="text-green-400" /> },
    behind:   { label: t(language, 'extras', 'remoteBehind'),   cls: 'text-blue-400',   icon: <ArrowDown size={12} className="text-blue-400" /> },
    ahead:    { label: t(language, 'extras', 'remoteAhead'),    cls: 'text-amber-400',  icon: <Upload size={12} className="text-amber-400" /> },
    diverged: { label: t(language, 'extras', 'remoteDiverged'), cls: 'text-purple-400', icon: <AlertCircle size={12} className="text-purple-400" /> },
    offline:  { label: t(language, 'extras', 'remoteOffline'),  cls: 'text-zinc-400',   icon: <CloudOff size={12} className="text-zinc-400" /> },
    unknown:  { label: t(language, 'extras', 'remoteUnknown'),  cls: 'text-zinc-400',   icon: <Clock size={12} className="text-zinc-400" /> },
  };

  return <>
    {/* Header de sección */}
    <div className="flex items-center gap-2 mb-1">
      <GitCommit size={14} className="text-indigo-400" />
      <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
        {t(language, 'extras', 'gitTitle')}
      </p>
    </div>

    {/* Activar/desactivar */}
    <label className="flex items-center justify-between cursor-pointer rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'extras', 'enableGit')}</p>
        <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'extras', 'gitRequired')}</p>
      </div>
      <ToggleSwitch checked={gitEnabled} onChange={setGitEnabled} size="sm" />
    </label>

    {/* Remote URL */}
    <div>
      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
        {t(language, 'extras', 'remoteUrl')}
      </label>
      <input
        type="text"
        value={gitRemote}
        onChange={(e) => setGitRemote(e.target.value)}
        disabled={!gitEnabled}
        placeholder={t(language, 'extras', 'remotePlaceholder')}
        className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none disabled:opacity-40"
      />
      <p className="mt-1 text-[10px] text-[var(--text-hint)]">
        {t(language, 'extras', 'localOnlyHint')}
      </p>
    </div>

    {/* Identidad Git */}
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
          {t(language, 'extras', 'userName')}
        </label>
        <input
          type="text"
          value={gitUserName}
          onChange={(e) => setGitUserName(e.target.value)}
          disabled={!gitEnabled}
          placeholder={t(language, 'extras', 'userNamePlaceholder')}
          className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none disabled:opacity-40"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
          {t(language, 'extras', 'userEmail')}
        </label>
        <input
          type="email"
          value={gitUserEmail}
          onChange={(e) => setGitUserEmail(e.target.value)}
          disabled={!gitEnabled}
          placeholder={t(language, 'extras', 'userEmailPlaceholder')}
          className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none disabled:opacity-40"
        />
        <p className="mt-1 text-[10px] text-[var(--text-hint)]">
          {t(language, 'extras', 'identityOverrideHint')}
        </p>
      </div>
    </div>

    {/* Opciones automáticas */}
    <div className="space-y-2">
      <label className="flex items-center justify-between cursor-pointer rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
        <div>
          <p className="text-xs text-[var(--text-secondary)]">{t(language, 'extras', 'autoCommitHourly')}</p>
          <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'extras', 'whileOpen')}</p>
        </div>
        <ToggleSwitch
          checked={gitAutoCommit && gitEnabled}
          onChange={setGitAutoCommit}
          disabled={!gitEnabled}
          size="sm"
        />
      </label>
      <label className="flex items-center justify-between cursor-pointer rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
        <div>
          <p className="text-xs text-[var(--text-secondary)]">{t(language, 'extras', 'pushOnSync')}</p>
          <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'extras', 'remoteRequired')}</p>
        </div>
        <ToggleSwitch
          checked={gitAutoPush && gitEnabled && !!gitRemote.trim()}
          onChange={setGitAutoPush}
          disabled={!gitEnabled || !gitRemote.trim()}
          size="sm"
        />
      </label>
    </div>

    {/* Estado último commit + remoto */}
    {gitConfig.enabled && (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2">
          {statusIcon}
          <span className="text-[11px] text-[var(--text-secondary)]">
            {lastCommitTime
              ? `${t(language, 'extras', 'lastCommitPrefix')} ${timeAgo(lastCommitTime, language)}`
              : t(language, 'extras', 'noCommitsYet')}
          </span>
        </div>
        {gitConfig.remote.trim() && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2">
            <div className="flex items-center gap-2">
              {gitFetchBusy
                ? <RefreshCw size={12} className="text-[var(--text-hint)] animate-spin" />
                : remoteStatusInfo[gitRemoteStatus]?.icon}
              <span className={`text-[11px] ${gitFetchBusy ? 'text-[var(--text-hint)]' : (remoteStatusInfo[gitRemoteStatus]?.cls ?? 'text-[var(--text-hint)]')}`}>
                {gitFetchBusy ? t(language, 'extras', 'checkingRemote') : (remoteStatusInfo[gitRemoteStatus]?.label ?? '')}
              </span>
            </div>
            <button
              onClick={handleGitFetch}
              disabled={gitFetchBusy || gitBusy}
              className="rounded-lg p-1 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
              title={t(language, 'extras', 'refreshRemote')}
            >
              <RefreshCw size={11} className={gitFetchBusy ? 'animate-spin' : ''} />
            </button>
          </div>
        )}
      </div>
    )}

    {/* Error */}
    {gitErrorMsg && (
      <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
        <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-400" />
        <p className="flex-1 text-[11px] text-red-400 break-all">{gitErrorMsg}</p>
        <button
          onClick={() => navigator.clipboard.writeText(gitErrorMsg)}
          className="shrink-0 rounded p-0.5 text-red-400/60 transition hover:text-red-400 hover:bg-red-500/20"
          title={t(language, 'extras', 'copyError')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        </button>
      </div>
    )}

    {/* Acciones */}
    <div className="flex gap-2 pt-1">
      <button
        onClick={handleGitSave}
        disabled={gitBusy}
        className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {gitBusy ? t(language, 'extras', 'saving') : t(language, 'extras', 'save')}
      </button>
      {gitConfig.enabled && (
        <button
          onClick={handleGitSync}
          disabled={gitBusy}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60"
          title={gitRemote.trim() ? t(language, 'extras', 'commitPushTitle') : t(language, 'extras', 'commitLocalTitle')}
        >
          {gitRemote.trim() ? <Upload size={13} /> : <RefreshCw size={13} />}
          {gitRemote.trim() ? t(language, 'extras', 'push') : t(language, 'extras', 'commit')}
        </button>
      )}
      {gitConfig.enabled && gitConfig.remote.trim() && (
        <button
          onClick={handleGitPull}
          disabled={gitBusy}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60"
          title={t(language, 'extras', 'pullTitle')}
        >
          <Download size={13} />
          {t(language, 'extras', 'pull')}
        </button>
      )}
    </div>
  </>;
}
