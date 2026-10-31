// El panel de un entorno en Opciones → Cliente HTTP (Interfaz §4): nombre,
// opciones, variables (con los secretos en el llavero) y hosts de
// confianza. Los valores de los secretos solo cruzan una vez hacia Rust,
// al guardarlos (R10, HT18).
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Copy, Info, KeyRound, Plus, Trash2, X } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import ToggleSwitch from '../../../components/shared/ToggleSwitch';
import { CHIP, FOCUS_RING, ICON_BTN, INPUT_CLS, PANEL_TITLE, SECONDARY_CLS } from '../../../components/shared/controlClasses';
import { Toggle } from '../../../components/shared/FormControls';
import { setExtensionSecret } from '../../secrets';
import {
  EXTENSION_ID, duplicateEnvironment, envNameError, isValidHost, looksSecret, maskOf, newSecretKey, readHttpSettings,
  replaceEnvironment, trustedHosts, varNameError, withVariable, type HttpClientSettings, type HttpEnvironment, type HttpVariable,
} from '../core/environments';
import type { Tr } from '../core/text';

export const NO_AUTOCORRECT = { autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'off', spellCheck: false } as const;
const DANGER_BTN = `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10 ${FOCUS_RING}`;
const TEXT_LINK = `rounded text-[11px] font-medium text-[var(--text-primary)] underline decoration-[var(--border-high)] underline-offset-2 hover:decoration-[var(--text-primary)] ${FOCUS_RING}`;
const HELP = 'pl-9 text-[10px] text-[var(--text-hint)]';
const invalidCls = (bad: boolean) => (bad ? 'border-red-500/60' : '');

export const fresh = (): HttpClientSettings => readHttpSettings(useAppStore.getState().extensions[EXTENSION_ID]?.settings);

