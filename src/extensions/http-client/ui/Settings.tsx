// Opciones → Cliente HTTP (Interfaz §4, HT17–HT22, HT24): los entornos con
// sus variables, los secretos en el llavero, los hosts de confianza y las
// opciones de las peticiones. Todo es local (R9); los valores de los
// secretos solo cruzan una vez hacia Rust, al guardarlos (R10).
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CircleDot, Info, Plus, ShieldAlert } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { useConfirmDelete } from '../../../hooks/useConfirmDelete';
import { ConfirmDeleteModal } from '../../../components/shared/ConfirmDeleteModal';
import { FOCUS_RING, INPUT_CLS, SECONDARY_CLS } from '../../../components/shared/controlClasses';
import { NumberField, Toggle } from '../../../components/shared/FormControls';
import { clearExtensionSecret } from '../../secrets';
import {
  DEFAULT_SETTINGS, EXTENSION_ID, LIMITS, defaultEnvName, newEnvironment, readHttpSettings, replaceEnvironment, secretKeysOf,
  withVariable, withoutVariable, type HttpEnvironment, type HttpVariable,
} from '../core/environments';
import { makeTr } from '../core/text';
import { peekSettingsEnvRequest, takeSettingsEnvRequest } from '../store';
import { EnvironmentPanel, fresh } from './EnvironmentPanel';

type Pending =
  | { kind: 'env'; env: HttpEnvironment }
  | { kind: 'var'; envId: string; index: number; v: HttpVariable }
  | { kind: 'unsecret'; envId: string; index: number; v: HttpVariable & { secret: true } };

