// Ajustes de la extensión: entornos, variables, hosts de confianza y
// opciones de las peticiones (specs/cliente-http HT17–HT22, design A6).
// Viven en `extensions['http-client'].settings` (local, sin sync, R9). Los
// valores de las variables secretas NO están aquí: solo su clave en el
// llavero y la pista. Puro, sin React ni Tauri.
import { SECRET_KEY_RE } from '../secretKeys';

export const EXTENSION_ID = 'http-client' as const;

export type HttpVariable =
  | { name: string; secret: false; value: string }
  | { name: string; secret: true; key: string; hint: string | null };

export interface HttpEnvironment {
  /** 'e_' + 8 hex. */
  id: string;
  /** Único, sin distinguir mayúsculas. */
  name: string;
  /** HT20: pedir confirmación antes de POST, PUT, PATCH o DELETE. */
  protected: boolean;
  /** HT25: aceptar certificados no válidos. */
  insecureTls: boolean;
  /** Hosts de confianza agregados a mano (HT21). */
  extraHosts: string[];
  vars: HttpVariable[];
}

export interface HttpClientSettings {
  activeEnvId: string | null;
  environments: HttpEnvironment[];
  timeoutSec: number;
  maxResponseMb: number;
  followRedirects: boolean;
}

export const LIMITS = {
  timeoutSec: { min: 1, max: 300, default: 30 },
  maxResponseMb: { min: 1, max: 50, default: 10 },
} as const;

export const DEFAULT_SETTINGS: HttpClientSettings = {
  activeEnvId: null,
  environments: [],
  timeoutSec: LIMITS.timeoutSec.default,
  maxResponseMb: LIMITS.maxResponseMb.default,
  followRedirects: true,
};

export const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const ENV_ID_RE = /^e_[0-9a-f]{8}$/;
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$|^\[[0-9a-f:.]+\]$/;

const clampInt = (raw: unknown, min: number, max: number, fallback: number) => {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : fallback;
  return Math.min(max, Math.max(min, n));
};

function readVariable(raw: unknown): HttpVariable | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.name !== 'string' || !VAR_NAME_RE.test(v.name)) return null;
  if (v.secret === true) {
    if (typeof v.key !== 'string' || !SECRET_KEY_RE.test(v.key)) return null;
    return { name: v.name, secret: true, key: v.key, hint: typeof v.hint === 'string' && v.hint ? v.hint : null };
  }
  return { name: v.name, secret: false, value: typeof v.value === 'string' ? v.value : '' };
}

function readEnvironment(raw: unknown): HttpEnvironment | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || !ENV_ID_RE.test(e.id)) return null;
  if (typeof e.name !== 'string' || !e.name.trim()) return null;
  const vars: HttpVariable[] = [];
  for (const item of Array.isArray(e.vars) ? e.vars : []) {
    const v = readVariable(item);
    // Nombres únicos dentro del entorno: se queda el primero.
    if (v && !vars.some((x) => x.name === v.name)) vars.push(v);
  }
  const extraHosts = (Array.isArray(e.extraHosts) ? e.extraHosts : [])
    .filter((h): h is string => typeof h === 'string' && isValidHost(h))
    .map((h) => h.toLowerCase());
  return {
    id: e.id,
    name: e.name.trim(),
    protected: e.protected === true,
    insecureTls: e.insecureTls === true,
    extraHosts: [...new Set(extraHosts)],
    vars,
  };
}

/** Lo que no sea válido se descarta sin romper (como `readDevtoolsSettings`). */
export function readHttpSettings(raw: Record<string, unknown> | undefined): HttpClientSettings {
  const r = raw ?? {};
  const environments: HttpEnvironment[] = [];
  for (const item of Array.isArray(r.environments) ? r.environments : []) {
    const env = readEnvironment(item);
    if (env && !environments.some((e) => e.id === env.id || sameName(e.name, env.name))) environments.push(env);
  }
  const activeEnvId = typeof r.activeEnvId === 'string' && environments.some((e) => e.id === r.activeEnvId) ? r.activeEnvId : null;
  return {
    activeEnvId,
    environments,
    timeoutSec: clampInt(r.timeoutSec, LIMITS.timeoutSec.min, LIMITS.timeoutSec.max, LIMITS.timeoutSec.default),
    maxResponseMb: clampInt(r.maxResponseMb, LIMITS.maxResponseMb.min, LIMITS.maxResponseMb.max, LIMITS.maxResponseMb.default),
    followRedirects: r.followRedirects !== false,
  };
}

export const activeEnvironment = (s: HttpClientSettings): HttpEnvironment | null =>
  s.environments.find((e) => e.id === s.activeEnvId) ?? null;

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

