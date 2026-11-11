// Detalle de una skill (specs/skills-de-agentes SK6–SK8): cabecera, avisos,
// acciones y las pestañas SKILL.md, Archivos y Ubicaciones. Lee el árbol y
// el SKILL.md completo al elegirla; los archivos, al abrirlos.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, File, FileCode2, FileWarning, FolderOpen, Link2 } from 'lucide-react';
import type { Language } from '../../lib/i18n';
import { CHIP, FOCUS_RING, ICON_BTN, PANEL_TITLE, SECONDARY_CLS } from '../../components/shared/controlClasses';
import { Spinner } from '../../components/shared/FormControls';
import { errorCode, readSkillFile, revealSkill, skillDetail, type FileInfo, type SkillDetail as Detail, type SkillLocation } from './api';
import { formatSize, localeOf, type SkillItem } from './model';
import { parseSkillMd } from './skillMd';
import { SkillMarkdown } from './SkillMarkdown';
import { dateTime, isMac, trCode, type Tr } from './text';
import { ToolBadges } from './ToolBadges';
import { WarningList } from './WarningList';
import { FrontmatterTable } from './FrontmatterTable';

type Tab = 'skill' | 'files' | 'locations';

function originLabel(item: SkillItem, tr: Tr): string {
  const e = item.entry;
  if (e.origin === 'plugin' && e.plugin) {
    const plugin = e.plugin.marketplace ? `${e.plugin.name}@${e.plugin.marketplace}` : e.plugin.name;
    return tr('origin.pluginOf', { plugin });
  }
  if (e.origin === 'external' && e.primary.broken) return tr('origin.broken');
  return trCode(tr, 'origin', e.origin, 'origin.own');
}

/** Cómo se gestiona una skill que Logday no cambia (SK1). */
function manageHint(item: SkillItem, tr: Tr): string | null {
  const e = item.entry;
  if (e.origin === 'plugin') return tr(e.primary.source === 'claude-plugin' ? 'manage.claudePlugin' : 'manage.codexPlugin');
  if (e.origin === 'synced') return tr('manage.synced');
  if (e.origin === 'system') return tr('manage.system');
  if (e.origin === 'admin') return tr('manage.admin');
  if (e.origin === 'external') return tr('manage.external');
  return null;
}

function fileIcon(f: FileInfo) {
  if (f.kind === 'symlink') return Link2;
  if (f.kind === 'binary') return FileWarning;
  if (f.script || f.executable) return FileCode2;
  return File;
}

