import { useEffect, useRef, useState } from 'react';
import { X, GitCommit, RefreshCw, CheckCircle2, AlertCircle, Clock, Upload, Download, CloudOff, ArrowDown } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
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

export function GitModal() {
  const {
    isGitOpen, toggleGit,
    gitConfig, saveGitConfig,
    gitStatus, gitRemoteStatus, lastCommitTime,
    gitInit, gitCommit, gitPush, gitPull, gitFetch,
    basePath, language,
  } = useAppStore(
    useShallow((s) => ({
      isGitOpen: s.isGitOpen,
      toggleGit: s.toggleGit,
      gitConfig: s.gitConfig,
      saveGitConfig: s.saveGitConfig,
      gitStatus: s.gitStatus,
      gitRemoteStatus: s.gitRemoteStatus,
      lastCommitTime: s.lastCommitTime,
      gitInit: s.gitInit,
      gitCommit: s.gitCommit,
      gitPush: s.gitPush,
      gitPull: s.gitPull,
      gitFetch: s.gitFetch,
      basePath: s.basePath,
      language: s.language,
    }))
  );

  const [remote, setRemote] = useState(gitConfig.remote);
  const [autoCommit, setAutoCommit] = useState(gitConfig.autoCommitHourly);
  const [autoPush, setAutoPush] = useState(gitConfig.autoPushDaily);
  const [enabled, setEnabled] = useState(gitConfig.enabled);
  const [userName, setUserName] = useState(gitConfig.userName ?? '');
  const [userEmail, setUserEmail] = useState(gitConfig.userEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [fetchBusy, setFetchBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCommitRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Actualizar "hace X min" cada 30 s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  void now; // usado implícitamente al re-renderizar

  // Auto-commit horario mientras la app está abierta
  useEffect(() => {
    if (autoCommitRef.current) clearInterval(autoCommitRef.current);
    if (enabled && autoCommit && basePath) {
      autoCommitRef.current = setInterval(() => {
        gitCommit().catch(() => {});
      }, 60 * 60 * 1000);
    }
    return () => {
      if (autoCommitRef.current) clearInterval(autoCommitRef.current);
    };
  }, [enabled, autoCommit, basePath, gitCommit]);

  // Cerrar con Escape
  useEffect(() => {
    if (!isGitOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') toggleGit(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isGitOpen, toggleGit]);

  // Sincronizar estado local con store cuando se abre
  useEffect(() => {
    if (isGitOpen) {
      setRemote(gitConfig.remote);
      setAutoCommit(gitConfig.autoCommitHourly);
      setAutoPush(gitConfig.autoPushDaily);
      setEnabled(gitConfig.enabled);
      setUserName(gitConfig.userName ?? '');
      setUserEmail(gitConfig.userEmail ?? '');
      setErrorMsg('');
      // Fetch al abrir si hay remote
      if (gitConfig.enabled && gitConfig.remote.trim()) {
        setFetchBusy(true);
        gitFetch().catch(() => {}).finally(() => setFetchBusy(false));
      }
    }
  }, [isGitOpen, gitConfig]);

  // Fetch periódico cada 30 min mientras el modal está cerrado
  useEffect(() => {
    if (!gitConfig.enabled || !gitConfig.remote.trim()) return;
    const t = setInterval(() => {
      gitFetch().catch(() => {});
    }, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [gitConfig.enabled, gitConfig.remote, gitFetch]);

  void intervalRef;

  if (!isGitOpen) return null;

  const handleSave = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      const newCfg: GitConfig = {
        enabled,
        remote,
        autoCommitHourly: autoCommit,
        autoPushDaily: autoPush,
        userName,
        userEmail,
      };
      saveGitConfig(newCfg);
      if (enabled && basePath) {
        await gitInit(remote);
      }
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      if (remote.trim()) {
        await gitPush();
      } else {
        await gitCommit();
      }
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      await gitPull();
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleFetch = async () => {
    setFetchBusy(true);
    setErrorMsg('');
    try {
      await gitFetch();
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setFetchBusy(false);
    }
  };

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={toggleGit}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <GitCommit size={15} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t(language, 'extras', 'gitTitle')}</h2>
          </div>
          <button
            onClick={toggleGit}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Activar/desactivar */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm text-[var(--text-primary)]">{t(language, 'extras', 'enableGit')}</p>
              <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'extras', 'gitRequired')}</p>
            </div>
            <ToggleSwitch checked={enabled} onChange={setEnabled} size="sm" />
          </label>

          {/* Remote URL */}
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'extras', 'remoteUrl')}
            </label>
            <input
              type="text"
              value={remote}
              onChange={(e) => setRemote(e.target.value)}
              disabled={!enabled}
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
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={!enabled}
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
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                disabled={!enabled}
                placeholder={t(language, 'extras', 'userEmailPlaceholder')}
                className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none disabled:opacity-40"
              />
              <p className="mt-1 text-[10px] text-[var(--text-hint)]">
                {t(language, 'extras', 'identityOverrideHint')}
              </p>
            </div>
          </div>

          {/* Opciones automáticas */}
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t(language, 'extras', 'autoCommitHourly')}</p>
                <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'extras', 'whileOpen')}</p>
              </div>
              <ToggleSwitch
                checked={autoCommit && enabled}
                onChange={setAutoCommit}
                disabled={!enabled}
                size="sm"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t(language, 'extras', 'pushOnSync')}</p>
                <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'extras', 'remoteRequired')}</p>
              </div>
              <ToggleSwitch
                checked={autoPush && enabled && !!remote.trim()}
                onChange={setAutoPush}
                disabled={!enabled || !remote.trim()}
                size="sm"
              />
            </label>
          </div>

          {/* Estado último commit + remoto */}
          {gitConfig.enabled && (
            <div className="space-y-2">
              {/* Último commit local */}
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2">
                {statusIcon}
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {lastCommitTime
                    ? `${t(language, 'extras', 'lastCommitPrefix')} ${timeAgo(lastCommitTime, language)}`
                    : t(language, 'extras', 'noCommitsYet')}
                </span>
              </div>
              {/* Estado remoto */}
              {gitConfig.remote.trim() && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    {fetchBusy
                      ? <RefreshCw size={12} className="text-[var(--text-hint)] animate-spin" />
                      : remoteStatusInfo[gitRemoteStatus]?.icon}
                    <span className={`text-[11px] ${fetchBusy ? 'text-[var(--text-hint)]' : (remoteStatusInfo[gitRemoteStatus]?.cls ?? 'text-[var(--text-hint)]')}`}>
                      {fetchBusy ? t(language, 'extras', 'checkingRemote') : (remoteStatusInfo[gitRemoteStatus]?.label ?? '')}
                    </span>
                  </div>
                  <button
                    onClick={handleFetch}
                    disabled={fetchBusy || busy}
                    className="rounded-lg p-1 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                    title={t(language, 'extras', 'refreshRemote')}
                  >
                    <RefreshCw size={11} className={fetchBusy ? 'animate-spin' : ''} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-400" />
              <p className="flex-1 text-[11px] text-red-400 break-all">{errorMsg}</p>
              <button
                onClick={() => navigator.clipboard.writeText(errorMsg)}
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
              onClick={handleSave}
              disabled={busy}
              className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? t(language, 'extras', 'saving') : t(language, 'extras', 'save')}
            </button>
            {gitConfig.enabled && (
              <button
                onClick={handleSync}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60"
                title={remote.trim() ? t(language, 'extras', 'commitPushTitle') : t(language, 'extras', 'commitLocalTitle')}
              >
                {remote.trim() ? <Upload size={13} /> : <RefreshCw size={13} />}
                {remote.trim() ? t(language, 'extras', 'push') : t(language, 'extras', 'commit')}
              </button>
            )}
            {gitConfig.enabled && gitConfig.remote.trim() && (
              <button
                onClick={handlePull}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60"
                title={t(language, 'extras', 'pullTitle')}
              >
                <Download size={13} />
                {t(language, 'extras', 'pull')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
