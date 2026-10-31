import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { GIT_AUTO_INTERVAL_MS, gitAutoAction } from '../lib/gitAutomation';

/** El commit (y el push) automático cada hora, mientras la app está abierta.
 *  Vive en App y no en Opciones → Git: antes el intervalo estaba en esa
 *  pestaña, que se desmonta al cerrar Opciones, así que solo corría con
 *  Opciones abierto, y "Push al sincronizar" se guardaba pero nadie lo usaba. */
export function useGitAutomation() {
  const gitConfig = useAppStore((s) => s.gitConfig);
  const basePath = useAppStore((s) => s.basePath);
  const action = gitAutoAction(gitConfig, basePath);
  const running = useRef(false);

  useEffect(() => {
    if (action === 'none') return;
    const id = setInterval(() => {
      // Una corrida a la vez: un push lento no debe solaparse con la siguiente.
      if (running.current) return;
      running.current = true;
      const { gitCommit, gitPush } = useAppStore.getState();
      // gitPush ya hace el commit antes; si falla (sin red o sin permiso),
      // deja el estado de Git en error y se reintenta en la próxima hora.
      const run = action === 'push' ? gitPush() : gitCommit();
      run.catch(() => {}).finally(() => { running.current = false; });
    }, GIT_AUTO_INTERVAL_MS);
    return () => clearInterval(id);
  }, [action, basePath]);
}
