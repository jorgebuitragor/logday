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
  /** sha256 del SKILL.md en disco, para guardar sin pisar cambios de
   *  fuera (SK10). */
  skillMdHash: string | null;
}

export const listSkills = () => invoke<ListResult>('agent_skills_list');

export const skillDetail = (loc: Pick<SkillLocation, 'source' | 'id'>) =>
  invoke<SkillDetail>('agent_skills_detail', { source: loc.source, id: loc.id });

export const readSkillFile = (loc: Pick<SkillLocation, 'source' | 'id'>, rel: string) =>
  invoke<string>('agent_skills_read_file', { source: loc.source, id: loc.id, rel });

export const revealSkill = (loc: Pick<SkillLocation, 'source' | 'id'>) =>
  invoke<void>('agent_skills_reveal', { source: loc.source, id: loc.id });

export const revealFolder = (source: SourceId) => invoke<void>('agent_skills_reveal_folder', { source });

// ─── Fase 2: cambiar (SK9–SK18). Lo que agrega contenido pide además un
// diálogo nativo desde Rust (SK29); si el usuario dice que no, el error es
// `cancelled`, que la vista no muestra. `lang` elige el idioma de ese
// diálogo, cuyos textos pone Rust. ───

type Loc = Pick<SkillLocation, 'source' | 'id'>;

export interface SkillRef {
  source: SourceId;
  id: string;
}

export const createSkill = (lang: string, name: string, content: string, tools: Tool[]) =>
  invoke<SkillRef>('agent_skills_create', { lang, name, content, tools });

export const saveSkillMd = (lang: string, loc: Loc, content: string, expectedHash: string | null, force: boolean) =>
  invoke<void>('agent_skills_save', { lang, source: loc.source, id: loc.id, content, expectedHash, force });

export type TrashScope = 'location' | 'all';

export const trashSkill = (loc: Loc, scope: TrashScope) =>
  invoke<void>('agent_skills_trash', { source: loc.source, id: loc.id, scope });

export const setSkillEnabled = (lang: string, loc: Loc, enabled: boolean) =>
  invoke<void>('agent_skills_set_enabled', { lang, source: loc.source, id: loc.id, enabled });

export const shareSkill = (lang: string, loc: Loc, to: Tool) =>
  invoke<void>('agent_skills_share', { lang, source: loc.source, id: loc.id, to });

export interface StagedOrigin {
  kind: 'folder' | 'zip' | 'github';
  label: string;
}

export interface StagedSkill {
  rel: string;
  dirName: string;
  skillMd: string | null;
  files: FileInfo[];
  fileFlags: FileFlags;
  sizeBytes: number;
  hash: string | null;
  tooLarge: boolean;
}

export interface StagedBundle {
  id: string;
  origin: StagedOrigin;
  skills: StagedSkill[];
  skipped: string[];
}

export const importPick = (kind: 'folder' | 'zip') => invoke<StagedBundle | null>('agent_skills_import_pick', { kind });

export const readStagedFile = (id: string, rel: string, file: string) => invoke<string>('agent_skills_staged_read', { id, rel, file });

export interface InstallItem {
  rel: string;
  name: string;
  tools: Tool[];
  replace: boolean;
  expectedHash: string;
}

/** Instala varias de lo preparado con un solo diálogo nativo. */
export const installStaged = (lang: string, id: string, items: InstallItem[]) =>
  invoke<SkillRef[]>('agent_skills_install', { lang, id, items });

export const discardStaged = (id: string) => invoke<void>('agent_skills_discard', { id });

/** Los errores de Rust son un código (`not_found`, `binary`…): se traducen
 *  con `err.<código>` en la sección `agentSkills`. */
export function errorCode(err: unknown): string {
  const raw = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
  return /^[a-z_]{2,40}$/.test(raw) ? raw : 'unknown';
}
