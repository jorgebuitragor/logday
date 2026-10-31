// La pestaña Auth de la pantalla (specs/cliente-http HT43, design §14.4):
// Ninguna, Bearer, Basic, API key (en una cabecera o en la query) y Otra.
// Lo elegido se escribe como una cabecera o un parámetro normal del texto
// (`setAuth`), nunca como una directiva aparte. Los valores deberían ser
// `{{variables}}`: un literal se puede pasar al llavero con "Guardar como
// secreto", que crea la variable secreta y pone `{{nombre}}` en su lugar,
// así el valor no llega nunca a la nota.
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { ChevronDown, KeyRound } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { INPUT_CLS, PANEL_TITLE, SECONDARY_CLS, SEND_BTN } from '../../../components/shared/controlClasses';
import { StatusItem } from '../../../components/shared/FormControls';
import { setExtensionSecret } from '../../secrets';
import { announce } from '../announce';
import {
  defaultEnvName, EXTENSION_ID, maskOf, newEnvironment, newSecretKey, readHttpSettings, replaceEnvironment, VAR_NAME_RE, withVariable,
  type HttpEnvironment,
} from '../core/environments';
import type { ParsedRequest } from '../core/parse';
import { isLiteral, readAuth, setAuth, type AuthContext, type AuthInput, type AuthKind, type AuthState } from '../core/requestEdit';
import type { Tr } from '../core/text';
import { LiveInput } from './KeyValueTable';
import { FIELD_BTN, Menu } from './Menu';
import { TEXT_LINK } from './SendStatus';

const KINDS: AuthKind[] = ['none', 'bearer', 'basic', 'apikey', 'other'];
const KIND_KEY = { none: 'authNone', bearer: 'authBearer', basic: 'authBasic', apikey: 'authApiKey', other: 'authOther' } as const;

export const authKindLabel = (tr: Tr, kind: AuthKind) => tr(KIND_KEY[kind]);

