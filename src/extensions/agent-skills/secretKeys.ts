// Las claves en el llavero de los tokens de servidores propios
// (specs/skills-de-agentes SK24). Va aparte y sin dependencias: el registro
// la importa para "Quitar configuración" sin cargar la extensión (R16).

export const TOKEN_KEY_RE = /^token-[0-9a-f]{12}$/;

/** Las que la extensión anotó en `settings.tokenKeys` al guardar un token. */
export function agentSkillsSecretKeys(settings?: Record<string, unknown>): string[] {
  const keys = settings?.tokenKeys;
  return Array.isArray(keys) ? [...new Set(keys.filter((k): k is string => typeof k === 'string' && TOKEN_KEY_RE.test(k)))] : [];
}
