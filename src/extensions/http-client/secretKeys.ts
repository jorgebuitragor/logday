// Las claves en el llavero de las variables secretas (specs/cliente-http
// HT22, design A2). Va aparte y sin dependencias: el registro la importa
// para "Quitar configuración" sin cargar el módulo de la extensión (R16).

export const SECRET_KEY_RE = /^v_[0-9a-f]{8}$/;

export function httpClientSecretKeys(settings?: Record<string, unknown>): string[] {
  const envs = settings?.environments;
  if (!Array.isArray(envs)) return [];
  const keys: string[] = [];
  for (const env of envs) {
    const vars = (env as { vars?: unknown } | null)?.vars;
    if (!Array.isArray(vars)) continue;
    for (const v of vars) {
      const key = (v as { secret?: unknown; key?: unknown } | null);
      if (key?.secret === true && typeof key.key === 'string' && SECRET_KEY_RE.test(key.key) && !keys.includes(key.key)) {
        keys.push(key.key);
      }
    }
  }
  return keys;
}