function FilesTab({ item, detail, tr, language }: { item: SkillItem; detail: Detail; tr: Tr; language: Language }) {
  const [open, setOpen] = useState<string | null>(null);
  const [content, setContent] = useState<{ rel: string; text: string | null; error: string | null } | null>(null);
  const locale = localeOf(language);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setContent(null);
    readSkillFile(item.entry.primary, open)
      .then((text) => alive && setContent({ rel: open, text, error: null }))
      .catch((err) => alive && setContent({ rel: open, text: null, error: errorCode(err) }));
    return () => {
      alive = false;
    };
  }, [item.entry.primary, open]);

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border-card)]" aria-label={tr('filesLabel')}>
        {detail.files.map((f) => {
          const Icon = fileIcon(f);
          const openable = f.kind === 'text';
          const label = (
            <>
              <Icon size={13} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono">{f.rel}</span>
              {f.kind !== 'text' && <span className={CHIP}>{tr(`fileKind.${f.kind}`)}</span>}
              {(f.script || f.executable) && <span className={CHIP}>{tr('fileKind.script')}</span>}
              <span className="shrink-0 tabular-nums text-[var(--text-hint)]">{f.kind === 'symlink' ? '' : formatSize(f.size, locale)}</span>
            </>
          );
          return (
            <li key={f.rel}>
              {openable ? (
                <button
                  type="button"
                  aria-pressed={open === f.rel}
                  onClick={() => setOpen(open === f.rel ? null : f.rel)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] aria-pressed:bg-[var(--bg-hover)] ${FOCUS_RING}`}
                >
                  {label}
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-hint)]">{label}</div>
              )}
            </li>
          );
        })}
      </ul>
      {detail.fileFlags.truncated && <p className="text-xs text-[var(--text-hint)]">{tr('filesTruncated')}</p>}
      {open && (
        <section aria-label={open} className="rounded-lg border border-[var(--border-card)]">
          <p className="border-b border-[var(--border)] px-3 py-1.5 font-mono text-[11px] text-[var(--text-hint)]">{open}</p>
          {!content ? (
            <div className="p-3"><Spinner /></div>
          ) : content.error ? (
            <p className="p-3 text-xs text-red-400">{trCode(tr, 'err', content.error, 'err.unknown')}</p>
          ) : (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-[var(--text-primary)]">{content.text}</pre>
          )}
        </section>
      )}
    </div>
  );
}

function LocationsTab({ item, tr }: { item: SkillItem; tr: Tr }) {
  const [error, setError] = useState<string | null>(null);
  const reveal = (loc: SkillLocation) => {
    setError(null);
    revealSkill(loc).catch((err) => setError(errorCode(err)));
  };
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {item.entry.locations.map((loc) => (
          <li key={`${loc.source}:${loc.id}`} className="rounded-lg border border-[var(--border-card)] px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-primary)]">{trCode(tr, 'source', loc.source, 'source.claude')}</span>
              {loc.isLink && <span className={CHIP}>{tr(loc.broken ? 'linkBroken' : 'link')}</span>}
              <button type="button" onClick={() => reveal(loc)} className={`ml-auto ${ICON_BTN}`} aria-label={tr('revealAria', { path: loc.path })}>
                <FolderOpen size={13} aria-hidden />
              </button>
            </div>
            <p className="mt-1 break-all font-mono text-[11px] text-[var(--text-secondary)]">{loc.path}</p>
            {loc.linkTarget && (
              <p className="mt-0.5 break-all font-mono text-[11px] text-[var(--text-hint)]">→ {loc.linkTarget}</p>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-400" role="alert">{trCode(tr, 'err', error, 'err.unknown')}</p>}
    </div>
  );
}

export function SkillDetail({
  item,
  tr,
  language,
  onBack,
  actions,
}: {
  item: SkillItem;
  tr: Tr;
  language: Language;
  onBack?: () => void;
  /** Los botones que cambian la skill (fase 2): los pone la vista. */
  actions?: ReactNode;
}) {
  const e = item.entry;
  const readable = e.origin !== 'external';
  const [tab, setTab] = useState<Tab>(readable ? 'skill' : 'locations');
  const [raw, setRaw] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  useEffect(() => {
    setTab(readable ? 'skill' : 'locations');
    setDetail(null);
    setError(null);
    setRevealError(null);
    if (!readable) return;
    let alive = true;
    skillDetail(e.primary)
      .then((d) => alive && setDetail(d))
      .catch((err) => alive && setError(errorCode(err)));
    return () => {
      alive = false;
    };
    // La skill cambia por su clave; al recargar la lista llega otro objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.key, e.modifiedMs]);

  const md = detail?.skillMd ?? e.skillMd;
  const parsed = useMemo(() => (md !== null && md !== undefined ? parseSkillMd(md) : null), [md]);
  const hint = manageHint(item, tr);
  const locale = localeOf(language);
  const tabs: Tab[] = readable ? ['skill', 'files', 'locations'] : ['locations'];

  return (
    <article aria-labelledby="agent-skill-title" className="space-y-4 px-5 py-4">
      {onBack && (
        // Solo en ventana angosta: en la ancha la lista está al lado.
        <button type="button" onClick={onBack} className={`${ICON_BTN} -ml-1.5 @2xl/skills:hidden`}>
          <ArrowLeft size={14} aria-hidden />
          {tr('back')}
        </button>
      )}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="agent-skill-title" className="text-lg font-semibold text-[var(--text-primary)]">{item.name}</h2>
          <ToolBadges tools={e.tools} tr={tr} />
          <span className={CHIP}>{originLabel(item, tr)}</span>
        </div>
        {item.name !== e.dirName && <p className="font-mono text-[11px] text-[var(--text-hint)]">{tr('folderName', { dir: e.dirName })}</p>}
        {item.description && <p className="text-sm text-[var(--text-secondary)]">{item.description}</p>}
        {readable && (
          <p className="text-xs text-[var(--text-hint)]">
            {tr('meta', { n: e.fileCount, size: formatSize(e.sizeBytes, locale), date: e.modifiedMs ? dateTime(e.modifiedMs, language) : '—' })}
          </p>
        )}
        {hint && <p className="text-xs text-[var(--text-hint)]">{hint}</p>}
      </header>

      <div className="flex flex-wrap gap-2">
        {actions}
        <button
          type="button"
          className={SECONDARY_CLS}
          onClick={() => {
            setRevealError(null);
            revealSkill(e.primary).catch((err) => setRevealError(errorCode(err)));
          }}
        >
          <FolderOpen size={13} aria-hidden />
          {tr(isMac() ? 'reveal' : 'revealOther')}
        </button>
      </div>
      {revealError && <p className="text-xs text-red-400" role="alert">{trCode(tr, 'err', revealError, 'err.unknown')}</p>}

      <WarningList warnings={item.warnings} tr={tr} />

      <div role="tablist" aria-label={tr('tabsLabel')} className="flex gap-1 border-b border-[var(--border)]">
        {tabs.map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            id={`agent-skill-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`agent-skill-panel-${id}`}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-xs transition ${FOCUS_RING} ${
              tab === id ? 'border-indigo-500 text-[var(--text-primary)]' : 'border-transparent text-[var(--text-hint)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {tr(`tab.${id}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`agent-skill-panel-${tab}`} aria-labelledby={`agent-skill-tab-${tab}`}>
        {tab === 'locations' ? (
          <LocationsTab item={item} tr={tr} />
        ) : error ? (
          <p className="text-xs text-red-400" role="alert">{trCode(tr, 'err', error, 'err.unknown')}</p>
        ) : tab === 'files' ? (
          detail ? <FilesTab item={item} detail={detail} tr={tr} language={language} /> : <Spinner />
        ) : md === null || md === undefined ? (
          <p className="text-xs text-[var(--text-hint)]">{tr('noSkillMd')}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className={PANEL_TITLE}>SKILL.md</p>
              <div className="ml-auto flex rounded-lg border border-[var(--border-card)] p-0.5 text-[11px]" role="group" aria-label={tr('viewModeLabel')}>
                {[false, true].map((isRaw) => (
                  <button
                    key={String(isRaw)}
                    type="button"
                    aria-pressed={raw === isRaw}
                    onClick={() => setRaw(isRaw)}
                    className={`rounded-md px-2 py-0.5 ${FOCUS_RING} ${raw === isRaw ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-hint)]'}`}
                  >
                    {tr(isRaw ? 'viewRaw' : 'viewRendered')}
                  </button>
                ))}
              </div>
            </div>
            {(detail?.skillMdTruncated ?? e.skillMdTruncated) && <p className="text-xs text-[var(--text-hint)]">{tr('skillMdTruncated')}</p>}
            {raw || !parsed ? (
              <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--border-card)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text-primary)]">{md}</pre>
            ) : (
              <>
                <FrontmatterTable fm={parsed.frontmatter} tr={tr} />
                {parsed.yamlError && <p className="text-xs text-red-400">{tr('yamlError', { message: parsed.yamlError })}</p>}
                <SkillMarkdown markdown={parsed.body} imageLabel={(alt) => tr('imageNotLoaded', { alt: alt || '—' })} />
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
