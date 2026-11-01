// Hooks comunes de las herramientas: lo pegado (en memoria, D9), las
// opciones recordadas, el procesado en vivo con su tope (D8) y los atajos.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { MAX_INPUT_CHARS, MAX_LIVE_CHARS, draftKey, getDraft, setDraft, type ToolId } from '../model';
import { useDevtools, type FocusTarget, type OptionValue, type ToolActions } from './context';

export const LIVE_DEBOUNCE_MS = 150;

/** Un campo de la herramienta, guardado en la memoria del módulo (nunca en
 *  disco). Si se pega más de `MAX_INPUT_CHARS`, se corta y `cut` lo dice. */
export function useDraft(tool: ToolId, field = 'input') {
  const key = draftKey(tool, field);
  const { clearLoaded } = useDevtools();
  const [value, setValue] = useState(() => getDraft(key));
  const [cut, setCut] = useState(false);
  const set = useCallback(
    (next: string) => {
      const over = next.length > MAX_INPUT_CHARS;
      const v = over ? next.slice(0, MAX_INPUT_CHARS) : next;
      setDraft(key, v);
      setValue(v);
      setCut(over);
      clearLoaded();
    },
    [key, clearLoaded],
  );
  return [value, set, cut] as const;
}

/** Las opciones recordadas de una herramienta (`extensions.devtools.settings`).
 *  Un valor guardado que no sea del tipo del valor por defecto, o que no
 *  esté entre los permitidos, se ignora. */
export function useToolOptions<T extends Record<string, OptionValue>>(
  tool: ToolId,
  defaults: T,
  allowed: Partial<Record<keyof T, readonly OptionValue[]>> = {},
): [T, (patch: Partial<T>) => void] {
  const { settings, setOptions } = useDevtools();
  const stored = settings.options[tool];
  const value = useMemo(() => {
    const out: Record<string, OptionValue> = { ...defaults };
    for (const k of Object.keys(defaults)) {
      const v = stored?.[k];
      if (v === undefined || typeof v !== typeof defaults[k]) continue;
      const list = allowed[k as keyof T];
      if (list && !list.includes(v)) continue;
      out[k] = v;
    }
    return out as T;
    // `defaults` y `allowed` son constantes de cada herramienta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);
  const set = useCallback((patch: Partial<T>) => setOptions(tool, patch as Record<string, OptionValue>), [tool, setOptions]);
  return [value, set];
}

export interface Computed<R> {
  /** `null` con la entrada vacía, o grande y todavía sin procesar. */
  result: R | null;
  /** El último resultado sin error, para mostrarlo atenuado (design §5). */
  lastOk: R | null;
  /** Por encima de `MAX_LIVE_CHARS`: se procesa con el botón o ⌘↵ (D8). */
  manual: boolean;
  /** La entrada cambió y el resultado todavía es de la anterior. */
  stale: boolean;
  run: () => void;
}

/** Procesa `input` mientras se escribe (con debounce) y guarda el último
 *  resultado válido. `depsKey` resume las opciones: si cambia, se rehace. */
export function useComputed<R extends { ok: boolean }>(
  input: string,
  compute: (input: string) => R,
  depsKey: string,
  size = input.length,
): Computed<R> {
  const manual = size > MAX_LIVE_CHARS;
  const computeRef = useRef(compute);
  computeRef.current = compute;
  const make = (text: string) => (text.trim() ? computeRef.current(text) : null);
  const [state, setState] = useState<{ result: R | null; lastOk: R | null; key: string }>(() => {
    const result = manual ? null : make(input);
    return { result, lastOk: result?.ok ? result : null, key: `${depsKey}\u0000${input}` };
  });
  const apply = useCallback((text: string, key: string) => {
    const result = text.trim() ? computeRef.current(text) : null;
    setState((prev) => ({ result, lastOk: result?.ok ? result : result === null ? null : prev.lastOk, key }));
  }, []);
  const key = `${depsKey}\u0000${input}`;
  useEffect(() => {
    if (manual || state.key === key) return;
    const id = setTimeout(() => apply(input, key), LIVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [manual, key, input, apply, state.key]);
  const run = useCallback(() => apply(input, key), [apply, input, key]);
  return { result: state.result, lastOk: state.lastOk, manual, stale: state.key !== key, run };
}

/** Un valor que se actualiza `ms` después del último cambio. */
export function useDebounced<T>(value: T, ms = LIVE_DEBOUNCE_MS): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Publica las acciones de la herramienta para los atajos de la vista. */
export function useToolActions(actions: ToolActions) {
  const { actionsRef } = useDevtools();
  useEffect(() => {
    actionsRef.current = actions;
  });
  useEffect(() => () => {
    actionsRef.current = {};
  }, [actionsRef]);
}

/** Enfoca `ref` al abrir la herramienta si se pidió (Enter en el buscador,
 *  "Traer de una nota"). */
export function useFocusOnOpen(ref: RefObject<HTMLElement | null>, target: FocusTarget = 'input') {
  const { takeFocus } = useDevtools();
  useEffect(() => {
    if (takeFocus(target)) ref.current?.focus();
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** El error, por la región `aria-live`, cuando lleva 500 ms sin cambiar:
 *  con `role="alert"` sonaría en cada tecla (design §8). */
export function useAnnounceError(message: string | null) {
  const { announce } = useDevtools();
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => announce(message), 500);
    return () => clearTimeout(id);
  }, [message, announce]);
}

/** `true` durante 1,5 s después de `trigger()` (el estado "Copiado"). */
export function useFlash(ms = 1500): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const trigger = useCallback(() => {
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);
  return [on, trigger];
}
