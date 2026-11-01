// Estado del Cliente HTTP en memoria: qué petición está elegida en cada
// bloque, lo que está en curso, las confirmaciones pendientes, las
// respuestas (en la caché de A8) y los borradores de la pantalla propia
// (HT33, HT40). Nada de esto va a disco (HT11), salvo con "Guardar en la
// nota" (HT50). La barra y la franja de un bloque son dos islas aparte:
// comparten esto.
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useAppStore } from '../../store/appStore';
import { extensionSection } from '../state';
import { announce } from './announce';
import { cancelHttp, sendErrorMessage, sendHttp, type SendError, type SendOutput } from './core/api';
import { bodyBytes } from './core/body';
import { ResponseCache, cacheKey } from './core/cache';
import { activeEnvironment, EXTENSION_ID, readHttpSettings, type HttpClientSettings, type HttpEnvironment } from './core/environments';
import { hasErrors, parseHttpBlock, type ParsedRequest, type ParseIssue } from './core/parse';
import { resolveRequest, type ConfirmReason, type Resolved, type SentPreview } from './core/resolve';
import { saveRequestInNote, type SaveMode } from './core/noteSave';
import { formatFence, parseFencedBlocks } from '../../lib/fencedBlocks';
import { editNoteContent } from '../../lib/noteExternalEdit';
import { formatElapsed, listVars, makeTr, type Tr } from './core/text';
import type { HttpClientKey } from '../../lib/i18n';

/** Lo que se envió, con qué entorno y cuándo: la pestaña Petición. */
export interface SentInfo {
  preview: SentPreview;
  envName: string | null;
  sentAt: number;
}

export interface ResponseOutcome extends SentInfo {
  output: SendOutput;
}

export interface ErrorOutcome extends SentInfo {
  error: SendError;
  timeoutSec: number;
}

/** Por petición: la última respuesta y, si el último envío falló, su
 *  error (la respuesta anterior se sigue mostrando, atenuada). */
export interface CachedResult {
  response: ResponseOutcome | null;
  error: ErrorOutcome | null;
  cancelled: boolean;
}

export interface PendingConfirm {
  requestIndex: number;
  method: string;
  envName: string | null;
  reasons: ConfirmReason[];
  /** Si el aviso vino de Rust (el secreto iba en el host). */
  fromRust: boolean;
  /** Donde estaba el foco al abrirse, para devolverlo. */
  returnFocus: Element | null;
}

export interface InFlight {
  requestId: string;
  requestIndex: number;
  startedAt: number;
}

export interface BlockState {
  selected: number;
  inFlight: InFlight | null;
  confirm: PendingConfirm | null;
}

/** De qué nota viene lo que hay en el formulario de la pantalla (HT34). */
export interface FormOrigin {
  noteId: string;
  title: string;
  filePath: string;
  /** El n-ésimo bloque ```http de la nota y la petición dentro de él. */
  blockIndex: number;
  requestIndex: number;
  /** Lo que se ve en la columna: el nombre de `###` o "MÉTODO ruta". */
  label: string;
}

/** Lo que se edita en la pantalla (HT40, design §14.3): el texto de una
 *  petición, sin la línea `###`. Las pestañas son vistas de este texto. */
export interface Draft {
  code: string;
  /** El texto al cargarla o al guardarla: si `code` es distinto, hay
   *  cambios sin guardar. */
  loadedCode: string;
  /** El `source` de su sección en la nota al cargarla o guardarla, para
   *  saber si la nota cambió desde entonces (HT50). `null` en una nueva. */
  loadedSource: string | null;
  /** El nombre de `###`, para "Guardar como petición nueva". */
  name: string | null;
  /** La fila que Auth escribió como API key: se reconoce aunque su valor
   *  todavía no sea una variable (requestEdit.ts, `AuthContext`). */
  apiKey: { place: 'header' | 'query'; name: string } | null;
  /** HT50: la nota cambió desde que se cargó; se pregunta qué hacer. */
  conflict: boolean;
}

