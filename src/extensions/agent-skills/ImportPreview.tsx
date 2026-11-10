// Vista previa antes de instalar (specs/skills-de-agentes SK15): lo
// preparado por Rust, con los avisos, el SKILL.md y cada archivo de texto
// abrible; el nombre de destino, las herramientas y si se reemplaza. Al
// instalar, Rust comprueba la huella (SK18) y pide la confirmación nativa.
import { useEffect, useMemo, useState } from 'react';
import { FOCUS_RING, INPUT_CLS, SECONDARY_CLS, SEND_BTN } from '../../components/shared/controlClasses';
import { Spinner } from '../../components/shared/FormControls';
import type { Language } from '../../lib/i18n';
import { discardStaged, errorCode, installStaged, readStagedFile, type SkillRef, type StagedBundle, type StagedSkill, type Tool } from './api';
import { computeWarnings, formatSize, localeOf, suggestName } from './model';
import { isPortableName, parseSkillMd } from './skillMd';
import { FrontmatterTable } from './FrontmatterTable';
import { SkillMarkdown } from './SkillMarkdown';
import { SkillModal } from './SkillModal';
import { ToolBadges } from './ToolBadges';
import { WarningList } from './WarningList';
import { trCode, type Tr } from './text';

export interface ImportRow {
  skill: StagedSkill;
  selected: boolean;
  name: string;
  tools: Tool[];
  replace: boolean;
}

/** Para instalar o actualizar desde el catálogo de un repo: cuáles se
 *  eligen, con qué nombre y si reemplazan. */
export interface ImportPreset {
  rel: string;
  /** Sin él, el sugerido (el `name` del frontmatter o la carpeta). */
  name?: string;
  replace: boolean;
  tools?: Tool[];
}

export function initialRows(bundle: StagedBundle, preset?: ImportPreset[]): ImportRow[] {
  return bundle.skills.map((skill) => {
    const fm = skill.skillMd ? parseSkillMd(skill.skillMd).name : null;
    const name = fm && isPortableName(fm) ? fm : suggestName(skill.dirName);
    const installable = !!skill.hash && !skill.tooLarge;
    const p = preset?.find((x) => x.rel === skill.rel);
    if (preset) {
      return { skill, selected: installable && !!p, name: p?.name ?? name, tools: p?.tools ?? ['claude', 'codex'], replace: p?.replace ?? false };
    }
    return { skill, selected: installable, name, tools: ['claude', 'codex'], replace: false };
  });
}

function rows0(bundle: StagedBundle, preset: ImportPreset[]): number {
  return bundle.skills.findIndex((s) => preset.some((p) => p.rel === s.rel));
}

export type RowProblem = 'tooLarge' | 'nameInvalid' | 'nameDuplicated' | 'toolsRequired' | 'needsReplace';

/** Qué impide instalar una fila elegida (claves `import.problem.*`). */
export function rowProblem(row: ImportRow, rows: ImportRow[], taken: Record<Tool, Set<string>>): RowProblem | null {
  if (!row.skill.hash || row.skill.tooLarge) return 'tooLarge';
  if (!isPortableName(row.name)) return 'nameInvalid';
  if (rows.some((r) => r.skill.rel !== row.skill.rel && r.selected && r.name === row.name)) return 'nameDuplicated';
  if (!row.tools.length) return 'toolsRequired';
  if (!row.replace && row.tools.some((t) => taken[t].has(row.name))) return 'needsReplace';
  return null;
}