const randomHex = (bytes: number, random: () => number) =>
  Array.from({ length: bytes }, () => Math.floor(random() * 256).toString(16).padStart(2, '0')).join('');

export const newEnvId = (random: () => number = Math.random) => `e_${randomHex(4, random)}`;
/** La clave cumple `secret_account` de Rust: `ext:http-client:v_ab12cd34`. */
export const newSecretKey = (random: () => number = Math.random) => `v_${randomHex(4, random)}`;

export type EnvNameError = 'empty' | 'duplicate';

export function envNameError(envs: readonly HttpEnvironment[], name: string, selfId: string | null): EnvNameError | null {
  if (!name.trim()) return 'empty';
  if (envs.some((e) => e.id !== selfId && sameName(e.name, name))) return 'duplicate';
  return null;
}

export type VarNameError = 'invalid' | 'duplicate';

export function varNameError(env: HttpEnvironment, name: string, selfIndex: number | null): VarNameError | null {
  if (!VAR_NAME_RE.test(name)) return 'invalid';
  if (env.vars.some((v, i) => i !== selfIndex && v.name === name)) return 'duplicate';
  return null;
}

/** "Entorno 3": el primer número libre. */
export function defaultEnvName(envs: readonly HttpEnvironment[], label: (n: number) => string): string {
  for (let n = envs.length + 1; ; n += 1) {
    const name = label(n);
    if (!envs.some((e) => sameName(e.name, name))) return name;
  }
}

export function newEnvironment(name: string, random: () => number = Math.random): HttpEnvironment {
  return { id: newEnvId(random), name, protected: false, insecureTls: false, extraHosts: [], vars: [] };
}

/** Copia los nombres, los valores no secretos y las opciones. Las secretas
 *  van con una clave nueva y sin valor: el webview no puede leerlo. */
export function duplicateEnvironment(env: HttpEnvironment, name: string, random: () => number = Math.random): HttpEnvironment {
  return {
    ...env,
    id: newEnvId(random),
    name,
    extraHosts: [...env.extraHosts],
    vars: env.vars.map((v) => (v.secret ? { name: v.name, secret: true, key: newSecretKey(random), hint: null } : { ...v })),
  };
}

/** Las claves del llavero de un entorno, para borrarlas al eliminarlo. */
export const secretKeysOf = (env: HttpEnvironment) => env.vars.flatMap((v) => (v.secret ? [v.key] : []));

/** El host de una URL http(s), en minúsculas y sin el puerto, o `null`. */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Solo un host: sin esquema, ruta, puerto ni espacios. */
export function isValidHost(input: string): boolean {
  return HOST_RE.test(input.trim().toLowerCase());
}

export interface TrustedHost {
  host: string;
  /** La variable de la que sale, o `null` si se agregó a mano. */
  from: string | null;
}

/** HT21: los hosts de las variables cuyo valor es una URL (también de la
 *  pista de un secreto, "host …a1b2"), más los agregados a mano. */
export function trustedHosts(env: HttpEnvironment | null): TrustedHost[] {
  if (!env) return [];
  const out: TrustedHost[] = [];
  const add = (host: string | null, from: string | null) => {
    if (host && !out.some((h) => h.host === host)) out.push({ host, from });
  };
  for (const v of env.vars) {
    if (!v.secret) add(hostOf(v.value), v.name);
    else if (v.hint && / …/.test(v.hint)) {
      const host = v.hint.slice(0, v.hint.lastIndexOf(' …')).trim().toLowerCase();
      if (isValidHost(host)) add(host, v.name);
    }
  }
  for (const h of env.extraHosts) add(h.toLowerCase(), null);
  return out;
}

/** "••••…a1b2": la pista sin el host, para mostrar un secreto (HT18). */
export function maskOf(hint: string | null): string {
  if (!hint) return '••••';
  const i = hint.lastIndexOf('…');
  return `••••${i >= 0 ? hint.slice(i) : ''}`;
}

/** Si el nombre parece de un secreto y no está marcado (Interfaz §4). */
export const looksSecret = (name: string) => /token|secret|password|passwd|pwd|key|auth|bearer/i.test(name);

// Cambios sobre la lista de entornos, inmutables.

export function replaceEnvironment(envs: readonly HttpEnvironment[], env: HttpEnvironment): HttpEnvironment[] {
  return envs.map((e) => (e.id === env.id ? env : e));
}

export function withVariable(env: HttpEnvironment, index: number, v: HttpVariable): HttpEnvironment {
  return { ...env, vars: env.vars.map((x, i) => (i === index ? v : x)) };
}

export function withoutVariable(env: HttpEnvironment, index: number): HttpEnvironment {
  return { ...env, vars: env.vars.filter((_, i) => i !== index) };
}