export const EMPTY_DRAFT: Draft = { code: '', loadedCode: '', loadedSource: null, name: null, apiKey: null, conflict: false };

export const isDirty = (d: Draft | undefined) => !!d && d.code !== d.loadedCode;

interface HttpStore {
  blocks: Record<string, BlockState>;
  /** Sube con cada cambio de la caché, para volver a dibujar. */
  rev: number;
  /** Opciones → Cliente HTTP abre con este entorno elegido. */
  settingsEnvRequest: string | null;
  /** Los borradores de la pantalla, por petición (`formNoteId`): al ir de
   *  una a otra, cada una conserva sus cambios, como su respuesta. */
  drafts: Record<string, Draft>;
  /** De dónde salió lo que se ve en la pantalla (HT34). */
  origin: FormOrigin | null;
}

const initial = (): HttpStore => ({ blocks: {}, rev: 0, settingsEnvRequest: null, drafts: {}, origin: null });

export const httpApi = createStore<HttpStore>(() => initial());

export const useHttpStore = Object.assign(
  <T,>(select: (s: HttpStore) => T): T => useStore(httpApi, select),
  httpApi,
);

export const cache = new ResponseCache<CachedResult>();

export const blockKey = (noteId: string, index: number) => `${noteId}#${index}`;

const EMPTY_BLOCK: BlockState = { selected: 0, inFlight: null, confirm: null };

export const blockState = (s: HttpStore, key: string): BlockState => s.blocks[key] ?? EMPTY_BLOCK;

function patchBlock(key: string, patch: Partial<BlockState>) {
  httpApi.setState((s) => ({ blocks: { ...s.blocks, [key]: { ...blockState(s, key), ...patch } } }));
}

const bumpCache = () => httpApi.setState((s) => ({ rev: s.rev + 1 }));

export function selectRequest(key: string, index: number) {
  if (blockState(httpApi.getState(), key).selected !== index) patchBlock(key, { selected: index });
}

// ---------- Ajustes y entorno ----------

export function currentSettings(): HttpClientSettings {
  return readHttpSettings(useAppStore.getState().extensions[EXTENSION_ID]?.settings);
}

let userAgent = 'Logday';
export const setUserAgent = (ua: string) => {
  userAgent = ua;
};

/** El User-Agent que agrega Logday, para mostrarlo en Cabeceras (HT42). */
export const currentUserAgent = () => userAgent;

export function resolveWith(req: ParsedRequest, env: HttpEnvironment | null): Resolved {
  return resolveRequest(req, {
    env,
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
    userAgent,
  });
}

// ---------- Textos de los problemas ----------

export function issueMessage(tr: Tr, issue: ParseIssue): string {
  if (issue.code === 'get_with_body') return tr('getWithBody');
  if (issue.code === 'head_with_body') return tr('headWithBody');
  return tr(`parse.${issue.code}` as HttpClientKey, { line: issue.line, method: issue.detail ?? '' });
}

/** Por qué no se puede enviar (variables, secretos, URL), o `null`. */
export function blockedMessage(tr: Tr, r: Resolved, env: HttpEnvironment | null): string | null {
  if (r.ok) return null;
  const envName = env?.name ?? tr('envNone');
  if (r.missing.length) {
    return env
      ? tr('varMissing', { n: r.missing.length, vars: listVars(tr, r.missing), env: envName })
      : tr('varMissingNoEnv', { n: r.missing.length, vars: listVars(tr, r.missing) });
  }
  if (r.emptySecrets.length) return tr('secretEmpty', { var: listVars(tr, r.emptySecrets.slice(0, 1)), env: envName });
  if (r.unknownSystem.length) return tr('systemUnknown', { var: `{{${r.unknownSystem[0]}}}` });
  if (r.urlError) return tr(`url.${r.urlError}` as HttpClientKey);
  return null;
}