function StagedFiles({ bundleId, skill, tr, language }: { bundleId: string; skill: StagedSkill; tr: Tr; language: Language }) {
  const [open, setOpen] = useState<string | null>(null);
  const [content, setContent] = useState<{ text: string | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setContent(null);
    readStagedFile(bundleId, skill.rel, open)
      .then((text) => alive && setContent({ text, error: null }))
      .catch((err) => alive && setContent({ text: null, error: errorCode(err) }));
    return () => {
      alive = false;
    };
  }, [bundleId, skill.rel, open]);
  const locale = localeOf(language);
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border-card)]" aria-label={tr('filesLabel')}>
        {skill.files.map((f) => (
          <li key={f.rel}>
            <button
              type="button"
              disabled={f.kind !== 'text'}
              aria-pressed={open === f.rel}
              onClick={() => setOpen(open === f.rel ? null : f.rel)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] enabled:hover:bg-[var(--bg-hover)] disabled:text-[var(--text-hint)] aria-pressed:bg-[var(--bg-hover)] ${FOCUS_RING}`}
            >
              <span className="min-w-0 flex-1 truncate font-mono">{f.rel}</span>
              {f.kind !== 'text' && <span className="text-[10px]">{tr(`fileKind.${f.kind}`)}</span>}
              {f.script && <span className="text-[10px] text-amber-400">{tr('fileKind.script')}</span>}
              <span className="tabular-nums text-[var(--text-hint)]">{formatSize(f.size, locale)}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="rounded-lg border border-[var(--border-card)]">
          <p className="border-b border-[var(--border)] px-3 py-1.5 font-mono text-[11px] text-[var(--text-hint)]">{open}</p>
          {!content ? (
            <div className="p-3"><Spinner /></div>
          ) : content.error ? (
            <p className="p-3 text-xs text-red-400">{trCode(tr, 'err', content.error, 'err.unknown')}</p>
          ) : (
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed">{content.text}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ImportPreview({
  bundle,
  taken,
  tr,
  language,
  onClose,
  preset,
  keepStaged = false,
}: {
  bundle: StagedBundle;
  preset?: ImportPreset[];
  /** Lo preparado es el catálogo de un repo: no se borra al cerrar. */
  keepStaged?: boolean;
  taken: Record<Tool, Set<string>>;
  tr: Tr;
  language: Language;
  /** Con lo instalado, o `null` si se cerró sin instalar. */
  onClose: (installed: SkillRef[] | null) => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>(() => initialRows(bundle, preset));
  // Con preset, se abre en la primera elegida.
  const [focus, setFocus] = useState(() => Math.max(0, preset ? rows0(bundle, preset) : 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const row = rows[focus];
  const parsed = useMemo(() => (row?.skill.skillMd ? parseSkillMd(row.skill.skillMd) : null), [row?.skill.skillMd]);
  const { warnings } = useMemo(
    () => (row ? computeWarnings({ parsed, dirName: row.name, fileFlags: row.skill.fileFlags }) : { warnings: [] }),
    [parsed, row],
  );
  const selected = rows.filter((r) => r.selected);
  const problems = rows.map((r) => (r.selected ? rowProblem(r, rows, taken) : null));
  const canInstall = selected.length > 0 && problems.every((p) => p === null) && !busy;

  const update = (i: number, patch: Partial<ImportRow>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const cancel = () => {
    if (!keepStaged) void discardStaged(bundle.id).catch(() => undefined);
    onClose(null);
  };

  const install = async () => {
    if (!canInstall) return;
    setBusy(true);
    setError(null);
    try {
      const done = await installStaged(
        language,
        bundle.id,
        selected.map((r) => ({ rel: r.skill.rel, name: r.name, tools: r.tools, replace: r.replace, expectedHash: r.skill.hash as string })),
      );
      // Lo que no se instaló sigue preparado: se borra (salvo el catálogo
      // de un repo, que sigue abierto).
      if (!keepStaged) void discardStaged(bundle.id).catch(() => undefined);
      onClose(done);
    } catch (err) {
      const code = errorCode(err);
      if (code !== 'cancelled') setError(code);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SkillModal
      wide
      title={tr('import.title')}
      onClose={cancel}
      footer={
        <>
          {error && <p className="mr-auto text-xs text-red-400" role="alert">{trCode(tr, 'err', error, 'err.unknown')}</p>}
          <button type="button" className={SECONDARY_CLS} onClick={cancel}>{tr('cancel')}</button>
          <button type="button" className={SEND_BTN} aria-disabled={!canInstall} onClick={() => void install()}>
            {selected.length > 1 ? tr('import.installN', { n: selected.length }) : tr('import.install')}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        <p className="text-[var(--text-hint)]">
          {tr('import.from', { origin: bundle.origin.label })} · {tr('import.found', { n: bundle.skills.length })}
        </p>
        {bundle.skipped.length > 0 && (
          <details className="rounded-lg border border-[var(--border-card)] px-3 py-2">
            <summary className="cursor-pointer text-[var(--text-secondary)]">{tr('import.skipped', { n: bundle.skipped.length })}</summary>
            <ul className="mt-1 list-disc pl-5 font-mono text-[11px] text-[var(--text-hint)]">
              {bundle.skipped.slice(0, 50).map((s) => <li key={s}>{s}</li>)}
            </ul>
          </details>
        )}
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          {rows.length > 1 && (
            <ul className="space-y-1" aria-label={tr('import.listLabel')}>
              {rows.map((r, i) => (
                <li key={r.skill.rel} className={`flex items-center gap-2 rounded-md px-2 py-1 ${i === focus ? 'bg-[var(--bg-hover)]' : ''}`}>
                  <input
                    type="checkbox"
                    checked={r.selected}
                    disabled={!r.skill.hash || r.skill.tooLarge}
                    onChange={(e) => update(i, { selected: e.target.checked })}
                    aria-label={tr('import.selectAria', { name: r.name })}
                    className={FOCUS_RING}
                  />
                  <button type="button" onClick={() => setFocus(i)} className={`min-w-0 flex-1 truncate text-left ${FOCUS_RING}`}>
                    {r.name || r.skill.dirName}
                  </button>
                  {problems[i] && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" aria-label={tr(`import.problem.${problems[i]}`)} role="img" />}
                </li>
              ))}
            </ul>
          )}
          {row && (
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="block space-y-1">
                  <span className="block font-medium text-[var(--text-secondary)]">{tr('import.name')}</span>
                  <input
                    value={row.name}
                    onChange={(e) => update(focus, { name: e.target.value.toLowerCase() })}
                    spellCheck={false}
                    className={`${INPUT_CLS} w-56 font-mono`}
                  />
                </label>
                <fieldset className="flex items-center gap-3">
                  <legend className="sr-only">{tr('new.tools')}</legend>
                  {(['claude', 'codex'] as Tool[]).map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={row.tools.includes(t)}
                        onChange={() => update(focus, { tools: row.tools.includes(t) ? row.tools.filter((x) => x !== t) : [...row.tools, t].sort() })}
                        className={FOCUS_RING}
                      />
                      {tr(`tool.${t}`)}
                    </label>
                  ))}
                </fieldset>
                {row.tools.some((t) => taken[t].has(row.name)) && (
                  <label className="flex items-center gap-1.5 text-amber-400">
                    <input type="checkbox" checked={row.replace} onChange={(e) => update(focus, { replace: e.target.checked })} className={FOCUS_RING} />
                    {tr('import.replace')}
                  </label>
                )}
              </div>
              {problems[focus] && <p className="text-red-400">{tr(`import.problem.${problems[focus]}`)}</p>}
              <p className="text-[var(--text-hint)]">
                <ToolBadges tools={row.tools} tr={tr} /> {tr('import.meta', { n: row.skill.files.length, size: formatSize(row.skill.sizeBytes, localeOf(language)) })}
              </p>
              <WarningList warnings={warnings} tr={tr} />
              {parsed ? (
                <div className="space-y-2 rounded-lg border border-[var(--border-card)] p-3">
                  <FrontmatterTable fm={parsed.frontmatter} tr={tr} />
                  <SkillMarkdown markdown={parsed.body} imageLabel={(alt) => tr('imageNotLoaded', { alt: alt || '—' })} />
                </div>
              ) : (
                <p className="text-[var(--text-hint)]">{tr('noSkillMd')}</p>
              )}
              <StagedFiles bundleId={bundle.id} skill={row.skill} tr={tr} language={language} />
            </div>
          )}
        </div>
      </div>
    </SkillModal>
  );
}
