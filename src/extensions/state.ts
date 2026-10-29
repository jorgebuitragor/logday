// Lógica pura de las preferencias de extensiones (activar, aviso,
// configuración, pantalla de inicio). Sin React ni store, para probarla
// sola; `useExtensions` y `appStore` la usan.
import type {
  ExtensionDefinition, ExtensionId, ExtensionPrefs, ExtensionSection, ExtensionsConfig,
} from './types';

export function isExtensionEnabled(config: ExtensionsConfig, id: ExtensionId): boolean {
  return config[id]?.enabled === true;
}

/** Las extensiones del registro que están activas, en el orden del registro. */
export function enabledExtensions(
  config: ExtensionsConfig,
  registry: readonly ExtensionDefinition[],
): ExtensionDefinition[] {
  return registry.filter((def) => isExtensionEnabled(config, def.id));
}

/** R6: si envía datos fuera y el usuario todavía no aceptó el aviso. */
export function needsConsent(def: ExtensionDefinition, prefs: ExtensionPrefs | undefined): boolean {
  return !!def.sendsDataExternally && !prefs?.consentAt;
}

/** Activa o desactiva. La configuración se conserva (R7); `consentAt`
 *  solo se escribe si llega uno nuevo. */
export function withExtensionEnabled(
  config: ExtensionsConfig,
  id: ExtensionId,
  enabled: boolean,
  consentAt?: string,
): ExtensionsConfig {
  const prev = config[id];
  const next: ExtensionPrefs = { ...prev, enabled };
  if (consentAt) next.consentAt = consentAt;
  return { ...config, [id]: next };
}

/** Mezcla `patch` en la configuración no secreta. Una clave con
 *  `undefined` se borra. */
export function withExtensionSettings(
  config: ExtensionsConfig,
  id: ExtensionId,
  patch: Record<string, unknown>,
): ExtensionsConfig {
  const prev = config[id] ?? { enabled: false };
  const settings: Record<string, unknown> = { ...prev.settings };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete settings[key];
    else settings[key] = value;
  }
  return { ...config, [id]: { ...prev, settings } };
}

/** "Quitar configuración" (R8): la extensión vuelve a como recién
 *  instalada, apagada y sin aviso aceptado. */
export function withoutExtension(config: ExtensionsConfig, id: ExtensionId): ExtensionsConfig {
  const next = { ...config };
  delete next[id];
  return next;
}

/** Lo que viene de `config.json` o de un backup. Se conservan las
 *  entradas de ids que esta versión no conoce, para no perderlas al
 *  guardar. */
export function parseExtensionsConfig(raw: unknown): ExtensionsConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, ExtensionPrefs> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const prefs: ExtensionPrefs = { enabled: v.enabled === true };
    if (typeof v.consentAt === 'string') prefs.consentAt = v.consentAt;
    if (v.settings && typeof v.settings === 'object' && !Array.isArray(v.settings)) {
      prefs.settings = v.settings as Record<string, unknown>;
    }
    out[id] = prefs;
  }
  return out as ExtensionsConfig;
}

export function extensionSection(id: ExtensionId): ExtensionSection {
  return `ext:${id}`;
}

/** El id de una sección `ext:<id>`, o `null` si es una sección fija. */
export function extensionIdOfSection(section: string): string | null {
  return section.startsWith('ext:') ? section.slice(4) : null;
}

/** R13: una sección de extensión solo vale si la extensión existe en
 *  Desktop, tiene vista y está activa. Si no, Inicio. */
export function resolveSection<S extends string>(
  section: S,
  config: ExtensionsConfig,
  registry: readonly ExtensionDefinition[],
): S | 'dashboard' {
  const id = extensionIdOfSection(section);
  if (id === null) return section;
  const def = registry.find((d) => d.id === id);
  if (!def || !def.view || !isExtensionEnabled(config, def.id)) return 'dashboard';
  return section;
}