/** El primer error de sintaxis de la petición o del bloque. */
export function firstError(blockIssues: readonly ParseIssue[], req: ParsedRequest | undefined): ParseIssue | null {
  return [...blockIssues, ...(req?.issues ?? [])].find((i) => i.severity === 'error') ?? null;
}

// ---------- Enviar ----------

export interface SendOptions {
  noteId: string;
  blockIndex: number;
  code: string;
  requestIndex: number;
  /** El usuario ya confirmó (HT20, HT21). */
  confirmed?: boolean;
  /** El usuario confirmó enviar un secreto a un host ajeno (HT21). */
  allowUntrusted?: boolean;
  /** "Enviar sin verificar (solo esta vez)" (HT25). */
  insecureOnce?: boolean;
  /** Para devolver el foco al cerrar una confirmación. */
  returnFocus?: Element | null;
}

export type SendResult = 'sent' | 'blocked' | 'confirm' | 'busy' | 'failed';

function trNow(): Tr {
  return makeTr(useAppStore.getState().language);
}

function setResult(key: string, patch: Partial<CachedResult>, source: string, firstLine: string) {
  const hit = cache.get(key, firstLine, source);
  const prev: CachedResult = hit?.entry.value ?? { response: null, error: null, cancelled: false };
  const value: CachedResult = { ...prev, ...patch };
  const bytes = value.response ? bodyBytes(value.response.output.body) + 2048 : 2048;
  cache.set(key, { source, firstLine, value, bytes, at: Date.now() });
  bumpCache();
}

/** HT3: solo se llama por Enviar, ⌘↵ o una confirmación. Nunca por abrir,
 *  editar, sincronizar ni restaurar una nota. */
export async function sendRequest(opts: SendOptions): Promise<SendResult> {
  const tr = trNow();
  const bKey = blockKey(opts.noteId, opts.blockIndex);
  const state = blockState(httpApi.getState(), bKey);
  if (state.inFlight) return 'busy';
  const parsed = parseHttpBlock(opts.code);
  const req = parsed.requests[opts.requestIndex];
  const error = firstError(parsed.issues, req);
  if (!req || error) {
    announce(tr('aFailed', { message: error ? issueMessage(tr, error) : tr('parse.empty_block') }));
    return 'blocked';
  }
  const settings = currentSettings();
  const env = activeEnvironment(settings);
  const resolved = resolveWith(req, env);
  if (!resolved.ok) {
    announce(tr('aFailed', { message: blockedMessage(tr, resolved, env) ?? '' }));
    return 'blocked';
  }
  const pendingReasons = resolved.needsConfirm.filter((c) => (c.kind === 'protected' ? !opts.confirmed : !opts.allowUntrusted));
  if (pendingReasons.length > 0) {
    patchBlock(bKey, {
      selected: opts.requestIndex,
      confirm: {
        requestIndex: opts.requestIndex,
        method: req.method,
        envName: env?.name ?? null,
        reasons: resolved.needsConfirm,
        fromRust: false,
        returnFocus: opts.returnFocus ?? (typeof document !== 'undefined' ? document.activeElement : null),
      },
    });
    return 'confirm';
  }

  const rKey = cacheKey(opts.noteId, opts.blockIndex, opts.requestIndex);
  const requestId = crypto.randomUUID();
  patchBlock(bKey, { selected: opts.requestIndex, confirm: null, inFlight: { requestId, requestIndex: opts.requestIndex, startedAt: Date.now() } });
  announce(env ? tr('aSending', { method: req.method, env: env.name }) : tr('aSendingNoEnv', { method: req.method }));
  const sent: SentInfo = { preview: resolved.preview, envName: env?.name ?? null, sentAt: Date.now() };
  try {
    const output = await sendHttp({
      ...resolved.wire,
      requestId,
      timeoutMs: settings.timeoutSec * 1000,
      maxResponseBytes: settings.maxResponseMb * 1024 * 1024,
      followRedirects: settings.followRedirects,
      insecureTls: !!env?.insecureTls || !!opts.insecureOnce,
      trustedHosts: resolved.trustedHosts,
      allowUntrustedHost: !!opts.allowUntrusted,
    });
    setResult(rKey, { response: { ...sent, output }, error: null, cancelled: false }, req.source, req.firstLine);
    announce(tr('aDone', { status: output.status, reason: output.reason, time: formatElapsed(output.elapsedMs, useAppStore.getState().language) }));
    return 'sent';
  } catch (raw) {
    const err = raw as SendError;
    if (err.code === 'cancelled') {
      setResult(rKey, { error: null, cancelled: true }, req.source, req.firstLine);
      announce(tr('err.cancelled'));
      return 'failed';
    }
    // HT21 del lado de Rust: el secreto iba en el host, que el webview no
    // podía ver. Se pide la misma confirmación.
    if (err.code === 'secret_host_not_allowed' && !opts.allowUntrusted && err.host) {
      patchBlock(bKey, {
        inFlight: null,
        confirm: {
          requestIndex: opts.requestIndex,
          method: req.method,
          envName: env?.name ?? null,
          reasons: [{ kind: 'untrusted_host', host: err.host, vars: resolved.secrets }],
          fromRust: true,
          returnFocus: opts.returnFocus ?? (typeof document !== 'undefined' ? document.activeElement : null),
        },
      });
      return 'confirm';
    }
    setResult(rKey, { error: { ...sent, error: err, timeoutSec: settings.timeoutSec }, cancelled: false }, req.source, req.firstLine);
    announce(tr('aFailed', { message: sendErrorMessage(tr, err, { envName: env?.name ?? tr('envNone'), timeoutSec: settings.timeoutSec }) }));
    return 'failed';
  } finally {
    const now = blockState(httpApi.getState(), bKey);
    if (now.inFlight?.requestId === requestId) patchBlock(bKey, { inFlight: null });
  }
}

