// Inicio de la vista, cuando no hay una skill elegida: las formas de añadir
// skills a la vista (carpeta, .zip, nueva, GitHub), dónde soltar, y las
// que tienen avisos para revisarlas.
import type { ReactNode, CSSProperties } from 'react';
import { FileArchive, FileText, FolderInput, GitBranch, Plus, ShieldAlert, Upload } from 'lucide-react';
import { FOCUS_RING } from '../../components/shared/controlClasses';
import type { SkillItem } from './model';
import { ToolBadges } from './ToolBadges';
import type { Tr } from './text';
import type { ImportKind } from './api';

function ActionCard({ icon, title, help, onClick, index }: { icon: ReactNode; title: string; help: string; onClick: () => void; index: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ '--skl-delay': `${60 + index * 40}ms` } as CSSProperties}
      className={`skl-card skl-card-in flex items-start gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-3 text-left hover:border-indigo-500/60 hover:bg-[var(--bg-hover)] ${FOCUS_RING}`}
    >
      <span className="skl-card-icon mt-0.5 rounded-lg bg-indigo-500/10 p-1.5 text-indigo-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--text-hint)]">{help}</span>
      </span>
    </button>
  );
}

export function SkillsHome({
  items,
  tr,
  onImport,
  onNew,
  onRepos,
  onSelect,
}: {
  items: SkillItem[];
  tr: Tr;
  onImport: (kind: ImportKind) => void;
  onNew: () => void;
  onRepos: () => void;
  onSelect: (key: string) => void;
}) {
  const own = items.filter((it) => it.group === 'own' || it.group === 'disabled').length;
  const risky = items.filter((it) => it.risky && (it.group === 'own' || it.group === 'disabled'));
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{tr('home.title')}</h2>
        <p className="text-sm text-[var(--text-secondary)]">{tr('home.subtitle')}</p>
        {items.length > 0 && <p className="text-xs text-[var(--text-hint)]">{tr('home.counts', { n: items.length, own })}</p>}
      </header>

      <section aria-labelledby="agent-skills-home-add" className="space-y-2">
        <h3 id="agent-skills-home-add" className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]">{tr('home.add')}</h3>
        <div className="grid gap-2 @lg/skills:grid-cols-2">
          <ActionCard icon={<FolderInput size={16} aria-hidden />} title={tr('home.folder')} help={tr('home.folderHelp')} onClick={() => onImport('folder')} index={0} />
          <ActionCard icon={<FileArchive size={16} aria-hidden />} title={tr('home.zip')} help={tr('home.zipHelp')} onClick={() => onImport('zip')} index={1} />
          <ActionCard icon={<FileText size={16} aria-hidden />} title={tr('home.md')} help={tr('home.mdHelp')} onClick={() => onImport('md')} index={2} />
          <ActionCard icon={<GitBranch size={16} aria-hidden />} title={tr('home.github')} help={tr('home.githubHelp')} onClick={onRepos} index={3} />
          <ActionCard icon={<Plus size={16} aria-hidden />} title={tr('home.new')} help={tr('home.newHelp')} onClick={onNew} index={4} />
        </div>
        <div className="skl-card-in flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-card)] px-4 py-5 text-xs text-[var(--text-hint)]" style={{ '--skl-delay': '280ms' } as CSSProperties}>
          <Upload size={14} aria-hidden />
          {tr('home.drop')}
        </div>
      </section>

      {risky.length > 0 && (
        <section aria-labelledby="agent-skills-home-review" className="space-y-2">
          <h3 id="agent-skills-home-review" className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]">{tr('home.review')}</h3>
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border-card)]">
            {risky.slice(0, 5).map((it) => (
              <li key={it.key}>
                <button type="button" onClick={() => onSelect(it.key)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)] ${FOCUS_RING}`}>
                  <ShieldAlert size={13} className="shrink-0 text-amber-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{it.name}</span>
                  <span className="shrink-0 text-[var(--text-hint)]">{tr('home.warningsN', { n: it.warnings.length })}</span>
                  <ToolBadges tools={it.entry.tools} tr={tr} compact />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
