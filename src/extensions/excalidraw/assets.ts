// Excalidraw busca sus fuentes en `window.EXCALIDRAW_ASSET_PATH`. Se
// sirven desde la app (vite.config.ts: `/excalidraw/fonts/…`) para no
// pedirlas a un CDN desde el webview (R17 de la base). Excalidraw igual
// deja su CDN como último recurso: solo se usa para la fuente china
// (Xiaolai, 12 MB), que no se copia.
declare global {
  interface Window { EXCALIDRAW_ASSET_PATH?: string | string[] }
}

export function setLocalExcalidrawAssets(): void {
  window.EXCALIDRAW_ASSET_PATH = `${window.location.origin}/excalidraw/`;
}
