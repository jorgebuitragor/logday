import { useMemo, useState } from 'react';
import { Plus, AlertTriangle, X, Folder, Calendar, Tag } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import type { QuickCaptureResult } from '../../lib/quickCapture';
import { RichTextEditor } from './RichTextEditor';
import { TagSuggestInput } from './TagSuggestInput';
import { AppSelect } from '../calendar/AppSelect';
import { AppDatePicker } from '../shared/AppDatePicker';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';

// Ventana de "Nueva tarea" con todos los campos. Antes pedía solo título,
// código y descripción: para ponerle proyecto, fecha o tags había que
// crearla y después abrirla. Se abre con el botón "Nueva tarea", con ⌘T, o
// desde la captura rápida (⌘↵), que le pasa lo que ya se escribió.

interface Props {
  initial?: Partial<QuickCaptureResult>;
  onClose: () => void;
}

const FIELD_LABEL = 'flex w-20 shrink-0 items-center gap-1.5 text-[11px] text-[var(--text-hint)]';

export function NewTaskModal({ initial, onClose }: Props) {
  const { createTask, tasks, projects, activeProject, language } = useAppStore(
    useShallow((s) => ({
      createTask: s.createTask,
      tasks: s.tasks,
      projects: s.projects,
      activeProject: s.activeProject,
      language: s.language,
    })),
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [project, setProject] = useState(initial?.project ?? activeProject ?? 'inbox');
  const [due, setDue] = useState(initial?.due ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [code, setCode] = useState('');
  const [content, setContent] = useState('');

  const isDuplicateCode = useMemo(
    () => code.length > 0 && tasks.some((t) => t.taskCode === code),
    [code, tasks],
  );
  const projectOptions = useMemo(
    () => (projects.includes(project) ? projects : [project, ...projects]).map((p) => ({ value: p, label: p })),
    [projects, project],
  );

  const create = async () => {
    if (!title.trim()) return;
    const pendingTag = tagInput.trim().replace(/^@/, '');
    const finalTags = pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;
    onClose();
    await createTask(title.trim(), project, content, code.trim() || undefined, { due: due || undefined, tags: finalTags });
  };

  const addTag = (raw = tagInput) => {
    const tag = raw.trim().replace(/^@/, '');
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagInput('');
  };

  const handleFieldKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void create(); }
    if (e.key === 'Escape') onClose();
  };

  return (
    <ModalOverlay onClose={onClose} className="animate-fade-in">
      <ModalPanel className="modal-spring-in w-[640px] max-w-[92vw] rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Plus size={15} className="text-indigo-400" />
          {t(language, 'tasks', 'modalTitle')}
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleFieldKey}
          placeholder={t(language, 'tasks', 'taskNamePlaceholder')}
          className="mb-4 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
        />

        <div className="mb-4 space-y-2.5">
          <div className="flex items-center gap-3">
            <span className={FIELD_LABEL}><Folder size={11} />{t(language, 'tasks', 'projectField')}</span>
            <AppSelect value={project} options={projectOptions} onChange={setProject} />
          </div>
          <div className="flex items-center gap-3">
            <span className={FIELD_LABEL}><Calendar size={11} />{t(language, 'tasks', 'dueDate')}</span>
            <AppDatePicker value={due} onChange={setDue} />
            {due && (
              <button
                type="button"
                onClick={() => setDue('')}
                aria-label={t(language, 'tasks', 'dueClear')}
                title={t(language, 'tasks', 'dueClear')}
                className="rounded-md p-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-red-400"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex items-start gap-3">
            <span className={`${FIELD_LABEL} pt-1`}><Tag size={11} />{t(language, 'tasks', 'tagsLabel')}</span>
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-400">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== tag))}
                    aria-label={`${t(language, 'tasks', 'removeTag')} ${tag}`}
                    className="opacity-60 transition hover:opacity-100"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <TagSuggestInput
                value={tagInput}
                onChange={setTagInput}
                onCommit={addTag}
                exclude={tags}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
                  else if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1));
                  else if (e.key === 'Escape') onClose();
                }}
                onBlur={() => addTag()}
                placeholder={t(language, 'tasks', 'tagsInputPlaceholder')}
                wrapperClassName="min-w-[8rem] flex-1"
                className="w-full bg-transparent py-1 text-xs text-[var(--text-secondary)] outline-none placeholder-[var(--text-faint)]"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={FIELD_LABEL}># {t(language, 'tasks', 'taskCodeLabel')}</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9\-_]/g, '').toUpperCase())}
              onKeyDown={handleFieldKey}
              maxLength={32}
              spellCheck={false}
              placeholder={t(language, 'tasks', 'taskCodeHint')}
              className={`flex-1 bg-transparent py-1 font-mono text-xs outline-none placeholder-[var(--text-faint)] transition-colors ${
                isDuplicateCode ? 'text-red-400' : 'text-[var(--text-secondary)]'
              }`}
            />
            {isDuplicateCode && (
              <AlertTriangle size={12} className="shrink-0 text-red-400" aria-label={t(language, 'tasks', 'taskCodeDuplicate')} />
            )}
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-hint)]">{t(language, 'tasks', 'descriptionLabel')}</div>
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder={t(language, 'tasks', 'descriptionPlaceholder')}
            minHeight="140px"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
          >
            {t(language, 'tasks', 'cancel')}
          </button>
          <button
            onClick={() => void create()}
            disabled={!title.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t(language, 'tasks', 'createTask')}
          </button>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