export function cancelBlock(key: string) {
  const f = blockState(httpApi.getState(), key).inFlight;
  if (f) void cancelHttp(f.requestId);
}

/** "No enviar" o Esc: se cierra y el foco vuelve a donde estaba. */
export function dismissConfirm(key: string) {
  const pending = blockState(httpApi.getState(), key).confirm;
  patchBlock(key, { confirm: null });
  const el = pending?.returnFocus as HTMLElement | null | undefined;
  if (el && typeof el.focus === 'function' && el.isConnected) el.focus();
}

export function dismissResult(noteId: string, blockIndex: number, requestIndex: number) {
  cache.delete(cacheKey(noteId, blockIndex, requestIndex));
  bumpCache();
}

export function readResult(noteId: string, blockIndex: number, requestIndex: number, req: ParsedRequest | undefined) {
  if (!req) return null;
  return cache.get(cacheKey(noteId, blockIndex, requestIndex), req.firstLine, req.source);
}

// ---------- La pantalla propia (HT33–HT35) ----------
// El formulario es un bloque más, con una sola petición. Cada petición de
// una nota tiene su propia clave (`view:<nota>:<bloque>:<petición>`), y la
// nueva, `view:new`: al ir de una a otra, cada una conserva su respuesta y
// lo que esté en curso. La nota no se toca: la clave no es la del bloque.

export function formNoteId(origin: FormOrigin | null): string {
  return origin ? `view:${origin.noteId}:${origin.blockIndex}:${origin.requestIndex}` : 'view:new';
}

export const formKey = (origin: FormOrigin | null) => blockKey(formNoteId(origin), 0);

/** La última respuesta del formulario, aunque la petición haya cambiado
 *  (entonces se ve como vieja): hay una sola petición. */
