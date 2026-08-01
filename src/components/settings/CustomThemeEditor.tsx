import { useMemo, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { CustomTheme } from '../../types/theme';
import { t } from '../../lib/i18n';
import { deriveCustomThemeVars } from '../../lib/themeColor';
import { ColorPicker } from './ColorPicker';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';

interface Props {
  initial: CustomTheme | null; // null = crear nuevo
  onClose: () => void;
}

const LIGHT_LIKE_THEMES = ['light', 'sepia'];

/** Lee el acento/fondo/texto del tema ACTIVO en este momento (built-in o
 * custom, da igual — las variables ya están resueltas en el DOM), para que
 * un tema personalizado nuevo arranque reflejando lo que se está viendo,
 * en vez de un índigo fijo sin relación con el tema actual. */
function getComputedThemeDefaults() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const v = styles.getPropertyValue(name).trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  };
  const resolved = document.documentElement.dataset.theme ?? 'dark';
  const base: 'dark' | 'light' = LIGHT_LIKE_THEMES.includes(resolved) ? 'light' : 'dark';
  return {
    base,
    accent: read('--accent', '#818cf8'),
    bgTint: read('--bg-surface', base === 'light' ? '#f4f4f5' : '#1c1c1c'),
    textTint: read('--text-muted', '#888888'),
  };
}

export function CustomThemeEditor({ initial, onClose }: Props) {
  const { language, confirmDestructiveActions, createCustomTheme, updateCustomTheme, deleteCustomTheme } = useAppStore();

  // Solo se calcula una vez al montar (el componente se remonta cada vez que
  // se abre el editor), así refleja el tema activo en ese instante.
  const currentDefaults = useMemo(() => (initial ? null : getComputedThemeDefaults()), [initial]);

  const [name, setName] = useState(initial?.name ?? '');
  const [base, setBase] = useState<'dark' | 'light'>(initial?.base ?? currentDefaults?.base ?? 'dark');
  const [accent, setAccent] = useState(initial?.accent ?? currentDefaults?.accent ?? '#818cf8');
  const [bgTint, setBgTint] = useState(initial?.bgTint ?? currentDefaults?.bgTint ?? '#1c1c1c');
  const [textTint, setTextTint] = useState(initial?.textTint ?? currentDefaults?.textTint ?? '#888888');
  const [intensity, setIntensity] = useState(initial?.intensity ?? 50);
  const confirmDeleteDialog = useConfirmDelete<true>(confirmDestructiveActions);

  const previewVars = useMemo(
    () => deriveCustomThemeVars({ base, accent, bgTint, textTint, intensity }),
    [base, accent, bgTint, textTint, intensity],
  );

  const handleSave = () => {
    if (initial) {
      updateCustomTheme(initial.id, { name: name.trim() || initial.name, base, accent, bgTint, textTint, intensity });
    } else {
      createCustomTheme({ name, base, accent, bgTint, textTint, intensity });
    }
    onClose();
  };

  const handleDeleteClick = () => {
    if (!initial) return;
    confirmDeleteDialog.request(true, () => { deleteCustomTheme(initial.id); onClose(); });
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {initial ? t(language, 'settings', 'customThemeEditTitle') : t(language, 'settings', 'customThemeCreateTitle')}
          </h3>
          <button onClick={onClose} className="text-[var(--text-hint)] hover:text-[var(--text-muted)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'customThemeName')}
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(language, 'settings', 'customThemeNamePlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500/60"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'settings', 'customThemeBase')}
            </label>
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBase(b)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                    base === b
                      ? 'bg-indigo-500/15 text-indigo-400'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {t(language, 'settings', b === 'dark' ? 'customThemeBaseDark' : 'customThemeBaseLight')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
                {t(language, 'settings', 'customThemeAccent')}
              </label>
              <ColorPicker value={accent} onChange={setAccent} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
                {t(language, 'settings', 'customThemeBgTint')}
              </label>
              <ColorPicker value={bgTint} onChange={setBgTint} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
                {t(language, 'settings', 'customThemeTextTint')}
              </label>
              <ColorPicker value={textTint} onChange={setTextTint} />
            </div>
          </div>

          <div>
            <label className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
              <span>{t(language, 'settings', 'customThemeIntensity')}</span>
              <span>{intensity}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: accent }}
            />
          </div>

          {/* Vista previa en vivo — self-contained, no toca el documento global */}
          <div
            className="overflow-hidden rounded-xl border"
            style={{ ...(previewVars as React.CSSProperties), borderColor: 'var(--border-card)', background: 'var(--bg-base)' }}
          >
            <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--bg-panel)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {name.trim() || t(language, 'settings', 'customThemeNamePlaceholder')}
              </span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent)' }} />
            </div>
            <div className="space-y-1.5 px-3 py-3">
              <p className="text-xs" style={{ color: 'var(--text-body)' }}>
                {t(language, 'settings', 'customThemePreviewText')}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-hint)' }}>
                {t(language, 'settings', 'customThemePreviewHint')}
              </p>
              <button
                className="mt-1 rounded-lg px-2.5 py-1 text-[10px] font-medium"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-link)' }}
              >
                {t(language, 'settings', 'customThemePreviewButton')}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {initial ? (
            <button
              onClick={handleDeleteClick}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-400/10"
            >
              <Trash2 size={13} /> {t(language, 'settings', 'customThemeDelete')}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              {t(language, 'settings', 'customThemeCancel')}
            </button>
            <button onClick={handleSave} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
              {t(language, 'settings', 'customThemeSave')}
            </button>
          </div>
        </div>
      </div>

      {confirmDeleteDialog.isOpen && initial && (
        <ConfirmDeleteModal
          title={t(language, 'settings', 'customThemeConfirmDeleteTitle')}
          message={
            <>
              {t(language, 'settings', 'customThemeConfirmDeleteMsg')} "{initial.name}"?{' '}
              {t(language, 'settings', 'customThemeConfirmDeleteDesc')}
            </>
          }
          cancelLabel={t(language, 'settings', 'customThemeCancel')}
          confirmLabel={t(language, 'settings', 'customThemeDelete')}
          zIndex={10002}
          onCancel={confirmDeleteDialog.cancel}
          onConfirm={() => { deleteCustomTheme(initial.id); onClose(); }}
        />
      )}
    </div>
  );
}
