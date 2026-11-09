import { invoke } from '@tauri-apps/api/core';

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface SearchResult {
  path: string;
  content: string;
}

export const fs = {
  readFile: (path: string): Promise<string> =>
    invoke('read_file', { path }),

  writeFile: (path: string, content: string): Promise<void> =>
    invoke('write_file', { path, content }),

  listDir: (dir: string): Promise<FsEntry[]> =>
    invoke('list_dir', { dir }),

  createDir: (dir: string): Promise<void> =>
    invoke('create_dir_recursive', { dir }),

  deleteFile: (path: string): Promise<void> =>
    invoke('delete_file', { path }),

  renameDir: (from: string, to: string): Promise<void> =>
    invoke('rename_dir', { from, to }),

  deleteDir: (path: string): Promise<void> =>
    invoke('delete_dir', { path }),

  exists: (path: string): Promise<boolean> =>
    invoke('path_exists', { path }),

  searchTasks: (baseDir: string, query: string): Promise<SearchResult[]> =>
    invoke('search_tasks', { baseDir, query }),

  openInSystem: (path: string): Promise<void> =>
    invoke('open_in_system', { path }),

  getAppConfigDir: (): Promise<string> =>
    invoke('get_app_config_dir'),

  getHomeDir: (): Promise<string> =>
    invoke('get_home_dir'),

  writeBinary: (path: string, data: string): Promise<void> =>
    invoke('write_file_binary', { path, data }),

  readBinary: (path: string): Promise<string> =>
    invoke('read_file_binary', { path }),

  fetchImageBase64: (url: string): Promise<string> =>
    invoke('fetch_image_base64', { url }),

  openUrl: (url: string): Promise<void> =>
    invoke('open_url', { url }),
};

export interface UrlMeta {
  title: string;
  description: string;
  domain: string;
}

export function fetchUrlMetadata(url: string): Promise<UrlMeta> {
  return invoke('fetch_url_metadata', { url });
}

// ── Sync con servidor propio (logday-server) ─────────────────────────────────
export interface SyncHttpResponse {
  status: number;
  body: string;
}

/** HTTP request a un logday-server configurado por el usuario, ejecutada
 *  del lado Rust (evita CORS — ver comentario en src-tauri/src/lib.rs). */
export function syncRequest(params: {
  baseUrl: string;
  method: string;
  path: string;
  token?: string;
  body?: string;
}): Promise<SyncHttpResponse> {
  return invoke('sync_request', params);
}

// ── Notificaciones del sistema ───────────────────────────────────────────────
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export { isPermissionGranted, requestPermission, sendNotification };

// ── Diálogos de archivos ─────────────────────────────────────────────────────
// Se abren desde Rust (fs_pick_folder, fs_pick_files, fs_save_dialog), no con
// `@tauri-apps/plugin-dialog`: la ruta que elige el usuario es lo único que
// habilita una carpeta o un archivo fuera de la carpeta de datos para los
// comandos de archivos (src-tauri/src/fs_scope.rs, specs/blindaje-seguridad
// BS12–BS13). Un diálogo abierto desde el webview no habilitaría nada.

export interface DialogFilter {
  name: string;
  extensions: string[];
}

/** Opens a native save dialog and returns the selected path */
export async function saveDialog(opts?: { defaultPath?: string; filters?: DialogFilter[] }): Promise<string | null> {
  const result = await invoke<string | null>('fs_save_dialog', {
    defaultPath: opts?.defaultPath ?? null,
    filters: opts?.filters ?? null,
  });
  return typeof result === 'string' ? result : null;
}

/** Opens a native folder picker dialog and returns the selected path */
export async function pickFolder(): Promise<string | null> {
  const result = await invoke<string | null>('fs_pick_folder');
  return typeof result === 'string' ? result : null;
}

/** Opens a native file picker and returns the selected path(s) */
export async function pickFile(multiple = false, filters?: DialogFilter[]): Promise<string | string[] | null> {
  const result = await invoke<string[] | null>('fs_pick_files', { multiple, filters: filters ?? null });
  if (!result || result.length === 0) return null;
  return multiple ? result : result[0];
}

/** Opens a native file picker filtered to markdown/text files; returns array of paths */
export async function pickMarkdownFiles(): Promise<string[] | null> {
  const result = await pickFile(true, [{ name: 'Markdown', extensions: ['md', 'txt'] }]);
  if (!result) return null;
  return Array.isArray(result) ? result : [result];
}