export function readFormResult(origin: FormOrigin | null, source: string | null): { entry: CachedResult; stale: boolean } | null {
  const entry = cache.peek(cacheKey(formNoteId(origin), 0, 0));
  if (!entry) return null;
  return { entry: entry.value, stale: entry.source !== source };
}

/** Cancela lo que esté en curso en esa clave y olvida su respuesta y su
 *  confirmación. */
function resetSlot(origin: FormOrigin | null) {
  const s = httpApi.getState();
  const key = formKey(origin);
  const b = s.blocks[key];
  if (b?.inFlight) void cancelHttp(b.inFlight.requestId);
  cache.delete(cacheKey(formNoteId(origin), 0, 0));
  const blocks = { ...s.blocks };
  delete blocks[key];
  httpApi.setState({ blocks, rev: s.rev + 1 });
}

/** El borrador que se ve en la pantalla. */
export function currentDraft(s: HttpStore = httpApi.getState()): Draft {
  return s.drafts[formNoteId(s.origin)] ?? EMPTY_DRAFT;
}

function patchDraft(patch: Partial<Draft>) {
  httpApi.setState((s) => {
    const id = formNoteId(s.origin);
    return { drafts: { ...s.drafts, [id]: { ...(s.drafts[id] ?? EMPTY_DRAFT), ...patch } } };
  });
}

/** Cada edición de la pantalla (una tabla, Auth, el texto, un cURL pegado
 *  en la URL, HT39c) reescribe el texto del borrador. La procedencia no
 *  cambia. */
export function setDraftCode(code: string, extra: Partial<Pick<Draft, 'apiKey'>> = {}) {
  patchDraft({ code, ...extra });
}

/** Elegir una petición de la columna (o "Editar en Cliente HTTP" desde el
 *  bloque): la pantalla pasa a ella. Si ya tenía cambios sin guardar, se
 *  conservan; si no, se carga lo que dice la nota ahora. */
export function loadDraft(origin: FormOrigin, loaded: { code: string; source: string; name: string | null }) {
  httpApi.setState((s) => {
    const id = formNoteId(origin);
    const prev = s.drafts[id];
    const draft = isDirty(prev)
      ? prev
      : { ...EMPTY_DRAFT, code: loaded.code, loadedCode: loaded.code, loadedSource: loaded.source, name: loaded.name };
    return { origin, drafts: { ...s.drafts, [id]: draft } };
  });
}

/** "Editar en Cliente HTTP" desde la barra del bloque (HT50): la pantalla
 *  con esa petición cargada. */
export async function openInView(origin: FormOrigin, loaded: { code: string; source: string; name: string | null }) {
  loadDraft(origin, loaded);
  await useAppStore.getState().setSection(extensionSection(EXTENSION_ID));
}

/** "Nueva petición": el borrador vacío, sin nota, y sin la respuesta de
 *  la petición nueva anterior. */
export function newForm() {
  resetSlot(null);
  httpApi.setState((s) => ({ origin: null, drafts: { ...s.drafts, [formNoteId(null)]: EMPTY_DRAFT } }));
}

export type SaveToNoteResult = 'saved' | 'conflict' | 'new_note' | 'missing' | 'open' | 'unchanged' | 'failed';

/** HT50, "Guardar en la nota": reescribe en la nota solo la sección de la
 *  petición. Con `replace`, si la sección cambió desde que se cargó, no
 *  escribe y deja el conflicto para que se elija. `append` sin sitio en el
 *  bloque (o sin el bloque) crea una nota nueva. */
