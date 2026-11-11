// Nueva skill (specs/skills-de-agentes SK9): nombre (validado mientras se
// escribe), descripción y herramientas. Crea con la plantilla y abre el
// editor. Rust pide la confirmación nativa (SK29).
import { useMemo, useState } from 'react';
import { FOCUS_RING, INPUT_CLS, SECONDARY_CLS, SEND_BTN } from '../../components/shared/controlClasses';
import type { Language } from '../../lib/i18n';
import { createSkill, errorCode, type SkillRef, type Tool } from './api';
import { DESCRIPTION_MAX, isPortableName, NAME_MAX } from './skillMd';
import { skillTemplate } from './template';
import { SkillModal } from './SkillModal';
import { trCode, type Tr } from './text';

export interface NewSkillCheck {
  name: string | null;
  description: string | null;
  tools: string | null;
}

/** Qué falta para poder crear (claves de texto), o `null` si nada. */
export function checkNewSkill(name: string, description: string, tools: Tool[], taken: Record<Tool, Set<string>>): NewSkillCheck {
  const nameErr = !name
    ? 'new.nameRequired'
    : !isPortableName(name)
      ? 'new.nameInvalid'
      : tools.some((t) => taken[t].has(name))
        ? 'new.nameTaken'
        : null;
  const descErr = !description.trim() ? 'new.descriptionRequired' : description.length > DESCRIPTION_MAX ? 'new.descriptionTooLong' : null;
  return { name: nameErr, description: descErr, tools: tools.length ? null : 'new.toolsRequired' };
}

export function NewSkillModal({
  tr,
  language,
  taken,
  onClose,
  onCreated,
}: {
  tr: Tr;
  language: Language;
  taken: Record<Tool, Set<string>>;
  onClose: () => void;
  onCreated: (ref: SkillRef) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tools, setTools] = useState<Tool[]>(['claude', 'codex']);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useMemo(() => checkNewSkill(name, description, tools, taken), [name, description, tools, taken]);
  const valid = !check.name && !check.description && !check.tools;

  const submit = async () => {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ref = await createSkill(language, name, skillTemplate(name, description, language), tools);
      onCreated(ref);
    } catch (err) {
      const code = errorCode(err);
      if (code !== 'cancelled') setError(code);
    } finally {
      setBusy(false);
    }
  };

  const toggleTool = (t: Tool) => setTools((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t].sort()));
  const show = (key: string | null, always = false) =>
    key && (touched || always) ? <p className="text-[11px] text-red-400">{tr(key as Parameters<Tr>[0])}</p> : null;

  return (
    <SkillModal
      title={tr('new.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={SECONDARY_CLS} onClick={onClose}>{tr('cancel')}</button>
          <button type="button" className={SEND_BTN} aria-disabled={!valid || busy} onClick={() => void submit()}>
            {tr('new.create')}
          </button>
        </>
      }
    >
      <form
        className="space-y-4 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block space-y-1">
          <span className="font-medium text-[var(--text-secondary)]">{tr('new.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            maxLength={NAME_MAX}
            placeholder="revisar-pr"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={!!check.name && (touched || !!name)}
            className={`${INPUT_CLS} w-full font-mono`}
          />
          <span className="block text-[11px] text-[var(--text-hint)]">{tr('new.nameHelp')}</span>
          {show(check.name, !!name && check.name !== 'new.nameRequired')}
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-[var(--text-secondary)]">{tr('new.description')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={DESCRIPTION_MAX + 1}
            className={`${INPUT_CLS} w-full resize-y`}
          />
          <span className="block text-[11px] text-[var(--text-hint)]">{tr('new.descriptionHelp')}</span>
          {show(check.description)}
        </label>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-medium text-[var(--text-secondary)]">{tr('new.tools')}</legend>
          {(['claude', 'codex'] as Tool[]).map((t) => (
            <label key={t} className="flex items-center gap-2 text-[var(--text-secondary)]">
              <input type="checkbox" checked={tools.includes(t)} onChange={() => toggleTool(t)} className={FOCUS_RING} />
              {tr(`tool.${t}`)}
            </label>
          ))}
          <span className="block text-[11px] text-[var(--text-hint)]">{tr('new.toolsHelp')}</span>
          {show(check.tools)}
        </fieldset>
        {error && <p className="text-red-400" role="alert">{trCode(tr, 'err', error, 'err.unknown')}</p>}
        <button type="submit" hidden />
      </form>
    </SkillModal>
  );
}
