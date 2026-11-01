import type { GitConfig } from '../types/git';

export const GIT_AUTO_INTERVAL_MS = 60 * 60 * 1000;

/** Qué hace Git cada hora según la config guardada: nada, un commit, o un
 *  commit y un push (el push requiere el auto-commit y un remoto). */
export function gitAutoAction(cfg: GitConfig, basePath: string | null): 'none' | 'commit' | 'push' {
  if (!basePath || !cfg.enabled || !cfg.autoCommitHourly) return 'none';
  return cfg.autoPushDaily && cfg.remote.trim() ? 'push' : 'commit';
}
