// Comandos Rust de la extensión (src-tauri/src/extensions/agent_skills,
// specs/skills-de-agentes). El webview no manda rutas: nombra una skill
// por su fuente y su `id`, relativo a la carpeta de esa fuente (SK26).
import { invoke } from '@tauri-apps/api/core';

export type SourceId =
  | 'claude'
  | 'agents'
  | 'codex'
  | 'disabled'
  | 'claude-synced'
  | 'codex-system'
  | 'codex-admin'
  | 'claude-plugin'
  | 'codex-plugin';

export type Tool = 'claude' | 'codex';
export type Origin = 'own' | 'disabled' | 'synced' | 'system' | 'admin' | 'plugin' | 'external';

export interface SkillLocation {
  source: SourceId;
  id: string;
  /** Para mostrar (`~/…`). */
  path: string;
  isLink: boolean;
  linkTarget: string | null;
  broken: boolean;
  tool: Tool;
}

export interface FileFlags {
  scripts: boolean;
  binaries: boolean;
  symlinks: boolean;
  executables: boolean;
  truncated: boolean;
}

export interface PluginInfo {
  name: string;
  marketplace: string;
  version: string | null;
}

export interface SkillEntry {
  key: string;
  dirName: string;
  primary: SkillLocation;
  locations: SkillLocation[];
  tools: Tool[];
  origin: Origin;
  plugin: PluginInfo | null;
  editable: boolean;
  skillMd: string | null;
  skillMdTruncated: boolean;
  fileCount: number;
  sizeBytes: number;
  modifiedMs: number;
  fileFlags: FileFlags;
}

export interface FolderInfo {
  source: SourceId;
  path: string;
  exists: boolean;
}

export interface ListResult {
  skills: SkillEntry[];
  folders: FolderInfo[];
}

export type FileKind = 'text' | 'binary' | 'symlink';

export interface FileInfo {
  rel: string;
  size: number;
  kind: FileKind;
  executable: boolean;
  script: boolean;
}

export interface SkillDetail {
  files: FileInfo[];
  fileFlags: FileFlags;
  skillMd: string | null;
  skillMdTruncated: boolean;
}

export const listSkills = () => invoke<ListResult>('agent_skills_list');

export const skillDetail = (loc: Pick<SkillLocation, 'source' | 'id'>) =>
  invoke<SkillDetail>('agent_skills_detail', { source: loc.source, id: loc.id });

export const readSkillFile = (loc: Pick<SkillLocation, 'source' | 'id'>, rel: string) =>
  invoke<string>('agent_skills_read_file', { source: loc.source, id: loc.id, rel });

export const revealSkill = (loc: Pick<SkillLocation, 'source' | 'id'>) =>
  invoke<void>('agent_skills_reveal', { source: loc.source, id: loc.id });

export const revealFolder = (source: SourceId) => invoke<void>('agent_skills_reveal_folder', { source });

/** Los errores de Rust son un código (`not_found`, `binary`…): se traducen
 *  con `err.<código>` en la sección `agentSkills`. */
export function errorCode(err: unknown): string {
  const raw = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
  return /^[a-z_]{2,40}$/.test(raw) ? raw : 'unknown';
}
