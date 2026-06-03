import { Task, TaskStatus, Note } from '../types';

/**
 * Parses a markdown file with YAML frontmatter.
 * Returns the parsed metadata and content body.
 */
export function parseFrontmatter(raw: string, filePath: string): Task | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const yamlStr = match[1];
  const content = match[2].trim();
  const data: Record<string, string | string[]> = {};

  for (const line of yamlStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1).trim();
      data[key] = inner
        ? inner.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        : [];
    } else {
      data[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }

  const id = (data.id as string) || '';
  const title = (data.title as string) || 'Untitled';
  const taskCode = (data.task_code as string) || undefined;
  const status = ((data.status as string) || 'todo') as TaskStatus;
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const project = (data.project as string) || 'inbox';
  const created = (data.created as string) || new Date().toISOString().slice(0, 10);
  const completedAt = (data.completed_at as string) || undefined;
  const due = (data.due as string) || undefined;
  const linked_paths = Array.isArray(data.linked_paths) ? data.linked_paths : [];

  if (!id) return null;

  return { id, title, taskCode, status, tags, project, created, completedAt, due, linked_paths, content, filePath };
}

/**
 * Serializes a Task back to a markdown string with YAML frontmatter.
 */
export function serializeTask(task: Task): string {
  const lines: string[] = ['---'];

  lines.push(`id: ${task.id}`);
  lines.push(`title: "${task.title.replace(/"/g, '\\"')}"`);
  if (task.taskCode) {
    lines.push(`task_code: ${task.taskCode}`);
  }
  lines.push(`status: ${task.status}`);

  if (task.tags.length > 0) {
    lines.push(`tags: [${task.tags.map((t) => `"${t}"`).join(', ')}]`);
  } else {
    lines.push('tags: []');
  }

  lines.push(`project: ${task.project}`);
  lines.push(`created: ${task.created}`);

  if (task.completedAt) {
    lines.push(`completed_at: ${task.completedAt}`);
  }

  if (task.due) {
    lines.push(`due: ${task.due}`);
  }

  if (task.linked_paths.length > 0) {
    lines.push(`linked_paths: [${task.linked_paths.map((p) => `"${p}"`).join(', ')}]`);
  } else {
    lines.push('linked_paths: []');
  }

  lines.push('---');
  lines.push('');
  lines.push(task.content);

  return lines.join('\n');
}

/** Format YYYY-MM-DD from a Date object */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD string to Date */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Parses a Note markdown file with YAML frontmatter.
 */
export function parseNote(raw: string, filePath: string): Note | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const yamlStr = match[1];
  const content = match[2].trim();
  const data: Record<string, string | string[] | boolean> = {};

  for (const line of yamlStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (val === 'true') {
      data[key] = true;
    } else if (val === 'false') {
      data[key] = false;
    } else if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1).trim();
      data[key] = inner
        ? inner.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        : [];
    } else {
      data[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }

  const id = (data.id as string) || '';
  if (!id) return null;

  const today = formatDate(new Date());
  return {
    id,
    title: (data.title as string) || 'Sin título',
    folder: (data.folder as string) || '',
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    created: (data.created as string) || today,
    updated: (data.updated as string) || today,
    pinned: (data.pinned as boolean) || false,
    content,
    filePath,
  };
}

/**
 * Serializes a Note back to markdown with YAML frontmatter.
 */
export function serializeNote(note: Note): string {
  const lines: string[] = ['---'];
  lines.push(`id: ${note.id}`);
  lines.push(`title: "${note.title.replace(/"/g, '\\"')}"`);
  lines.push(`folder: "${note.folder}"`);
  if (note.tags.length > 0) {
    lines.push(`tags: [${note.tags.map((t) => `"${t}"`).join(', ')}]`);
  } else {
    lines.push('tags: []');
  }
  lines.push(`created: ${note.created}`);
  lines.push(`updated: ${note.updated}`);
  lines.push(`pinned: ${note.pinned}`);
  lines.push('---');
  lines.push('');
  lines.push(note.content);
  return lines.join('\n');
}
