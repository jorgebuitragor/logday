import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveNativeDialog } from '@tauri-apps/plugin-dialog';

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

export interface ReleaseInfo {
  tag_name: string;
  html_url: string;
  body: string;
}

export function checkUpdate(): Promise<ReleaseInfo> {
  return invoke('check_update');
}

// ── Notificaciones del sistema ───────────────────────────────────────────────
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export { isPermissionGranted, requestPermission, sendNotification };

/** Opens a native save dialog and returns the selected path */
export async function saveDialog(opts?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> {
  const result = await saveNativeDialog(opts);
  if (typeof result === 'string') return result;
  return null;
}

/** Opens a native folder picker dialog and returns the selected path */
export async function pickFolder(): Promise<string | null> {
  const result = await openDialog({ directory: true, multiple: false });
  if (typeof result === 'string') return result;
  return null;
}

/** Opens a native file picker and returns the selected path(s) */
export async function pickFile(multiple = false): Promise<string | string[] | null> {
  const result = await openDialog({ multiple });
  return result as string | string[] | null;
}
