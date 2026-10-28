// Datos de la app y de sus releases en GitHub, para Acerca de y las
// novedades (specs/actualizaciones-automaticas "Acerca de").

/** Igual que `bundle.copyright` en tauri.conf.json y `license` en
 *  package.json; una prueba lo comprueba. */
export const APP_COPYRIGHT = '© 2026 Jorge Buitrago';
export const APP_LICENSE_SPDX = 'AGPL-3.0-or-later';

export const REPO_URL = 'https://github.com/jorgebuitragor/logday';
export const RELEASES_URL = `${REPO_URL}/releases`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
const RELEASES_API = 'https://api.github.com/repos/jorgebuitragor/logday/releases/tags';

export interface ReleaseInfo {
  /** Markdown de las notas, o `null` si el release no trae. */
  body: string | null;
  /** Instante ISO en que se publicó el release. */
  publishedAt?: string;
}

/** El release `v<version>`. `null`: GitHub respondió que no existe.
 *  `undefined`: no se pudo consultar (sin red, límite de la API). */
export async function fetchRelease(version: string): Promise<ReleaseInfo | null | undefined> {
  try {
    const res = await fetch(`${RELEASES_API}/v${version}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    const json = (await res.json()) as { body?: unknown; published_at?: unknown };
    return {
      body: typeof json.body === 'string' && json.body.trim() ? json.body : null,
      ...(typeof json.published_at === 'string' ? { publishedAt: json.published_at } : {}),
    };
  } catch {
    return undefined;
  }
}

// ── Cuándo se actualizó la app en este equipo ──
// Se guarda al abrir por primera vez una versión (instalación nueva o
// actualización). Es local, como el resto de preferencias de la app.
const UPDATED_AT_KEY = 'appUpdatedAt';

export function recordAppUpdatedAt(version: string, at: string): void {
  try {
    localStorage.setItem(UPDATED_AT_KEY, JSON.stringify({ version, at }));
  } catch { /* sin localStorage: Acerca de usa la fecha del release */ }
}

/** El instante en que se instaló `version` en este equipo, si se sabe.
 *  No se sabe para una versión instalada antes de que existiera esto. */
export function appUpdatedAt(version: string): string | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(UPDATED_AT_KEY) || 'null') as { version?: unknown; at?: unknown } | null;
    return raw?.version === version && typeof raw.at === 'string' ? raw.at : undefined;
  } catch {
    return undefined;
  }
}
