import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, Download, Lightbulb, LogIn, LogOut, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import ToggleSwitch from '../../components/shared/ToggleSwitch';
import { importFromOpenProject } from './importer';
import {
  OPENPROJECT_ID, parseStatuses, projectSlug, readOpenProjectSettings, type CustomField, type OpenProjectSettings, type OpStatus,
  type PersonField,
} from './model';
import { pushErrorText } from './pusher';
import type { TaskStatus } from '../../types/task';

const PRIMARY_CLS =
  'flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_CLS =
  'flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50';
const INPUT_CLS =
  'min-w-0 flex-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-hint)] focus:border-indigo-500 focus:outline-none';

const KNOWN_ERRORS = new Set([
  'invalid_url', 'not_https', 'missing_token', 'bad_request', 'unauthorized', 'forbidden', 'not_found', 'not_openproject', 'redirected',
  'rate_limited', 'provider_error', 'timeout', 'network', 'too_big', 'needs_connect', 'unexpected_format', 'keychain_error',
]);

type Key = Parameters<typeof t<'openproject'>>[2];
const GUIDE: Key[] = ['guide1', 'guide2', 'guide3', 'guide4', 'guide5'];

function errorText(language: 'es' | 'en', code: string | undefined): string {
  const c = code && KNOWN_ERRORS.has(code) ? code : 'unknown';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t(language, 'openproject', `err_${c}` as any);
}

/** "3 tareas nuevas · 35 actualizadas", o solo lo que haya. */
function resultText(language: 'es' | 'en', created: number, updated: number, removed = 0): string {
  const parts = [`${created} ${t(language, 'openproject', created === 1 ? 'importedOne' : 'importedMany')}`];
  if (updated) parts.push(`${updated} ${t(language, 'openproject', updated === 1 ? 'updatedOne' : 'updatedMany')}`);
  if (removed) parts.push(`${removed} ${t(language, 'openproject', removed === 1 ? 'removedOne' : 'removedMany')}`);
  return parts.join(' · ');
}

/** P4b y P5: los campos personalizados de ese OpenProject. El de texto
 *  que da el código de la tarea (en la FCV, "Tarea") y los de persona en
 *  los que se busca también al usuario (como "Responsable Desarrollo"). */
function CustomFieldsSection({ language, codeField, personFields, onCodeField, onPersonFields }: {
  language: 'es' | 'en';
  codeField?: PersonField;
  personFields: PersonField[];
  onCodeField: (field: PersonField | null) => void;
  onPersonFields: (fields: PersonField[]) => void;
}) {
  const [available, setAvailable] = useState<CustomField[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<CustomField[]>('openproject_custom_fields')
      .then((fields) => { if (alive) setAvailable(fields); })
      .catch((err) => { if (alive) setError(errorText(language, typeof err === 'string' ? err : undefined)); });
    return () => { alive = false; };
  }, [language]);

  // Los elegidos siguen a la vista aunque la lista no haya llegado.
  const withSelected = (kind: CustomField['kind'], selected: PersonField[]) => [
    ...(available ?? []).filter((f) => f.kind === kind),
    ...selected.filter((s) => !available?.some((a) => a.id === s.id)),
  ];
  const textFields = withSelected('text', codeField ? [codeField] : []);
  const userFields = withSelected('user', personFields);
  // P5: si no se eligió ningún campo de código y hay uno llamado "Tarea"
  // (como en la FCV), se toma ese.
  useEffect(() => {
    if (codeField || !available) return;
    const tarea = available.find((f) => f.kind === 'text' && /^(tarea|task)$/i.test(f.name.trim()));
    if (tarea) onCodeField({ id: tarea.id, name: tarea.name });
  }, [available, codeField, onCodeField]);

  const toggle = (field: PersonField, on: boolean) =>
    onPersonFields(on ? [...personFields.filter((s) => s.id !== field.id), field] : personFields.filter((s) => s.id !== field.id));
  const loading = available === null && !error;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="op-code" className="w-28 shrink-0 text-[var(--text-secondary)]">{t(language, 'openproject', 'codeField')}</label>
        <select
          id="op-code"
          value={codeField?.id ?? ''}
          onChange={(e) => {
            const f = textFields.find((x) => x.id === e.target.value);
            onCodeField(f ? { id: f.id, name: f.name } : null);
          }}
          className="w-56 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
        >
          <option value="">{t(language, 'openproject', 'codeFieldNumber')}</option>
          {textFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <div>
          <p className="text-[var(--text-secondary)]">{t(language, 'openproject', 'personFields')}</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'openproject', 'personFieldsDesc')}</p>
        </div>
        {userFields.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {userFields.map((f) => (
              <label key={f.id} className="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={personFields.some((s) => s.id === f.id)}
                  onChange={(e) => toggle({ id: f.id, name: f.name }, e.target.checked)}
                  className="accent-indigo-500"
                />
                {f.name}
              </label>
            ))}
          </div>
        )}
        {loading && <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'openproject', 'personFieldsLoading')}</p>}
        {available && userFields.length === 0 && <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'openproject', 'personFieldsNone')}</p>}
        {error && <p className="text-[10px] text-red-400">{error}</p>}
      </div>
    </div>
  );
}

