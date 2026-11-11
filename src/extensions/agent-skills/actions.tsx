// Lo que se puede hacer con una skill: lo comparten los botones del detalle
// (`SkillActions`) y el menú del clic derecho (`SkillContextMenu`).

import { CirclePause, CirclePlay, Pencil, Share2, Trash2, type LucideIcon } from 'lucide-react';
import { SECONDARY_CLS } from '../../components/shared/controlClasses';
import type { Language } from '../../lib/i18n';
import { setSkillEnabled, shareSkill, type Tool } from './api';
import type { SkillItem } from './model';
import type { Tr } from './text';

/** La otra herramienta a la que se puede añadir una skill propia (SK13). */
export function shareTarget(item: SkillItem): Tool | null {
  if (item.entry.origin !== 'own' || item.entry.tools.length !== 1) return null;
  return item.entry.tools[0] === 'claude' ? 'codex' : 'claude';
}

export type RunAction = (action: () => Promise<unknown>, done: string, select?: string | null) => void;

/** Lo que se puede hacer con una skill, en el orden en que se muestra: lo
 *  usan los botones del detalle y el menú del clic derecho, para que
 *  ofrezcan lo mismo. Borrar va al final y aparte (`danger`). */
export interface SkillAction {
  id: 'edit' | 'share' | 'enable' | 'disable' | 'delete';
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  onSelect: () => void;
}

export function skillActions(
  item: SkillItem,
  { tr, language, run, onEdit, onDelete }: { tr: Tr; language: Language; run: RunAction; onEdit: () => void; onDelete: () => void },
): SkillAction[] {
  const e = item.entry;
  if (!e.editable) return [];
  const out: SkillAction[] = [];
  if (!e.primary.isLink && e.skillMd !== null) out.push({ id: 'edit', icon: Pencil, label: tr('action.edit'), onSelect: onEdit });
  const target = shareTarget(item);
  if (target) {
    out.push({
      id: 'share',
      icon: Share2,
      label: tr(`action.shareTo.${target}`),
      onSelect: () => run(() => shareSkill(language, e.primary, target), tr('done.shared', { tool: tr(`tool.${target}`) })),
    });
  }
  if (e.origin === 'disabled') {
    out.push({
      id: 'enable',
      icon: CirclePlay,
      label: tr('action.enable'),
      onSelect: () => {
        // Vuelve con la clave de su fuente de origen.
        const [src, name] = e.primary.id.split('/');
        run(() => setSkillEnabled(language, e.primary, true), tr('done.enabled'), `${src}:${name}`);
      },
    });
  } else {
    out.push({
      id: 'disable',
      icon: CirclePause,
      label: tr('action.disable'),
      onSelect: () => run(() => setSkillEnabled(language, e.primary, false), tr('done.disabled'), `disabled:${e.primary.source}/${e.primary.id}`),
    });
  }
  out.push({ id: 'delete', icon: Trash2, label: tr('action.delete'), danger: true, onSelect: onDelete });
  return out;
}

export function SkillActions({ actions }: { actions: SkillAction[] }) {
  return (
    <>
      {actions.map(({ id, icon: Icon, label, danger, onSelect }) => (
        <button
          key={id}
          type="button"
          // Borrar, aparte y al final: es la que no se deshace desde aquí.
          className={danger ? `${SECONDARY_CLS} ml-auto text-red-400 hover:bg-red-500/10` : SECONDARY_CLS}
          onClick={onSelect}
        >
          <Icon size={13} aria-hidden />
          {label}
        </button>
      ))}
    </>
  );
}