export async function saveDraftToNote(mode: SaveMode, newNoteTitle: string): Promise<SaveToNoteResult> {
  const { origin } = httpApi.getState();
  const draft = currentDraft();
  if (!origin) return 'failed';
  const id = formNoteId(origin);
  let outcome: ReturnType<typeof saveRequestInNote> | null = null;
  const result = await editNoteContent(origin.filePath, origin.noteId, (content) => {
    outcome = saveRequestInNote(content, {
      blockIndex: origin.blockIndex,
      requestIndex: origin.requestIndex,
      loadedSource: draft.loadedSource ?? '',
      name: draft.name,
    }, draft.code, mode);
    return outcome.ok ? outcome.content : null;
  }).catch(() => null);
  if (!result) return 'failed';
  if (result.status === 'missing' || result.status === 'open') return result.status;
  const done = outcome as ReturnType<typeof saveRequestInNote> | null;
  if (result.status === 'declined' && done && !done.ok) {
    if (done.reason === 'conflict') {
      patchDraft({ conflict: true });
      return 'conflict';
    }
    // El bloque ya no está o tiene 20 peticiones: va a una nota nueva.
    if (mode === 'replace') {
      patchDraft({ conflict: true });
      return 'conflict';
    }
    const note = await useAppStore.getState().createNoteWith({ title: newNoteTitle, content: formatFence('http', draft.code) }).catch(() => null);
    if (!note) return 'failed';
    // La pantalla pasa a la petición de la nota nueva; la de antes vuelve
    // a lo que dice su nota.
    const nextOrigin: FormOrigin = { noteId: note.id, title: note.title, filePath: note.filePath, blockIndex: 0, requestIndex: 0, label: origin.label };
    httpApi.setState((s) => {
      const drafts = { ...s.drafts };
      delete drafts[id];
      const block = parseFencedBlocks(note.content, 'http')[0];
      const source = block ? parseHttpBlock(block.code).requests[0]?.source ?? null : null;
      drafts[formNoteId(nextOrigin)] = { ...draft, loadedCode: draft.code, loadedSource: source, conflict: false };
      return { origin: nextOrigin, drafts };
    });
    return 'new_note';
  }
  // `unchanged`: la nota ya decía eso; cuenta como guardado.
  if (!done || !done.ok) return 'failed';
  // La petición ahora es la de la nota: la sección nueva si se agregó.
  const nextOrigin: FormOrigin = { ...origin, requestIndex: done.requestIndex, label: mode === 'append' && draft.name ? `${draft.name} (2)` : origin.label };
  const nextId = formNoteId(nextOrigin);
  httpApi.setState((s) => {
    const drafts = { ...s.drafts };
    const saved: Draft = { ...draft, loadedCode: draft.code, loadedSource: done.source, conflict: false, name: mode === 'append' && draft.name ? `${draft.name} (2)` : draft.name };
    if (nextId !== id) {
      // El borrador de la petición de antes vuelve a lo que dice la nota.
      delete drafts[id];
    }
    drafts[nextId] = saved;
    return { origin: nextOrigin, drafts };
  });
  return 'saved';
}

export function dismissConflict() {
  patchDraft({ conflict: false });
}

/** El entorno activo para todas las peticiones (HT19). */
export async function setActiveEnv(id: string | null) {
  const app = useAppStore.getState();
  const settings = currentSettings();
  await app.updateExtensionSettings(EXTENSION_ID, { activeEnvId: id });
  const name = settings.environments.find((e) => e.id === id)?.name;
  const tr = trNow();
  announce(tr('aEnv', { name: name ?? tr('envNone') }));
}

export function openSettings(envId: string | null) {
  httpApi.setState({ settingsEnvRequest: envId });
  useAppStore.getState().openExtensionSettings(EXTENSION_ID);
}

export const peekSettingsEnvRequest = (): string | null => httpApi.getState().settingsEnvRequest;

export function takeSettingsEnvRequest(): string | null {
  const id = httpApi.getState().settingsEnvRequest;
  if (id) httpApi.setState({ settingsEnvRequest: null });
  return id;
}

/** R7: al desactivar, se cancela lo que está en curso y se olvida todo. */
export function resetAll() {
  for (const b of Object.values(httpApi.getState().blocks)) if (b.inFlight) void cancelHttp(b.inFlight.requestId);
  cache.clear();
  httpApi.setState(initial());
}

export { hasErrors };