/** Un campo que se guarda al salir o con Enter. */
function CommitInput({
  value, onCommit, validate, ariaLabel, placeholder, className = '', type = 'text', autoFocus,
}: {
  value: string;
  onCommit: (v: string) => void;
  /** El error a mostrar, o `null`. Con error no se guarda. */
  validate?: (v: string) => string | null;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  type?: 'text' | 'password';
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const errorId = useRef(`http-field-${Math.random().toString(36).slice(2)}`).current;
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const commit = () => {
    const err = validate?.(text) ?? null;
    setError(err);
    if (!err && text !== value) onCommit(text);
  };
  return (
    <div className="min-w-0">
      <input
        ref={ref}
        type={type}
        value={text}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        {...NO_AUTOCORRECT}
        className={`${INPUT_CLS} w-full ${invalidCls(!!error)} ${className}`}
      />
      {error && <p id={errorId} className="mt-0.5 text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

function SecretValue({ v, tr, onSave }: { v: HttpVariable & { secret: true }; tr: Tr; onSave: (value: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(v.hint === null);
  const [text, setText] = useState('');
  useEffect(() => setEditing(v.hint === null), [v.hint]);
  if (!editing && v.hint !== null) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-[11px]">
        <KeyRound size={12} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
        <span className="truncate font-mono text-[var(--text-secondary)]">{maskOf(v.hint)}</span>
        <button type="button" onClick={() => setEditing(true)} className={TEXT_LINK}>{tr('varSecretChange')}</button>
      </div>
    );
  }
  const save = async () => {
    if (!text) return;
    if (await onSave(text)) setText('');
  };
  return (
    <div className="flex min-w-0 gap-2">
      <input
        type="password"
        value={text}
        aria-label={tr('varValueAria', { name: v.name })}
        placeholder={tr('varSecretPlaceholder')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
        }}
        {...NO_AUTOCORRECT}
        className={`${INPUT_CLS} min-w-0 flex-1 font-mono`}
      />
      <button type="button" onClick={() => void save()} disabled={!text} className={SECONDARY_CLS}>{tr('varSecretSave')}</button>
    </div>
  );
}

export function EnvironmentPanel({ env, tr, onDelete, onDeleteVar, onUnsecret }: {
  env: HttpEnvironment;
  tr: Tr;
  onDelete: () => void;
  onDeleteVar: (index: number) => void;
  onUnsecret: (index: number) => void;
}) {
  const { update, showToast } = useAppStore(useShallow((s) => ({ update: s.updateExtensionSettings, showToast: s.showToast })));
  const [draft, setDraft] = useState<{ name: string; value: string } | null>(null);
  const [focusVar, setFocusVar] = useState<number | 'draft' | null>(null);
  const [host, setHost] = useState('');
  const [hostError, setHostError] = useState(false);

  const saveEnv = (next: HttpEnvironment) => update(EXTENSION_ID, { environments: replaceEnvironment(fresh().environments, next) });
  const current = () => fresh().environments.find((e) => e.id === env.id) ?? env;
  const keychainError = () => showToast({ kind: 'error', title: tr('keychainSaveError') });

  const setVar = (index: number, v: HttpVariable) => void saveEnv(withVariable(current(), index, v));

  const saveSecret = async (index: number, value: string): Promise<boolean> => {
    const v = current().vars[index];
    if (!v?.secret) return false;
    try {
      const hint = await setExtensionSecret(EXTENSION_ID, v.key, value);
      setVar(index, { ...v, hint });
      showToast({ kind: 'success', title: tr('varSecretSaved', { hint: maskOf(hint) }) });
      return true;
    } catch {
      keychainError();
      return false;
    }
  };

  // A6: pasar a secreta escribe el valor en el llavero y lo quita de los
  // ajustes, en ese orden. Si el llavero falla, no cambia nada.
  const makeSecret = async (index: number) => {
    const v = current().vars[index];
    if (!v || v.secret) return;
    const key = newSecretKey(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
    try {
      const hint = v.value ? await setExtensionSecret(EXTENSION_ID, key, v.value) : null;
      setVar(index, { name: v.name, secret: true, key, hint });
    } catch {
      keychainError();
    }
  };

  const commitDraft = (name: string, value: string) => {
    if (varNameError(current(), name, null)) return;
    void saveEnv({ ...current(), vars: [...current().vars, { name, secret: false, value }] });
    setDraft(null);
    setFocusVar(null);
  };

  const addHost = () => {
    const h = host.trim().toLowerCase();
    if (!isValidHost(h)) {
      setHostError(true);
      return;
    }
    const e = current();
    if (!e.extraHosts.includes(h)) void saveEnv({ ...e, extraHosts: [...e.extraHosts, h] });
    setHost('');
    setHostError(false);
  };

  const autoHosts = trustedHosts(env).filter((h) => h.from !== null);
  const nameErr = (name: string, self: number | null) => {
    const err = varNameError(current(), name, self);
    return err === 'invalid' ? tr('varNameInvalid') : err === 'duplicate' ? tr('varNameDuplicate', { name }) : null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-1.5 text-[var(--text-secondary)]" aria-hidden>{tr('envName')}</span>
        <div className="min-w-[10rem] flex-1">
          <CommitInput
            key={env.id}
            value={env.name}
            ariaLabel={tr('envName')}
            validate={(v) => {
              const err = envNameError(fresh().environments, v, env.id);
              return err === 'empty' ? tr('envNameEmpty') : err === 'duplicate' ? tr('envNameDuplicate') : null;
            }}
            onCommit={(name) => void saveEnv({ ...current(), name: name.trim() })}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const all = fresh().environments;
            let n = 2;
            while (all.some((e) => e.name.toLowerCase() === `${env.name} ${n}`.toLowerCase())) n += 1;
            const copy = duplicateEnvironment(current(), `${env.name} ${n}`);
            void update(EXTENSION_ID, { environments: [...all, copy] });
            showToast({ kind: 'success', title: tr('envDuplicated'), description: tr('envDuplicatedNote') });
          }}
          className={SECONDARY_CLS}
        >
          <Copy size={13} aria-hidden />
          {tr('envDuplicate')}
        </button>
        <button type="button" onClick={onDelete} className={DANGER_BTN}>
          <Trash2 size={13} aria-hidden />
          {tr('envDelete')}
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <Toggle label={tr('envProtectedToggle')} checked={env.protected} onChange={(v) => void saveEnv({ ...current(), protected: v })} />
          <p className={HELP}>{tr('envProtectedHelp')}</p>
        </div>
        <div>
          <Toggle label={tr('envInsecureToggle')} checked={env.insecureTls} onChange={(v) => void saveEnv({ ...current(), insecureTls: v })} />
          <p className={HELP}>{tr('envInsecureHelp')}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className={PANEL_TITLE}>{tr('varsTitle')}</p>
        {env.vars.length === 0 && !draft && <p className="text-[11px] text-[var(--text-hint)]">{tr('varsEmpty')}</p>}
        {(env.vars.length > 0 || draft) && (
          <div className="grid grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)_auto_auto] items-start gap-x-2 gap-y-1.5">
            <span className={PANEL_TITLE}>{tr('varColName')}</span>
            <span className={PANEL_TITLE}>{tr('varColValue')}</span>
            <span className={PANEL_TITLE}>{tr('varColSecret')}</span>
            <span />
            {env.vars.map((v, i) => (
              <VariableRow
                key={`${env.id}-${v.secret ? v.key : `n${i}`}`}
                v={v}
                index={i}
                tr={tr}
                autoFocus={focusVar === i}
                nameError={(name) => nameErr(name, i)}
                onName={(name) => setVar(i, { ...current().vars[i], name })}
                onValue={(value) => {
                  const cur = current().vars[i];
                  if (cur && !cur.secret) setVar(i, { ...cur, value });
                }}
                onSaveSecret={(value) => saveSecret(i, value)}
                onToggleSecret={(on) => (on ? void makeSecret(i) : onUnsecret(i))}
                onDelete={() => onDeleteVar(i)}
              />
            ))}
            {draft && (
              <>
                <CommitInput
                  value={draft.name}
                  ariaLabel={tr('varNameAria', { n: env.vars.length + 1 })}
                  autoFocus={focusVar === 'draft'}
                  validate={(name) => (name ? nameErr(name, null) : null)}
                  onCommit={(name) => {
                    setDraft({ ...draft, name });
                    if (name) commitDraft(name, draft.value);
                  }}
                  className="font-mono"
                />
                <CommitInput
                  value={draft.value}
                  ariaLabel={tr('varValueAria', { name: draft.name || String(env.vars.length + 1) })}
                  onCommit={(value) => {
                    setDraft({ ...draft, value });
                    if (draft.name) commitDraft(draft.name, value);
                  }}
                  className="font-mono"
                />
                <span />
                <button
                  type="button"
                  aria-label={tr('varDeleteAria', { name: draft.name || String(env.vars.length + 1) })}
                  title={tr('varDeleteAria', { name: draft.name || String(env.vars.length + 1) })}
                  onClick={() => setDraft(null)}
                  className={`${ICON_BTN} min-h-7 min-w-7 justify-center hover:text-red-400`}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (!draft) setDraft({ name: '', value: '' });
            setFocusVar('draft');
          }}
          className={SECONDARY_CLS}
        >
          <Plus size={13} aria-hidden />
          {tr('varAdd')}
        </button>
      </div>

      <div className="space-y-2">
        <p className={PANEL_TITLE}>{tr('hostsTitle')}</p>
        <p className="text-[11px] text-[var(--text-hint)]">{tr('hostsHelp')}</p>
        {autoHosts.length > 0 && (
          <ul className="space-y-0.5">
            {autoHosts.map((h) => (
              <li key={h.host} className="font-mono text-[11px] text-[var(--text-secondary)]">
                {h.host} <span className="font-sans text-[var(--text-hint)]">{tr('hostFrom', { var: h.from ?? '' })}</span>
              </li>
            ))}
          </ul>
        )}
        {env.extraHosts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {env.extraHosts.map((h) => (
              <span key={h} className={`${CHIP} inline-flex items-center gap-1 font-mono`}>
                {h}
                <button
                  type="button"
                  aria-label={tr('hostRemoveAria', { host: h })}
                  onClick={() => void saveEnv({ ...current(), extraHosts: current().extraHosts.filter((x) => x !== h) })}
                  className={`rounded-full p-0.5 hover:bg-[var(--bg-surface)] ${FOCUS_RING}`}
                >
                  <X size={10} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-[12rem]">
            <input
              value={host}
              aria-label={tr('hostAddAria')}
              aria-invalid={hostError || undefined}
              placeholder={tr('hostPlaceholder')}
              onChange={(e) => {
                setHost(e.target.value);
                setHostError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addHost();
              }}
              {...NO_AUTOCORRECT}
              className={`${INPUT_CLS} w-full font-mono ${invalidCls(hostError)}`}
            />
            {hostError && <p className="mt-0.5 text-[10px] text-red-400">{tr('hostInvalid')}</p>}
          </div>
          <button type="button" onClick={addHost} disabled={!host.trim()} className={SECONDARY_CLS}>{tr('hostAdd')}</button>
        </div>
      </div>
    </div>
  );
}

function VariableRow({
  v, index, tr, autoFocus, nameError, onName, onValue, onSaveSecret, onToggleSecret, onDelete,
}: {
  v: HttpVariable;
  index: number;
  tr: Tr;
  autoFocus: boolean;
  nameError: (name: string) => string | null;
  onName: (name: string) => void;
  onValue: (value: string) => void;
  onSaveSecret: (value: string) => Promise<boolean>;
  onToggleSecret: (on: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <CommitInput value={v.name} ariaLabel={tr('varNameAria', { n: index + 1 })} validate={nameError} onCommit={onName} className="font-mono" autoFocus={autoFocus} />
      <div className="min-w-0">
        {v.secret
          ? <SecretValue v={v} tr={tr} onSave={onSaveSecret} />
          : <CommitInput value={v.value} ariaLabel={tr('varValueAria', { name: v.name })} onCommit={onValue} className="font-mono" />}
        {!v.secret && looksSecret(v.name) && (
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--text-hint)]">
            <Info size={10} aria-hidden />
            {tr('varLooksSecret')}
          </p>
        )}
      </div>
      {/* Un <label> le da el nombre al interruptor (es un botón). */}
      <label className="flex h-[30px] cursor-pointer items-center justify-center">
        <ToggleSwitch size="sm" checked={v.secret} onChange={onToggleSecret} />
        <span className="sr-only">{tr('varSecretAria', { name: v.name })}</span>
      </label>
      <button
        type="button"
        aria-label={tr('varDeleteAria', { name: v.name })}
        title={tr('varDeleteAria', { name: v.name })}
        onClick={onDelete}
        className={`${ICON_BTN} min-h-7 min-w-7 justify-center hover:text-red-400`}
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </>
  );
}