const ONLY_VAR_RE = /^\{\{\s*([A-Za-z_$][A-Za-z0-9_.-]*)\s*\}\}$/;
const OPEN_VAR_RE = /\{\{\s*([A-Za-z0-9_.-]*)$/;

const SEG = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
    active ? 'bg-indigo-500/10 text-[var(--text-primary)] ring-1 ring-indigo-500/40' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
  }`;

/** Guarda `value` como variable secreta `name` en el entorno `envId` (o en
 *  uno nuevo, si no hay entornos). El valor pasa de la memoria al llavero;
 *  en los ajustes queda solo la clave y la pista (HT18). Si la variable ya
 *  existe, pasa a ser secreta con este valor. */
export async function saveAsSecret(tr: Tr, envId: string | null, name: string, value: string): Promise<HttpEnvironment | null> {
  const app = useAppStore.getState();
  const settings = readHttpSettings(app.extensions[EXTENSION_ID]?.settings);
  const known = settings.environments.find((e) => e.id === envId) ?? null;
  // Sin entornos, se crea uno (Interfaz §14.4).
  const env = known ?? newEnvironment(defaultEnvName(settings.environments, (n) => tr('envDefaultName', { n })));
  const index = env.vars.findIndex((v) => v.name === name);
  const existing = index >= 0 ? env.vars[index] : null;
  const key = existing?.secret ? existing.key : newSecretKey(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
  let hint: string;
  try {
    hint = await setExtensionSecret(EXTENSION_ID, key, value);
  } catch {
    app.showToast({ kind: 'error', title: tr('keychainSaveError') });
    return null;
  }
  const variable = { name, secret: true as const, key, hint };
  const next = index >= 0 ? withVariable(env, index, variable) : { ...env, vars: [...env.vars, variable] };
  const environments = known ? replaceEnvironment(settings.environments, next) : [...settings.environments, next];
  await app.updateExtensionSettings(EXTENSION_ID, { environments, activeEnvId: settings.activeEnvId ?? next.id });
  return next;
}

/** El estado de lo escrito en un campo: un secreto con su pista, una
 *  variable que falta, una normal, o un literal que quedaría en la nota. */
function VarStatus({ tr, value, env }: { tr: Tr; value: string; env: HttpEnvironment | null }) {
  const m = ONLY_VAR_RE.exec(value.trim());
  if (!m) return null;
  if (!env) return <StatusItem kind="warn">{tr('varMissingNoEnvShort')}</StatusItem>;
  const v = env.vars.find((x) => x.name === m[1]);
  if (!v) return <StatusItem kind="warn">{tr('varMissingIn', { env: env.name })}</StatusItem>;
  if (!v.secret) return <span className="text-[10px] text-[var(--text-hint)]">{tr('varPlain')}</span>;
  return (
    <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
      <KeyRound size={11} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
      {v.hint ? tr('varSecretOf', { env: env.name, hint: maskOf(v.hint) }) : tr('varSecretEmptyOf', { env: env.name })}
    </span>
  );
}

/** Un campo de texto libre que sugiere las variables del entorno activo,
 *  primero las secretas (patrón combobox con `aria-activedescendant`).
 *  Escribir `{{` abre la lista; ↓ también. */
export function VariableCombobox({
  tr, label, value, onValue, env, placeholder,
}: {
  tr: Tr;
  label: string;
  value: string;
  onValue: (value: string) => void;
  env: HttpEnvironment | null;
  placeholder?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const listId = `http-vars-${uid}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value;
  const partial = OPEN_VAR_RE.exec(shown);
  const options = useMemo(() => {
    const vars = [...(env?.vars ?? [])].sort((a, b) => Number(b.secret) - Number(a.secret) || a.name.localeCompare(b.name));
    const q = (partial?.[1] ?? '').toLowerCase();
    return vars.filter((v) => v.name.toLowerCase().includes(q));
  }, [env, partial]);
  const expanded = open && options.length > 0;

  const pick = (name: string) => {
    const next = partial ? `${shown.slice(0, partial.index)}{{${name}}}` : `{{${name}}}`;
    setText(next);
    onValue(next);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
      } else setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp' && expanded) {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && expanded) {
      e.preventDefault();
      e.stopPropagation();
      pick(options[Math.min(active, options.length - 1)].name);
    } else if (e.key === 'Escape' && expanded) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <LiveInput
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${listId}-${Math.min(active, options.length - 1)}` : undefined}
        value={value}
        placeholder={placeholder}
        onValue={(v) => {
          setText(v);
          onValue(v);
          if (OPEN_VAR_RE.test(v)) {
            setOpen(true);
            setActive(0);
          }
        }}
        onFocus={() => setText(null)}
        onBlur={() => {
          setOpen(false);
          setText(null);
        }}
        onKeyDown={onKeyDown}
        className={`${INPUT_CLS} w-full font-mono`}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={tr('comboList', { env: env?.name ?? tr('envNone') })}
        hidden={!expanded}
        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] p-1 shadow-lg"
      >
        {options.map((v, i) => (
          <li
            key={v.name}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            // Sin perder el foco del campo al hacer clic.
            onMouseDown={(e) => {
              e.preventDefault();
              pick(v.name);
            }}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] ${
              i === active ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            {v.secret && <KeyRound size={11} className="shrink-0 text-[var(--text-hint)]" aria-hidden />}
            {`{{${v.name}}}`}
            {v.secret && <span className="sr-only">{tr('comboSecret')}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Guardar como secreto", en línea: el nombre, el entorno y guardar. */
function SaveSecret({
  tr, value, suggested, onSaved,
}: {
  tr: Tr;
  value: string;
  suggested: string;
  onSaved: (name: string) => void;
}) {
  const raw = useAppStore((s) => s.extensions[EXTENSION_ID]?.settings);
  const settings = readHttpSettings(raw);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggested);
  const [envId, setEnvId] = useState<string | null>(settings.activeEnvId ?? settings.environments[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const env = settings.environments.find((e) => e.id === envId) ?? null;
  const valid = VAR_NAME_RE.test(name);
  const uid = useId().replace(/:/g, '');

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const saved = await saveAsSecret(tr, env?.id ?? null, name, value);
    setBusy(false);
    if (!saved) return;
    announce(tr('aSecretSaved', { env: saved.name, var: `{{${name}}}` }));
    setOpen(false);
    onSaved(name);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusItem kind="warn">{tr('authLiteral')}</StatusItem>
        {!open && (
          <button type="button" className={SECONDARY_CLS} onClick={() => setOpen(true)}>
            <KeyRound size={13} aria-hidden />
            {tr('authSaveSecret')}
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] p-2">
          <label className="flex min-w-0 flex-col gap-1" htmlFor={`http-secret-name-${uid}`}>
            <span className={PANEL_TITLE}>{tr('secretName')}</span>
            <input
              id={`http-secret-name-${uid}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!valid || undefined}
              className={`${INPUT_CLS} w-40 font-mono`}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className={PANEL_TITLE}>{tr('secretEnv')}</span>
            <Menu
              label={tr('secretEnvPicker', { name: env?.name ?? tr('secretEnvNew') })}
              buttonClassName={`${FIELD_BTN} min-w-[9rem]`}
              items={settings.environments.length
                ? settings.environments.map((e) => ({ key: e.id, checked: e.id === envId, label: e.name, onSelect: () => setEnvId(e.id) }))
                : [{ key: 'new', checked: true, label: tr('secretEnvNew'), onSelect: () => setEnvId(null) }]}
              button={
                <>
                  <span className="truncate">{env?.name ?? tr('secretEnvNew')}</span>
                  <ChevronDown size={13} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
                </>
              }
            />
          </div>
          <button type="button" className={SEND_BTN} aria-disabled={!valid || busy || undefined} onClick={() => void save()}>
            {tr('authSaveToKeychain')}
          </button>
          <button type="button" className={SECONDARY_CLS} onClick={() => setOpen(false)}>{tr('cancel')}</button>
          {!valid && <p className="w-full text-[10px] text-red-400">{tr('varNameInvalid')}</p>}
        </div>
      )}
    </div>
  );
}

