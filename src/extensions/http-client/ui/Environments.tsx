// Los entornos (HT17–HT22, HT76): el entorno activo, una pestaña por
// entorno y su panel (nombre, opciones, variables con sus secretos y hosts
// de confianza), con las confirmaciones de borrar. Lo usan Opciones →
// Cliente HTTP y el panel "Entornos" de la pantalla, para que los dos
// muestren y editen lo mismo. Todo es local (R9); los secretos van al
// llavero (R10).
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, ChevronDown, CircleDot, Plus, ShieldAlert } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { useConfirmDelete } from '../../../hooks/useConfirmDelete';
import { ConfirmDeleteModal } from '../../../components/shared/ConfirmDeleteModal';
import { FOCUS_RING, SECONDARY_CLS } from '../../../components/shared/controlClasses';
import { clearExtensionSecret } from '../../secrets';
import {
  EXTENSION_ID, defaultEnvName, newEnvironment, readHttpSettings, replaceEnvironment, secretKeysOf, withVariable,
  withoutVariable, type HttpEnvironment, type HttpVariable,
} from '../core/environments';
import type { Tr } from '../core/text';
import { setActiveEnv } from '../store';
import { EnvironmentPanel, fresh } from './EnvironmentPanel';
import { FIELD_BTN, Menu } from './Menu';

type Pending =
  | { kind: 'env'; env: HttpEnvironment }
  | { kind: 'var'; envId: string; index: number; v: HttpVariable }
  | { kind: 'unsecret'; envId: string; index: number; v: HttpVariable & { secret: true } };

export function EnvironmentsManager({ tr, initialEnvId = null, idPrefix = 'http-env' }: {
  tr: Tr;
  /** El entorno que se ve al abrir; si no, el activo. */
  initialEnvId?: string | null;
  /** Para que Opciones y la pantalla no repitan ids si conviven. */
  idPrefix?: string;
}) {
  const { raw, update, confirmDestructiveActions, showToast } = useAppStore(
    useShallow((s) => ({
      raw: s.extensions[EXTENSION_ID]?.settings,
      update: s.updateExtensionSettings,
      confirmDestructiveActions: s.confirmDestructiveActions,
      showToast: s.showToast,
    })),
  );
  const settings = readHttpSettings(raw);
  const envs = settings.environments;
  const activeEnv = envs.find((e) => e.id === settings.activeEnvId) ?? null;
  const activeName = activeEnv?.name ?? tr('envNone');
  const [selectedId, setSelectedId] = useState<string | null>(() => initialEnvId ?? settings.activeEnvId ?? envs[0]?.id ?? null);
  const selected = envs.find((e) => e.id === selectedId) ?? envs[0] ?? null;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const confirm = useConfirmDelete<Pending>(confirmDestructiveActions);

  // "Definir en Opciones" o el panel abren con un entorno elegido.
  useEffect(() => {
    if (initialEnvId) setSelectedId(initialEnvId);
  }, [initialEnvId]);

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

  const panelId = `${idPrefix}-panel`;

  return (
    <>
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
            <span className="text-[var(--text-secondary)]" aria-hidden>{tr('envActiveLabel')}</span>
            <Menu
              label={`${tr('envActiveLabel')}: ${activeName}${activeEnv?.protected ? `, ${tr('envProtected')}` : ''}`}
              buttonClassName={`${FIELD_BTN} min-w-[10rem]`}
              items={[
                { key: 'none', label: tr('envNone'), checked: !settings.activeEnvId, onSelect: () => void setActiveEnv(null) },
                ...envs.map((e) => ({
                  key: e.id,
                  label: (
                    <>
                      <span className="truncate">{e.name}</span>
                      {e.protected && <ShieldAlert size={12} className="ml-auto shrink-0 text-amber-400" aria-hidden />}
                    </>
                  ),
                  srSuffix: e.protected ? tr('envProtected') : undefined,
                  checked: e.id === settings.activeEnvId,
                  onSelect: () => void setActiveEnv(e.id),
                })),
              ]}
              button={
                <>
                  {activeEnv?.protected && <ShieldAlert size={12} className="shrink-0 text-amber-400" aria-hidden />}
                  <span className={`flex-1 truncate text-left ${activeEnv ? '' : 'text-[var(--text-hint)]'}`}>{activeName}</span>
                  <ChevronDown size={13} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
                </>
              }
            />
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
                    id={`${idPrefix}-tab-${e.id}`}
                    aria-selected={active}
                    aria-controls={panelId}
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
              id={panelId}
              role="tabpanel"
              aria-labelledby={`${idPrefix}-tab-${selected.id}`}
              className="space-y-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-4"
            >
              {/* La clave por entorno: al cambiar de entorno, lo revelado se
                  olvida con el panel (HT77). */}
              <EnvironmentPanel
                key={selected.id}
                env={selected}
                tr={tr}
                active={selected.id === settings.activeEnvId}
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
    </>
  );
}

/** El panel "Entornos" de la pantalla (HT76): lo mismo que Opciones, sin
 *  salir de la pantalla. "Volver a la petición" lo cierra (sin Esc: Esc ya
 *  cierra los menús y las confirmaciones de dentro); al cerrarse, lo
 *  revelado se olvida con él (HT77). */
export function EnvironmentsScreen({ tr, initialEnvId, onClose }: { tr: Tr; initialEnvId: string | null; onClose: () => void }) {
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
  }, []);
  return (
    <div className="flex min-w-0 flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h2 id="http-envs-title" className="text-sm font-semibold text-[var(--text-primary)]">{tr('envsTitle')}</h2>
          <p className="mt-1 text-[11px] text-[var(--text-hint)]">{tr('envsIntro')}</p>
        </div>
        <button ref={backRef} type="button" onClick={onClose} className={`${SECONDARY_CLS} shrink-0`}>
          <ArrowLeft size={13} aria-hidden />
          {tr('envPanelBack')}
        </button>
      </header>
      <div className="space-y-3 px-5 py-4 text-xs">
        <EnvironmentsManager tr={tr} initialEnvId={initialEnvId} idPrefix="http-view-env" />
      </div>
    </div>
  );
}
