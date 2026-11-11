// Borrar una skill (specs/skills-de-agentes SK11). La carpeta real va a la
// papelera; un enlace se quita, nunca su destino. Si la skill está en
// varias herramientas (la real y enlaces), se elige: quitarla solo de una
// (se quita ese enlace) o borrarla de todas.
import { Trash2 } from 'lucide-react';
import { SECONDARY_CLS } from '../../components/shared/controlClasses';
import type { SkillLocation, TrashScope } from './api';
import type { SkillItem } from './model';
import { SkillModal } from './SkillModal';
import type { Tr } from './text';

export interface TrashChoice {
  loc: SkillLocation;
  scope: TrashScope;
}

/** Lo que se puede elegir al borrar: quitar cada enlace solo, y borrar la
 *  carpeta real con todos sus enlaces. */
export function trashChoices(item: SkillItem): { links: SkillLocation[]; all: TrashChoice } {
  // La principal es la real si hay una; los demás son enlaces a ella.
  const links = item.entry.primary.isLink ? [] : item.entry.locations.filter((l) => l.isLink);
  return { links, all: { loc: item.entry.primary, scope: 'all' } };
}

const DANGER = 'rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400';

export function DeleteSkillModal({ item, tr, onCancel, onConfirm }: { item: SkillItem; tr: Tr; onCancel: () => void; onConfirm: (c: TrashChoice) => void }) {
  const { links, all } = trashChoices(item);
  const isLinkOnly = item.entry.primary.isLink;
  return (
    <SkillModal
      title={tr('delete.title', { name: item.name })}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={SECONDARY_CLS} onClick={onCancel}>{tr('cancel')}</button>
          <button type="button" className={DANGER} onClick={() => onConfirm(isLinkOnly ? { loc: item.entry.primary, scope: 'location' } : all)}>
            <span className="flex items-center gap-1.5">
              <Trash2 size={13} aria-hidden />
              {tr(isLinkOnly ? 'delete.removeLink' : links.length ? 'delete.all' : 'delete.confirm')}
            </span>
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs text-[var(--text-secondary)]">
        <p>{tr(isLinkOnly ? 'delete.linkMessage' : 'delete.message')}</p>
        {links.length > 0 && !isLinkOnly && (
          <div className="space-y-2">
            <p>{tr('delete.sharedMessage')}</p>
            {links.map((l) => (
              <button key={`${l.source}:${l.id}`} type="button" className={`${SECONDARY_CLS} w-full justify-start`} onClick={() => onConfirm({ loc: l, scope: 'location' })}>
                {tr('delete.onlyFrom', { tool: tr(`tool.${l.tool}`), path: l.path })}
              </button>
            ))}
          </div>
        )}
      </div>
    </SkillModal>
  );
}