/** Un campo de Auth: el combobox, su estado y, si es un literal que no
 *  debería quedar en la nota, "Guardar como secreto". */
function AuthField({
  tr, label, value, onValue, env, suggested, secretLike = true,
}: {
  tr: Tr;
  label: string;
  value: string;
  onValue: (value: string) => void;
  env: HttpEnvironment | null;
  suggested: string;
  /** El usuario de Basic no es un secreto: no se avisa. */
  secretLike?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="w-24 shrink-0 text-[11px] text-[var(--text-secondary)]" aria-hidden>{label}</span>
        <VariableCombobox tr={tr} label={label} value={value} onValue={onValue} env={env} placeholder={`{{${suggested}}}`} />
      </div>
      <div className="pl-[6.5rem]">
        {secretLike && isLiteral(value)
          ? <SaveSecret tr={tr} value={value} suggested={suggested} onSaved={(name) => onValue(`{{${name}}}`)} />
          : <VarStatus tr={tr} value={value} env={env} />}
      </div>
    </div>
  );
}

const literalOf = (state: AuthState): boolean => {
  if (state.kind === 'bearer') return isLiteral(state.token);
  if (state.kind === 'basic') return isLiteral(state.password);
  if (state.kind === 'apikey') return isLiteral(state.value);
  if (state.kind === 'other') return isLiteral(state.value.replace(/^\S+\s*/, ''));
  return false;
};

