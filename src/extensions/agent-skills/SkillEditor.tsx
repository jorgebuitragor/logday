// Editor del SKILL.md (specs/skills-de-agentes SK10): texto plano con los
// avisos del frontmatter en vivo. Guarda con la huella del archivo que se
// abrió: si cambió en disco, pregunta antes de pisarlo. La primera vez por
// skill y sesión, Rust pide la confirmación nativa (SK29).
import { useEffect, useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';
import { SECONDARY_CLS, SEND_BTN } from '../../components/shared/controlClasses';
import { Spinner } from '../../components/shared/FormControls';
import type { Language } from '../../lib/i18n';
import { errorCode, saveSkillMd, skillDetail } from './api';
import { computeWarnings, type SkillItem } from './model';
import { parseSkillMd } from './skillMd';
import { WarningList } from './WarningList';
import { trCode, type Tr } from './text';

type Loaded = { text: string; hash: string | null };

export function SkillEditor({
  item,
  tr,
  language,
  onDone,
}: {
  item: SkillItem;
  tr: Tr;
  language: Language;
  /** `saved`: si se guardó algo. */
  onDone: (saved: boolean) => void;
}) {
  const loc = item.entry.primary;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changedOnDisk, setChangedOnDisk] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const load = async () => {
    setError(null);
    setChangedOnDisk(false);
    try {
      const d = await skillDetail(loc);
      if (d.skillMdTruncated || d.skillMd === null) {
        setError(d.skillMdTruncated ? 'edit_too_large' : 'not_found');
        return;
      }
      setLoaded({ text: d.skillMd, hash: d.skillMdHash });
      setText(d.skillMd);
    } catch (err) {
      setError(errorCode(err));
    }
  };

  useEffect(() => {
    void load();
    // Se carga una vez al abrir; "Volver a cargar" llama a `load`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.key]);

  const parsed = useMemo(() => parseSkillMd(text), [text]);
  const { warnings } = useMemo(
    () => computeWarnings({ parsed, dirName: item.entry.dirName, fileFlags: item.entry.fileFlags }),
    [parsed, item.entry.dirName, item.entry.fileFlags],
  );
  const dirty = loaded !== null && text !== loaded.text;

  const save = async (force: boolean) => {
    if (!loaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveSkillMd(language, loc, text, loaded.hash, force);
      onDone(true);
    } catch (err) {
      const code = errorCode(err);
      if (code === 'changed_on_disk') setChangedOnDisk(true);
      else if (code !== 'cancelled') setError(code);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (dirty) setConfirmDiscard(true);
    else onDone(false);
  };

  return (
    <section aria-labelledby="agent-skill-editor-title" className="flex min-h-full flex-col gap-3 px-5 py-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="agent-skill-editor-title" className="text-sm font-semibold text-[var(--text-primary)]">
          {tr('edit.title', { name: item.name })}
        </h2>
        <span className="font-mono text-[11px] text-[var(--text-hint)]">{loc.path}/SKILL.md</span>
        <div className="ml-auto flex gap-2">
          <button type="button" className={SECONDARY_CLS} onClick={cancel}>
            <X size={13} aria-hidden />
            {tr('cancel')}
          </button>
          <button type="button" className={SEND_BTN} aria-disabled={!dirty || busy} onClick={() => dirty && void save(false)}>
            <Save size={13} aria-hidden />
            {tr('edit.save')}
          </button>
        </div>
      </header>
      {changedOnDisk && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-[var(--text-primary)]">
          <span className="flex-1">{tr('edit.changedOnDisk')}</span>
          <button type="button" className={SECONDARY_CLS} onClick={() => void load()}>{tr('edit.reload')}</button>
          <button type="button" className={SECONDARY_CLS} onClick={() => void save(true)}>{tr('edit.overwrite')}</button>
        </div>
      )}
      {confirmDiscard && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-card)] px-3 py-2 text-xs">
          <span className="flex-1 text-[var(--text-primary)]">{tr('edit.discardQuestion')}</span>
          <button type="button" className={SECONDARY_CLS} onClick={() => setConfirmDiscard(false)}>{tr('edit.keepEditing')}</button>
          <button type="button" className={SECONDARY_CLS} onClick={() => onDone(false)}>{tr('edit.discard')}</button>
        </div>
      )}
      {error && <p className="text-xs text-red-400" role="alert">{trCode(tr, 'err', error, 'err.unknown')}</p>}
      {!loaded ? (
        !error && <Spinner />
      ) : (
        <>
          <WarningList warnings={warnings} tr={tr} />
          <label className="flex min-h-[320px] flex-1 flex-col">
            <span className="sr-only">SKILL.md</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // ⌘S / Ctrl+S guarda.
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                  e.preventDefault();
                  if (dirty) void save(false);
                }
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="min-h-[320px] flex-1 resize-none rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] p-3 font-mono text-xs leading-relaxed text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            />
          </label>
        </>
      )}
    </section>
  );
}