const LOGDAY_STATUSES: TaskStatus[] = ['todo', 'in-progress', 'done'];

/** P12: enviar a OpenProject el avance y el estado que cambies en Logday.
 *  Apagado por defecto, con un aviso que lo dice. */
function WriteBackSection({ language, settings, update }: {
  language: 'es' | 'en';
  settings: OpenProjectSettings;
  update: (patch: Record<string, unknown>) => void;
}) {
  const [statuses, setStatuses] = useState<OpStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const on = settings.writeBack;
  const locale = language === 'en' ? 'en-US' : 'es-CO';

  useEffect(() => {
    if (!on) return;
    let alive = true;
    invoke<string>('openproject_statuses')
      .then((body) => { if (alive) setStatuses(parseStatuses(body)); })
      .catch((err) => { if (alive) setError(errorText(language, typeof err === 'string' ? err : undefined)); });
    return () => { alive = false; };
  }, [on, language]);

  const pendingCount = Object.keys(settings.pending).length;
  const last = settings.lastPush;

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border-card)] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[var(--text-secondary)]">{t(language, 'openproject', 'writeBack')}</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'openproject', 'writeBackDesc')}</p>
        </div>
        <ToggleSwitch checked={on} onChange={(v) => update({ writeBack: v })} />
      </div>

      {on ? (
        <p className="flex gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[10px] leading-relaxed text-amber-400">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span>{t(language, 'openproject', 'writeBackOn')}</span>
        </p>
      ) : (
        <p className="flex gap-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-hint)]">
          <Lightbulb size={11} className="mt-0.5 shrink-0 text-amber-400" />
          <span>{t(language, 'openproject', 'writeBackOff')}</span>
        </p>
      )}

      {on && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'openproject', 'statusMapDesc')}</p>
          {LOGDAY_STATUSES.map((s) => (
            <div key={s} className="flex flex-wrap items-center gap-2">
              <label htmlFor={`op-map-${s}`} className="w-28 shrink-0 text-[var(--text-secondary)]">{t(language, 'openproject', `status_${s.replace('-', '_')}` as 'status_todo')}</label>
              <select
                id={`op-map-${s}`}
                value={settings.statusMap[s]?.id ?? ''}
                onChange={(e) => {
                  const picked = statuses?.find((x) => x.id === e.target.value);
                  update({ statusMap: { ...settings.statusMap, [s]: picked ? { id: picked.id, name: picked.name } : undefined } });
                }}
                className="w-56 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
              >
                <option value="">{t(language, 'openproject', 'statusMapNone')}</option>
                {/* El elegido sigue a la vista aunque la lista no haya llegado. */}
                {!statuses && settings.statusMap[s] && <option value={settings.statusMap[s]!.id}>{settings.statusMap[s]!.name}</option>}
                {statuses?.map((x) => <option key={x.id} value={x.id}>{x.name}{x.isClosed ? ` (${t(language, 'openproject', 'closedTag')})` : ''}</option>)}
              </select>
            </div>
          ))}
          {error && <p className="text-[10px] text-red-400">{error}</p>}
        </div>
      )}

      {on && (pendingCount > 0 || last) && (
        <p className="text-[11px]">
          {pendingCount > 0 && <span className="text-amber-400">{t(language, 'openproject', 'pushPending').replace('{n}', String(pendingCount))} </span>}
          {last && (
            <span className={last.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
              {t(language, 'openproject', 'pushLast')}: {last.status === 'ok' ? t(language, 'openproject', 'pushOk') : pushErrorText(language, last.error)}
              {last.title && <span className="text-[var(--text-hint)]"> · {last.title}</span>}
              <span className="text-[var(--text-hint)]"> · {new Date(last.at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** Panel de OpenProject en Opciones (specs/openproject). */
export default function OpenProjectSettings() {
  const { language, raw, update, showToast } = useAppStore(
    useShallow((s) => ({ language: s.language, raw: s.extensions[OPENPROJECT_ID]?.settings, update: s.updateExtensionSettings, showToast: s.showToast })),
  );
  const settings = readOpenProjectSettings(raw);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'import' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState(settings.baseUrl ?? '');
  const [token, setToken] = useState('');
  const [project, setProject] = useState(settings.project);
  const [guideOpen, setGuideOpen] = useState(!settings.account);
  const locale = language === 'en' ? 'en-US' : 'es-CO';
  const insecure = settings.baseUrl?.startsWith('http:') ?? false;

  const connect = async () => {
    setError(null);
    setBusy('connect');
    try {
      const res = await invoke<{ name: string; url: string }>('openproject_connect', { url, token });
      await update(OPENPROJECT_ID, { account: res.name || '—', baseUrl: res.url });
      setToken('');
      showToast({ kind: 'success', title: t(language, 'openproject', 'connected'), description: res.name });
    } catch (err) {
      setError(errorText(language, typeof err === 'string' ? err : undefined));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setError(null);
    setBusy('disconnect');
    try {
      await invoke('openproject_disconnect');
      await update(OPENPROJECT_ID, { account: '' });
    } catch (err) {
      setError(errorText(language, typeof err === 'string' ? err : undefined));
    } finally {
      setBusy(null);
    }
  };

  const importNow = async (restoreDeleted = false) => {
    setError(null);
    setBusy(restoreDeleted ? 'restore' : 'import');
    try {
      const { created, updated, removed } = await importFromOpenProject({ restoreDeleted });
      showToast({
        kind: 'success',
        title: created || updated || removed ? resultText(language, created, updated, removed) : t(language, 'openproject', 'nothingNew'),
      });
    } catch {
      // El detalle queda en settings.last y se muestra abajo.
    } finally {
      setBusy(null);
    }
  };

  const setCodeField = useCallback(
    (field: PersonField | null) => void update(OPENPROJECT_ID, { codeField: field ?? undefined }),
    [update],
  );

  const saveProject = () => {
    const name = projectSlug(project);
    setProject(name);
    if (name !== settings.project) void update(OPENPROJECT_ID, { project: name });
  };

  const last = settings.last;

  return (
    <div className="space-y-3 text-xs">
      {settings.account ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="min-w-0 text-[var(--text-secondary)]">
              {t(language, 'openproject', 'connectedAs')} <span className="font-medium text-[var(--text-primary)]">{settings.account}</span>
              {settings.baseUrl && <span className="text-[var(--text-hint)]"> · {settings.baseUrl.replace(/^https?:\/\//, '')}</span>}
            </span>
            <button type="button" onClick={() => void disconnect()} disabled={busy !== null} className={SECONDARY_CLS}>
              <LogOut size={12} />
              {t(language, 'openproject', 'disconnect')}
            </button>
          </div>
          {insecure && (
            <p className="flex gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[10px] leading-relaxed text-amber-400">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{t(language, 'openproject', 'insecure')}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="op-url" className="w-28 shrink-0 text-[var(--text-secondary)]">{t(language, 'openproject', 'url')}</label>
            <input
              id="op-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://openproject.miempresa.com"
              spellCheck={false}
              autoComplete="off"
              className={INPUT_CLS}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="op-token" className="w-28 shrink-0 text-[var(--text-secondary)]">{t(language, 'openproject', 'token')}</label>
            <input
              id="op-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t(language, 'openproject', 'tokenPlaceholder')}
              autoComplete="off"
              className={INPUT_CLS}
            />
          </div>
          <button type="button" onClick={() => void connect()} disabled={busy !== null || !url.trim() || !token.trim()} className={PRIMARY_CLS}>
            <LogIn size={12} />
            {busy === 'connect' ? t(language, 'openproject', 'connecting') : t(language, 'openproject', 'connect')}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="op-project" className="w-28 shrink-0 text-[var(--text-secondary)]">{t(language, 'openproject', 'project')}</label>
        <input
          id="op-project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          onBlur={saveProject}
          onKeyDown={(e) => { if (e.key === 'Enter') saveProject(); }}
          className="w-40 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {settings.account && (
        <CustomFieldsSection
          language={language}
          codeField={settings.codeField}
          personFields={settings.personFields}
          onCodeField={setCodeField}
          onPersonFields={(fields) => void update(OPENPROJECT_ID, { personFields: fields })}
        />
      )}

      {settings.account && (
        <WriteBackSection language={language} settings={settings} update={(patch) => void update(OPENPROJECT_ID, patch)} />
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[var(--text-secondary)]">{t(language, 'openproject', 'includeClosed')}</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'openproject', 'includeClosedDesc')}</p>
        </div>
        <ToggleSwitch checked={settings.includeClosed} onChange={(v) => void update(OPENPROJECT_ID, { includeClosed: v })} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[var(--text-secondary)]">{t(language, 'openproject', 'auto')}</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'openproject', 'autoDesc')}</p>
        </div>
        <ToggleSwitch checked={settings.auto} onChange={(v) => void update(OPENPROJECT_ID, { auto: v })} />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <div className="min-w-0 text-[11px]">
          <span className="text-[var(--text-hint)]">{t(language, 'openproject', 'lastResult')}: </span>
          {last ? (
            <span className={last.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
              {last.status === 'ok' ? <CheckCircle2 size={11} className="mr-1 inline" /> : <AlertCircle size={11} className="mr-1 inline" />}
              {last.status === 'ok'
                ? resultText(language, last.created ?? 0, last.updated ?? 0, last.removed ?? 0)
                : errorText(language, last.error)}
              <span className="text-[var(--text-hint)]"> · {new Date(last.at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </span>
          ) : (
            <span className="text-[var(--text-hint)]">{t(language, 'openproject', 'lastNever')}</span>
          )}
        </div>
        <button type="button" onClick={() => void importNow()} disabled={!settings.account || busy !== null} className={SECONDARY_CLS}>
          <Download size={12} className={busy === 'import' ? 'animate-pulse' : ''} />
          {busy === 'import' ? t(language, 'openproject', 'importing') : t(language, 'openproject', 'importNow')}
        </button>
      </div>

      {settings.account && Object.keys(settings.imported).length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-[10px] text-[var(--text-hint)]">{t(language, 'openproject', 'restoreDesc')}</p>
          <button type="button" onClick={() => void importNow(true)} disabled={busy !== null} className={SECONDARY_CLS}>
            <RotateCcw size={12} className={busy === 'restore' ? 'animate-spin' : ''} />
            {busy === 'restore' ? t(language, 'openproject', 'importing') : t(language, 'openproject', 'restore')}
          </button>
        </div>
      )}

      <div className="rounded-lg border border-[var(--border-card)]">
        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          aria-expanded={guideOpen}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
        >
          {t(language, 'openproject', 'guideTitle')}
          <ChevronDown size={12} className={`shrink-0 transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <div className="space-y-3 border-t border-[var(--border-card)] px-3 py-3">
            <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {GUIDE.map((k) => <li key={k}>{t(language, 'openproject', k)}</li>)}
            </ol>
            {(['guideTipVpn', 'guideTipOnce'] as const).map((k) => (
              <p key={k} className="flex gap-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-hint)]">
                <Lightbulb size={11} className="mt-0.5 shrink-0 text-amber-400" />
                <span>{t(language, 'openproject', k)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