export function AuthPanel({
  tr, code, req, env, apiKey, onCode,
}: {
  tr: Tr;
  code: string;
  req: ParsedRequest | undefined;
  env: HttpEnvironment | null;
  apiKey: AuthContext['apiKey'];
  /** El texto nuevo y la fila de la API key que quedó escrita. */
  onCode: (code: string, apiKey: AuthContext['apiKey']) => void;
}) {
  const ctx: AuthContext = { isSecret: (n) => !!env?.vars.some((v) => v.name === n && v.secret), apiKey };
  const state: AuthState = req ? readAuth(req, ctx) : { kind: 'none' };
  const [confirmNone, setConfirmNone] = useState(false);

  const write = (input: AuthInput) => {
    const pinned = input.kind === 'apikey' ? { place: input.place, name: input.name } : null;
    onCode(setAuth(code, 0, input, ctx), pinned);
  };

  const choose = (kind: AuthKind) => {
    setConfirmNone(false);
    if (kind === state.kind) return;
    if (kind === 'none') {
      // Se perdería un valor escrito a mano: se confirma en línea.
      if (literalOf(state)) {
        setConfirmNone(true);
        return;
      }
      write({ kind: 'none' });
    } else if (kind === 'bearer') write({ kind: 'bearer', token: '' });
    else if (kind === 'basic') write({ kind: 'basic', user: '', password: '' });
    else if (kind === 'apikey') write({ kind: 'apikey', place: 'header', name: 'X-API-Key', value: '' });
    else write({ kind: 'other', value: state.kind === 'other' ? state.value : '' });
    announce(tr('authTypePicker', { type: authKindLabel(tr, kind) }));
  };

  const sentAs = (() => {
    if (state.kind === 'none' || !req) return null;
    if (state.kind === 'apikey') {
      return state.place === 'header' ? `${state.name}: ${state.value}` : `?${state.name}=${state.value}`;
    }
    const h = req.headerRows[state.row];
    return h ? `${h.name}: ${h.value}` : null;
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 shrink-0 text-[11px] text-[var(--text-secondary)]" aria-hidden>{tr('authType')}</span>
        <Menu
          label={tr('authTypePicker', { type: authKindLabel(tr, state.kind) })}
          buttonClassName={`${FIELD_BTN} w-40`}
          listClassName="min-w-[10rem]"
          items={KINDS.map((k) => ({ key: k, checked: k === state.kind, label: authKindLabel(tr, k), onSelect: () => choose(k) }))}
          button={
            <>
              <span>{authKindLabel(tr, state.kind)}</span>
              <ChevronDown size={13} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
            </>
          }
        />
      </div>

      {confirmNone && state.kind !== 'none' && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusItem kind="warn">{tr('authNoneConfirm', { header: state.kind === 'apikey' ? state.name : 'Authorization' })}</StatusItem>
          <button type="button" className={SECONDARY_CLS} onClick={() => { setConfirmNone(false); write({ kind: 'none' }); }}>{tr('authRemove')}</button>
          <button type="button" className={TEXT_LINK} onClick={() => setConfirmNone(false)}>{tr('cancel')}</button>
        </div>
      )}

      {state.kind === 'none' && <p className="text-[11px] text-[var(--text-hint)]">{tr('authNoneHelp')}</p>}
      {state.kind === 'bearer' && (
        <AuthField tr={tr} label={tr('authToken')} value={state.token} env={env} suggested="token"
          onValue={(token) => write({ kind: 'bearer', token })} />
      )}
      {state.kind === 'basic' && (
        <>
          <AuthField tr={tr} label={tr('authUser')} value={state.user} env={env} suggested="username" secretLike={false}
            onValue={(user) => write({ kind: 'basic', user, password: state.password })} />
          <AuthField tr={tr} label={tr('authPassword')} value={state.password} env={env} suggested="password"
            onValue={(password) => write({ kind: 'basic', user: state.user, password })} />
          <p className="pl-[6.5rem] text-[10px] text-[var(--text-hint)]">{tr('authBasicHelp')}</p>
        </>
      )}
      {state.kind === 'apikey' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-[11px] text-[var(--text-secondary)]" aria-hidden>{tr('authKeyName')}</span>
            <LiveInput
              aria-label={tr('authKeyName')}
              value={state.name}
              onValue={(name) => {
                if (name.trim()) write({ kind: 'apikey', place: state.place, name: name.trim(), value: state.value });
              }}
              className={`${INPUT_CLS} w-48 font-mono`}
            />
          </div>
          <AuthField tr={tr} label={tr('authKeyValue')} value={state.value} env={env} suggested="apiKey"
            onValue={(value) => write({ kind: 'apikey', place: state.place, name: state.name, value })} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-[11px] text-[var(--text-secondary)]" id="http-auth-in">{tr('authApiKeyIn')}</span>
            <div role="radiogroup" aria-labelledby="http-auth-in" className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
              {(['header', 'query'] as const).map((place) => (
                <button
                  key={place}
                  type="button"
                  role="radio"
                  aria-checked={state.place === place}
                  onClick={() => {
                    if (place === state.place) return;
                    const name = place === 'query' && state.name === 'X-API-Key' ? 'api_key' : place === 'header' && state.name === 'api_key' ? 'X-API-Key' : state.name;
                    write({ kind: 'apikey', place, name, value: state.value });
                  }}
                  className={SEG(state.place === place)}
                >
                  {tr(place === 'header' ? 'authInHeader' : 'authInQuery')}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {state.kind === 'other' && (
        <>
          <AuthField tr={tr} label="Authorization" value={state.value} env={env} suggested="authorization"
            onValue={(value) => write({ kind: 'other', value })} />
          <p className="pl-[6.5rem] text-[10px] text-[var(--text-hint)]">{tr('authOtherHelp')}</p>
        </>
      )}
      {sentAs && <p className="font-mono text-[10px] text-[var(--text-hint)]">{tr('authSentAs', { header: sentAs })}</p>}
    </div>
  );
}
