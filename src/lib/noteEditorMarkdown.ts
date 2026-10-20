import type { MutableRefObject } from 'react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet, Decoration } from '@tiptap/pm/view';
import type { Task } from '../types/task';

// ── Task-code decoration plugin (display-only, no toca el markdown) ────────
const taskCodePluginKey = new PluginKey<DecorationSet>('taskCodeDecorations');
const TASK_CODE_RE = /#([A-Z0-9\-_]+)/gi;

export function createTaskCodePlugin(tasksRef: MutableRefObject<Task[]>): Plugin {
  return new Plugin({
    key: taskCodePluginKey,
    props: {
      decorations(state) {
        const tasksByCode = new Map(
          (tasksRef.current ?? [])
            .filter((t) => t.taskCode)
            .map((t) => [t.taskCode!.toUpperCase(), t])
        );
        if (tasksByCode.size === 0) return DecorationSet.empty;
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (!node.isText || !node.text) return;
          TASK_CODE_RE.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = TASK_CODE_RE.exec(node.text)) !== null) {
            const code = match[1].toUpperCase();
            if (!tasksByCode.has(code)) continue;
            const from = pos + match.index;
            const to = from + match[0].length;
            decorations.push(
              Decoration.inline(from, to, {
                class: 'task-code-link',
                'data-task-code': code,
                title: tasksByCode.get(code)!.title,
              })
            );
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

export function normalizeEditorMarkdown(raw: string): string {
  if (!raw) return raw;

  const lines = raw.split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }

    if (inFence || i === lines.length - 1) continue;

    const match = line.match(/(\\+)$/);
    if (!match) continue;

    // tiptap-markdown serializa hard breaks como "\\\n".
    // Si hay un numero impar de barras al final de la linea, quitamos una.
    const trailing = match[1];
    if (trailing.length % 2 === 1) {
      lines[i] = line.slice(0, -1);
    }
  }

  const normalized = lines.join('\n');

  // Fuerza enlaces autolink (<https://...>) a formato explicito [url](url)
  // para mantener consistencia con la vista markdown solicitada.
  return normalized.replace(/<((?:https?:\/\/)[^\s<>]+)>/g, '[$1]($1)');
}
