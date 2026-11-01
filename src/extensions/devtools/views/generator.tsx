// Lo común de los generadores (design §4 "Generadores"): no tienen entrada,
// generan al abrirse por primera vez (nunca están vacíos) y "Generar"
// responde a ⌘↵. Lo generado vive en la memoria del módulo, como lo pegado.
import { useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ToolId } from '../model';
import { useDevtools } from '../ui/context';
import { useDraft } from '../ui/hooks';
import { SECONDARY_CLS } from '../ui/classes';

/** El último resultado de `make`, y cómo regenerarlo. `key` resume las
 *  opciones que cambian el resultado: si cambia, se genera otro. */
export function useGenerated(tool: ToolId, make: () => string | null, key: string) {
  const { tr, announce } = useDevtools();
  const [value, setValue] = useDraft(tool, 'output');
  const [lastKey, setLastKey] = useDraft(tool, 'outputKey');
  const generate = useCallback(
    (silent = false) => {
      setValue(make() ?? '');
      setLastKey(key);
      if (!silent) announce(tr('generated'));
    },
    [make, key, setValue, setLastKey, announce, tr],
  );
  useEffect(() => {
    if (!value || lastKey !== key) generate(true);
    // Solo al abrir y cuando cambian las opciones (`key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, generate] as const;
}

export function GenerateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { tr, shortcut } = useDevtools();
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={`${tr('generate')} (${shortcut('mod+enter')})`} className={SECONDARY_CLS}>
      <RefreshCw size={13} aria-hidden />
      {tr('generate')}
    </button>
  );
}