export default function HttpClientSettingsPanel() {
  const { language, raw, update, confirmDestructiveActions, devtoolsOn, showToast } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[EXTENSION_ID]?.settings,
      update: s.updateExtensionSettings,
      confirmDestructiveActions: s.confirmDestructiveActions,
      devtoolsOn: s.extensions.devtools?.enabled === true,
      showToast: s.showToast,
    })),
  );
  const tr = makeTr(language);
  const settings = readHttpSettings(raw);
  const envs = settings.environments;
  // "Definir en Opciones" abre con ese entorno elegido. Se lee en el primer
  // dibujo y se consume después (en modo estricto el inicializador corre dos veces).
  const [selectedId, setSelectedId] = useState<string | null>(() => peekSettingsEnvRequest() ?? settings.activeEnvId ?? envs[0]?.id ?? null);
  useEffect(() => {
    takeSettingsEnvRequest();
  }, []);
  const selected = envs.find((e) => e.id === selectedId) ?? envs[0] ?? null;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const confirm = useConfirmDelete<Pending>(confirmDestructiveActions);

  const createEnv = () => {
    const all = fresh().environments;
    const env = newEnvironment(defaultEnvName(all, (n) => tr('envDefaultName', { n })));
    // El primero que se crea pasa a ser el activo.
    void update(EXTENSION_ID, { environments: [...all, env], ...(all.length === 0 ? { activeEnvId: env.id } : {}) });
    setSelectedId(env.id);
  };

  const run = async (p: Pending) => {
    try {
      const s = fresh();
      if (p.kind === 'env') {
        // Primero los secretos: si el llavero falla, el entorno queda.
        await Promise.all(secretKeysOf(p.env).map((k) => clearExtensionSecret(EXTENSION_ID, k)));
        const rest = s.environments.filter((e) => e.id !== p.env.id);
        await update(EXTENSION_ID, { environments: rest, activeEnvId: s.activeEnvId === p.env.id ? null : s.activeEnvId });
        setSelectedId(rest[0]?.id ?? null);
      } else {
        const env = s.environments.find((e) => e.id === p.envId);
        if (!env) return;
        if (p.v.secret) await clearExtensionSecret(EXTENSION_ID, p.v.key);
        const next = p.kind === 'var'
          ? withoutVariable(env, p.index)
          : withVariable(env, p.index, { name: p.v.name, secret: false, value: '' });
        await update(EXTENSION_ID, { environments: replaceEnvironment(s.environments, next) });
      }
    } catch {
      showToast({ kind: 'error', title: tr('keychainSaveError') });
    }
    confirm.cancel();
  };

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = envs.length;
    const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setSelectedId(envs[to].id);
    tabRefs.current[envs[to].id]?.focus();
  };

  const changed = settings.timeoutSec !== DEFAULT_SETTINGS.timeoutSec
    || settings.maxResponseMb !== DEFAULT_SETTINGS.maxResponseMb
    || settings.followRedirects !== DEFAULT_SETTINGS.followRedirects;

  const pending = confirm.pending;
  const modal = pending && (() => {
    if (pending.kind === 'env') {
      return { title: tr('envDeleteTitle', { name: pending.env.name }), message: tr('envDeleteMessage', { n: pending.env.vars.length }), confirmLabel: tr('envDeleteConfirm') };
    }
    if (pending.kind === 'unsecret') {
      return { title: tr('varUnsecretTitle', { name: pending.v.name }), message: tr('varUnsecretMessage'), confirmLabel: tr('varUnsecretConfirm') };
    }
    return {
      title: tr('varDeleteTitle', { name: pending.v.name }),
      message: tr(pending.v.secret ? 'varDeleteMessageSecret' : 'varDeleteMessage'),
      confirmLabel: tr('varDeleteConfirm'),
    };
  })();

  return (
    <div className="space-y-5 text-xs">
      <section className="space-y-3">
        <div className="space-y-1">
          <p className="font-medium text-[var(--text-secondary)]">{tr('envsTitle')}</p>
          <p className="text-[11px] text-[var(--text-hint)]">{tr('envsIntro')}</p>
        </div>

        {envs.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[var(--border-high)] px-4 py-3">
            <p className="flex-1 text-[11px] text-[var(--text-hint)]">{tr('envsEmpty')}</p>
            <button type="button" onClick={createEnv} className={SECONDARY_CLS}>
              <Plus size={13} aria-hidden />
              {tr('envCreateButton')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <label htmlFor="http-active-env" className="text-[var(--text-secondary)]">{tr('envActiveLabel')}</label>
              <select
                id="http-active-env"
                value={settings.activeEnvId ?? ''}
                onChange={(e) => void update(EXTENSION_ID, { activeEnvId: e.target.value || null })}
                className={INPUT_CLS}
              >
                <option value="">{tr('envNone')}</option>
                {envs.map((e) => <option key={e.id} value={e.id}>{e.name}{e.protected ? ` (${tr('envProtected')})` : ''}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label={tr('envTabs')} className="flex flex-wrap gap-1">
                {envs.map((e, i) => {
                  const active = e.id === selected?.id;
                  return (
                    <button
                      key={e.id}
                      ref={(el) => {
                        tabRefs.current[e.id] = el;
                      }}
                      type="button"
                      role="tab"
                      id={`http-env-tab-${e.id}`}
                      aria-selected={active}
                      aria-controls="http-env-panel"
                      tabIndex={active ? 0 : -1}
                      onClick={() => setSelectedId(e.id)}
                      onKeyDown={(ev) => onTabKey(ev, i)}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition ${FOCUS_RING} ${
                        active ? 'bg-indigo-500/10 text-[var(--text-primary)] ring-1 ring-indigo-500/40' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {e.id === settings.activeEnvId && <CircleDot size={10} className="text-indigo-400" aria-hidden />}
                      {e.protected && <ShieldAlert size={11} className="text-amber-400" aria-hidden />}
                      {e.name}
                      {e.id === settings.activeEnvId && <span className="sr-only"> ({tr('envActive')})</span>}
                      {e.protected && <span className="sr-only"> ({tr('envProtected')})</span>}
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={createEnv} className={SECONDARY_CLS}>
                <Plus size={13} aria-hidden />
                {tr('envNew')}
              </button>
            </div>

            {selected && (
              <div
                id="http-env-panel"
                role="tabpanel"
                aria-labelledby={`http-env-tab-${selected.id}`}
                className="space-y-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-4"
              >
                <EnvironmentPanel
                  key={selected.id}
                  env={selected}
                  tr={tr}
                  onDelete={() => confirm.request({ kind: 'env', env: selected }, (p) => void run(p))}
                  onDeleteVar={(index) => confirm.request({ kind: 'var', envId: selected.id, index, v: selected.vars[index] }, (p) => void run(p))}
                  onUnsecret={(index) => {
                    const v = selected.vars[index];
                    if (v?.secret) confirm.request({ kind: 'unsecret', envId: selected.id, index, v }, (p) => void run(p));
                  }}
                />
              </div>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <p className="font-medium text-[var(--text-secondary)]">{tr('requestsTitle')}</p>
        <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-2">
          <span className="text-[var(--text-secondary)]">{tr('timeout')}</span>
          <NumberField label={tr('timeoutAria')} value={settings.timeoutSec} min={LIMITS.timeoutSec.min} max={LIMITS.timeoutSec.max} width="w-16" onChange={(v) => void update(EXTENSION_ID, { timeoutSec: v })} />
          <span className="text-[var(--text-hint)]">{tr('timeoutUnit')}</span>
          <span className="text-[var(--text-secondary)]">{tr('maxSize')}</span>
          <NumberField label={tr('maxSizeAria')} value={settings.maxResponseMb} min={LIMITS.maxResponseMb.min} max={LIMITS.maxResponseMb.max} width="w-16" onChange={(v) => void update(EXTENSION_ID, { maxResponseMb: v })} />
          <span className="text-[var(--text-hint)]">{tr('maxSizeUnit')}</span>
        </div>
        <Toggle label={tr('followRedirects')} checked={settings.followRedirects} onChange={(v) => void update(EXTENSION_ID, { followRedirects: v })} />
        <p className="text-[10px] text-[var(--text-hint)]">{tr('rangesHelp')}</p>
        {changed && (
          <button
            type="button"
            onClick={() => void update(EXTENSION_ID, {
              timeoutSec: DEFAULT_SETTINGS.timeoutSec, maxResponseMb: DEFAULT_SETTINGS.maxResponseMb, followRedirects: DEFAULT_SETTINGS.followRedirects,
            })}
            className={SECONDARY_CLS}
          >
            {tr('resetValues')}
          </button>
        )}
      </section>

      <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-hint)]">
        <Info size={12} aria-hidden />
        {tr(devtoolsOn ? 'devtoolsHint' : 'devtoolsOffHint')}
      </p>

      {pending && modal && (
        <ConfirmDeleteModal
          title={modal.title}
          message={modal.message}
          cancelLabel={tr('deleteCancel')}
          confirmLabel={modal.confirmLabel}
          onCancel={confirm.cancel}
          onConfirm={() => void run(pending)}
        />
      )}
    </div>
  );
}
