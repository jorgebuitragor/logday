import { useEffect, useRef, useState } from 'react';
import { X, GitCommit, RefreshCw, CheckCircle2, AlertCircle, Clock, Upload, Download, CloudOff, ArrowDown } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { GitConfig } from '../types';

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
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
    basePath,
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
    synced:   { label: 'Sincronizado con el remoto',        cls: 'text-green-400',  icon: <CheckCircle2 size={12} className="text-green-400" /> },
    behind:   { label: 'Hay cambios por bajar (Pull)',      cls: 'text-blue-400',   icon: <ArrowDown size={12} className="text-blue-400" /> },
    ahead:    { label: 'Tienes cambios sin subir (Push)',   cls: 'text-amber-400',  icon: <Upload size={12} className="text-amber-400" /> },
    diverged: { label: 'Divergencia local/remoto',          cls: 'text-purple-400', icon: <AlertCircle size={12} className="text-purple-400" /> },
    offline:  { label: 'Sin conexión al remoto',            cls: 'text-zinc-400',   icon: <CloudOff size={12} className="text-zinc-400" /> },
    unknown:  { label: 'Estado remoto desconocido',         cls: 'text-zinc-400',   icon: <Clock size={12} className="text-zinc-400" /> },
  };

  const toggleCls = (on: boolean) =>
    `relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ${
      on ? 'bg-indigo-500' : 'bg-[var(--border)]'
    }`;

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
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Git</h2>
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
              <p className="text-sm text-[var(--text-primary)]">Activar Git</p>
              <p className="text-[10px] text-[var(--text-hint)]">Requiere git instalado en el sistema</p>
            </div>
            <button
              onClick={() => setEnabled((v) => !v)}
              className={toggleCls(enabled)}
              role="switch"
              aria-checked={enabled}
            >
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </button>
          </label>

          {/* Remote URL */}
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
              Remote URL (opcional)
            </label>
            <input
              type="text"
              value={remote}
              onChange={(e) => setRemote(e.target.value)}
              disabled={!enabled}
              placeholder="https://github.com/usuario/repo.git"
              className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none disabled:opacity-40"
            />
            <p className="mt-1 text-[10px] text-[var(--text-hint)]">
              Deja vacío para solo commits locales
            </p>
          </div>

          {/* Identidad Git */}
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
                Nombre de usuario (opcional)
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={!enabled}
                placeholder="Tu Nombre"
                className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none disabled:opacity-40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
                Email (opcional)
              </label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                disabled={!enabled}
                placeholder="tu@email.com"
                className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none disabled:opacity-40"
              />
              <p className="mt-1 text-[10px] text-[var(--text-hint)]">
                Sobreescribe la identidad global de Git solo para este repo
              </p>
            </div>
          </div>

          {/* Opciones automáticas */}
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">Auto-commit cada hora</p>
                <p className="text-[10px] text-[var(--text-hint)]">Mientras la app esté abierta</p>
              </div>
              <button
                onClick={() => setAutoCommit((v) => !v)}
                disabled={!enabled}
                className={toggleCls(autoCommit && enabled)}
                role="switch"
                aria-checked={autoCommit}
              >
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${autoCommit && enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">Push al sincronizar</p>
                <p className="text-[10px] text-[var(--text-hint)]">Requiere remote configurado</p>
              </div>
              <button
                onClick={() => setAutoPush((v) => !v)}
                disabled={!enabled || !remote.trim()}
                className={toggleCls(autoPush && enabled && !!remote.trim())}
                role="switch"
                aria-checked={autoPush}
              >
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${autoPush && enabled && !!remote.trim() ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
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
                    ? `Último commit ${timeAgo(lastCommitTime)}`
                    : 'Sin commits aún'}
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
                      {fetchBusy ? 'Comprobando remoto…' : (remoteStatusInfo[gitRemoteStatus]?.label ?? '')}
                    </span>
                  </div>
                  <button
                    onClick={handleFetch}
                    disabled={fetchBusy || busy}
                    className="rounded-lg p-1 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                    title="Actualizar estado remoto"
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
              <p className="text-[11px] text-red-400 break-all">{errorMsg}</p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={busy}
              className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
            {gitConfig.enabled && (
              <button
                onClick={handleSync}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60"
                title={remote.trim() ? 'Commit + Push' : 'Commit local'}
              >
                {remote.trim() ? <Upload size={13} /> : <RefreshCw size={13} />}
                {remote.trim() ? 'Push' : 'Commit'}
              </button>
            )}
            {gitConfig.enabled && gitConfig.remote.trim() && (
              <button
                onClick={handlePull}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60"
                title="Commit local + Pull desde remoto"
              >
                <Download size={13} />
                Pull
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
