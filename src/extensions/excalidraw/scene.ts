// La escena de Excalidraw dentro de un bloque ```excalidraw de la nota
// (specs/excalidraw). Sin React ni Excalidraw: se prueba con vitest.

export const EXCALIDRAW_LANGUAGE = 'excalidraw';
/** Más que esto suele ser por imágenes pegadas: la nota y su sync se
 *  vuelven pesados (X4). */
export const MAX_SCENE_BYTES = 1024 * 1024;

export interface Scene {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

/** El contenido del bloque → escena. Vacío o roto → escena vacía (X3:
 *  nunca rompe la nota). `ok: false` avisa que el JSON no se pudo leer. */
export function parseScene(code: string): { scene: Scene; ok: boolean } {
  const empty: Scene = { elements: [], appState: {}, files: {} };
  if (!code.trim()) return { scene: empty, ok: true };
  try {
    const raw = JSON.parse(code) as Record<string, unknown>;
    const elements = Array.isArray(raw.elements) ? raw.elements.filter((e) => !(e as { isDeleted?: boolean })?.isDeleted) : [];
    const appState = raw.appState && typeof raw.appState === 'object' ? (raw.appState as Record<string, unknown>) : {};
    const files = raw.files && typeof raw.files === 'object' ? (raw.files as Record<string, unknown>) : {};
    return { scene: { elements, appState, files }, ok: true };
  } catch {
    return { scene: empty, ok: false };
  }
}

/** La escena en una sola línea (una línea con ``` cerraría la cerca), sin
 *  saltos de línea crudos: JSON.stringify ya los escapa. */
export function sceneToCode(json: string): string {
  return JSON.stringify(JSON.parse(json));
}

export const byteSize = (s: string) => new TextEncoder().encode(s).length;
