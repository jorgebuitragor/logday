import { Monitor, Sun, Moon, Minus, Plus, Type, ChevronDown, AlertTriangle, Eye, BookOpen, Smartphone, Snowflake, MoreVertical, Pencil, Copy, Trash2, Palette } from 'lucide-react';
import { useState } from 'react';
import { Theme, CustomTheme } from '../../types/theme';
import { StartupScreen } from '../../types/config';
import { Language } from '../../types/common';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { CustomThemeEditor } from './CustomThemeEditor';
import InlineRenameInput from '../shared/InlineRenameInput';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { ThemeTile } from './ThemeTile';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { Z_MODAL_NESTED } from '../../lib/zIndex';
import ToggleSwitch from '../shared/ToggleSwitch';

const THEME_VALUES: { value: Theme; Icon: React.ElementType }[] = [
  { value: 'system', Icon: Monitor },
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'high-contrast', Icon: AlertTriangle },
  { value: 'visual-rest', Icon: Eye },
  { value: 'sepia', Icon: BookOpen },
  { value: 'oled', Icon: Smartphone },
  { value: 'nordic', Icon: Snowflake },
];

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

const STARTUP_SCREEN_VALUES: StartupScreen[] = ['dashboard', 'dailys', 'tasks', 'notes', 'overtime'];

interface GeneralSettingsTabProps {
  isStartupSelectorOpen: boolean;
  setIsStartupSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  startupSelectorRef: React.RefObject<HTMLDivElement | null>;
}

export function GeneralSettingsTab({ isStartupSelectorOpen, setIsStartupSelectorOpen, startupSelectorRef }: GeneralSettingsTabProps) {
  const {
    language, setLanguage,
    theme, setTheme,
    customThemes, renameCustomTheme, duplicateCustomTheme, deleteCustomTheme,
    startupScreen, setStartupScreen,
    fontSize, setFontSize,
    confirmDestructiveActions,
    sidebarLabelsVisible, setSidebarLabelsVisible,
  } = useAppStore();

  const [editingCustomTheme, setEditingCustomTheme] = useState<CustomTheme | 'new' | null>(null);
  const [showAllCustomThemes, setShowAllCustomThemes] = useState(false);
  const [visibleCustomCount, setVisibleCustomCount] = useState(6);
  const [openThemeMenuId, setOpenThemeMenuId] = useState<string | null>(null);
  const [renamingThemeId, setRenamingThemeId] = useState<string | null>(null);
  const confirmDeleteThemeDialog = useConfirmDelete<CustomTheme>(confirmDestructiveActions);

  const startupScreenOptions = STARTUP_SCREEN_VALUES.map((value) => ({
    value,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    label: t(language, 'settings', `startup${value.charAt(0).toUpperCase() + value.slice(1)}` as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    desc: t(language, 'settings', `startupDesc${value.charAt(0).toUpperCase() + value.slice(1)}` as any),
  }));
  const themeOptions = THEME_VALUES.map(({ value, Icon }) => {
    const keySuffix = value
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    return {
      value,
      Icon,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      label: t(language, 'settings', `theme${keySuffix}` as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      desc: t(language, 'settings', `themeDesc${keySuffix}` as any),
    };
  });
  const activeStartupOption = startupScreenOptions.find((o) => o.value === startupScreen) ?? startupScreenOptions[0];

  const handleStartRenameTheme = (ct: CustomTheme) => {
    setOpenThemeMenuId(null);
    setRenamingThemeId(ct.id);
  };

  const handleConfirmRenameTheme = (value: string) => {
    if (renamingThemeId) renameCustomTheme(renamingThemeId, value);
    setRenamingThemeId(null);
  };

  const handleDuplicateTheme = (id: string) => {
    setOpenThemeMenuId(null);
    duplicateCustomTheme(id);
  };

  const handleDeleteThemeClick = (ct: CustomTheme) => {
    setOpenThemeMenuId(null);
    confirmDeleteThemeDialog.request(ct, (theme) => deleteCustomTheme(theme.id));
  };

  return <>

  {/* Language section */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'language')}
    </p>
    <div className="flex gap-2">
      {LANGUAGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setLanguage(opt.value)}
          className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition ${
            language === opt.value
              ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-400'
              : 'border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>

  {/* Theme section */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'theme')}
    </p>
    <div className="grid grid-cols-3 gap-2">
      {themeOptions.map(({ value, label, Icon, desc }) => (
        <ThemeTile
          key={value}
          active={theme === value}
          onClick={() => setTheme(value)}
          icon={<Icon size={20} />}
          label={label}
          title={desc}
        />
      ))}

      {/* Tile de tema personalizado: muestra el activo si existe, o un
          acceso genérico para crear el primero. Siempre ocupa el 9º
          espacio de la grilla 3x3 (8 temas built-in + este). */}
      {(() => {
        const activeCustom = customThemes.find((ct) => theme === `custom:${ct.id}`);
        const hasAny = customThemes.length > 0;
        const handleClick = () => {
          if (activeCustom) {
            setEditingCustomTheme(activeCustom);
            return;
          }
          if (!hasAny) {
            setEditingCustomTheme('new');
            return;
          }
          // Ninguno activo pero ya existen: selecciona el primero de
          // la lista automáticamente. Si hay más de uno, despliega
          // el resto para que el usuario pueda elegir otro.
          setTheme(`custom:${customThemes[0].id}`);
          if (customThemes.length > 1) {
            setShowAllCustomThemes(true);
            setVisibleCustomCount(6);
          }
        };
        return (
          <ThemeTile
            active={!!activeCustom}
            dashed={!activeCustom}
            onClick={handleClick}
            icon={<Palette size={20} />}
            colorDot={activeCustom?.accent}
            label={activeCustom ? activeCustom.name : t(language, 'settings', 'customThemePersonalizedTile')}
            title={activeCustom ? activeCustom.name : t(language, 'settings', 'customThemePersonalizedTile')}
          />
        );
      })()}
    </div>
    <p className="mt-2 text-center text-[10px] text-[var(--text-hint)]">
      {theme.startsWith('custom:')
        ? customThemes.find((ct) => theme === `custom:${ct.id}`)?.name
        : themeOptions.find((o) => o.value === theme)?.desc}
    </p>

    {customThemes.length > 0 && (
      <div className="mt-2 text-center">
        <button
          onClick={() => {
            setShowAllCustomThemes((v) => !v);
            setVisibleCustomCount(6);
          }}
          className="text-[10px] font-medium text-[var(--text-hint)] hover:text-indigo-400"
        >
          {showAllCustomThemes
            ? t(language, 'settings', 'customThemesSeeLess')
            : customThemes.length > 6
              ? t(language, 'settings', 'customThemesSeeMore')
              : t(language, 'settings', 'customThemesSeeCustom')}
        </button>
      </div>
    )}

    {showAllCustomThemes && (
      <div className="mt-2 grid grid-cols-3 gap-2">
        {customThemes.slice(0, visibleCustomCount).map((ct) => {
          const isActive = theme === `custom:${ct.id}`;
          const isRenaming = renamingThemeId === ct.id;
          return (
            <div
              key={ct.id}
              className={`relative flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition ${
                isActive
                  ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-400'
                  : 'border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenThemeMenuId(openThemeMenuId === ct.id ? null : ct.id)}
                className="absolute right-1 top-1 rounded p-0.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <MoreVertical size={12} />
              </button>
              <button
                type="button"
                onClick={() => setTheme(`custom:${ct.id}`)}
                className="flex w-full flex-col items-center gap-2"
              >
                <span
                  className="h-5 w-5 rounded-full border border-[var(--border-card)]"
                  style={{ background: ct.accent }}
                />
                {isRenaming ? (
                  <span className="w-full" onClick={(e) => e.stopPropagation()}>
                    <InlineRenameInput
                      value={ct.name}
                      onCommit={handleConfirmRenameTheme}
                      onCancel={() => setRenamingThemeId(null)}
                      className="w-full rounded border border-indigo-500/40 bg-[var(--bg-input)] px-1 py-0.5 text-center text-xs text-[var(--text-primary)] outline-none"
                    />
                  </span>
                ) : (
                  <span className="w-full truncate text-xs font-medium">{ct.name}</span>
                )}
              </button>
              {openThemeMenuId === ct.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenThemeMenuId(null)} />
                  <div className="absolute right-1 top-6 z-20 min-w-[130px] rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 text-left shadow-xl">
                    <button
                      onClick={() => handleStartRenameTheme(ct)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    >
                      <Pencil size={12} /> {t(language, 'settings', 'customThemeRename')}
                    </button>
                    <button
                      onClick={() => { setOpenThemeMenuId(null); setEditingCustomTheme(ct); }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    >
                      <Palette size={12} /> {t(language, 'settings', 'customThemeEditTitle')}
                    </button>
                    <button
                      onClick={() => handleDuplicateTheme(ct.id)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    >
                      <Copy size={12} /> {t(language, 'settings', 'customThemeDuplicate')}
                    </button>
                    <button
                      onClick={() => handleDeleteThemeClick(ct)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-400/10"
                    >
                      <Trash2 size={12} /> {t(language, 'settings', 'customThemeDelete')}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        <ThemeTile
          active={false}
          dashed
          onClick={() => setEditingCustomTheme('new')}
          icon={<Plus size={20} />}
          label={t(language, 'settings', 'customThemeCreate')}
        />

        {customThemes.length > visibleCustomCount && (
          <button
            onClick={() => setVisibleCustomCount((v) => v + 6)}
            className="col-span-3 mt-1 rounded-lg py-1.5 text-[10px] font-medium text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-indigo-400"
          >
            {t(language, 'settings', 'customThemesLoadMore')}
          </button>
        )}
      </div>
    )}
  </div>

  {/* Editor de tema personalizado (crear/editar) */}
  {editingCustomTheme && (
    <CustomThemeEditor
      initial={editingCustomTheme === 'new' ? null : editingCustomTheme}
      onClose={() => setEditingCustomTheme(null)}
    />
  )}

  {/* Modal confirmación eliminar tema personalizado (desde el menú ⋮) */}
  {confirmDeleteThemeDialog.isOpen && confirmDeleteThemeDialog.pending && (
    <ConfirmDeleteModal
      title={t(language, 'settings', 'customThemeConfirmDeleteTitle')}
      message={
        <>
          {t(language, 'settings', 'customThemeConfirmDeleteMsg')} &quot;{confirmDeleteThemeDialog.pending.name}&quot;?{' '}
          {t(language, 'settings', 'customThemeConfirmDeleteDesc')}
        </>
      }
      cancelLabel={t(language, 'settings', 'customThemeCancel')}
      confirmLabel={t(language, 'settings', 'customThemeDelete')}
      onCancel={confirmDeleteThemeDialog.cancel}
      onConfirm={() => { deleteCustomTheme(confirmDeleteThemeDialog.pending!.id); confirmDeleteThemeDialog.cancel(); }}
      zIndex={Z_MODAL_NESTED}
    />
  )}

  {/* Startup screen section */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'startupScreen')}
    </p>
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-3">
      <div ref={startupSelectorRef} className="relative">
        <button
          type="button"
          onClick={() => setIsStartupSelectorOpen((s) => !s)}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
            isStartupSelectorOpen
              ? 'border-indigo-500/60 bg-indigo-500/10'
              : 'border-[var(--border-card)] bg-[var(--bg-elevated)] hover:border-[var(--border-high)] hover:bg-[var(--bg-hover)]'
          }`}
          aria-haspopup="listbox"
          aria-expanded={isStartupSelectorOpen}
        >
          <span>
            <span className="block text-xs font-medium text-[var(--text-secondary)]">
              {activeStartupOption.label}
            </span>
            <span className="mt-0.5 block text-[10px] text-[var(--text-hint)]">
              {activeStartupOption.desc}
            </span>
          </span>
          <ChevronDown
            size={14}
            className={`text-[var(--text-hint)] transition-transform ${isStartupSelectorOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isStartupSelectorOpen && (
          <div className="absolute left-0 right-0 z-20 mt-1.5 overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl">
            <div role="listbox" aria-label={t(language, 'settings', 'startupOptionsAria')} className="p-1">
              {startupScreenOptions.map(({ value, label, desc }) => {
                const isActive = startupScreen === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      void setStartupScreen(value);
                      setIsStartupSelectorOpen(false);
                    }}
                    className={`w-full rounded-md px-3 py-2 text-left transition ${
                      isActive
                        ? 'bg-indigo-500/10 text-indigo-400'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <span className="block text-xs font-medium">{label}</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--text-hint)]">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
    <p className="mt-2 text-center text-[10px] text-[var(--text-hint)]">
      {t(language, 'settings', 'startupHint')}
    </p>
  </div>

  {/* Font size section */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'fontSize')}
    </p>
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Type size={13} />
          <span className="text-xs">{t(language, 'settings', 'fontSizeLabel')}</span>
        </div>
        <span className="text-xs font-mono font-semibold text-[var(--text-primary)]">
          {fontSize}px
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFontSize(Math.max(11, fontSize - 1))}
          disabled={fontSize <= 11}
          className="rounded-lg border border-[var(--border-card)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Minus size={12} />
        </button>
        <div className="flex flex-1 gap-1">
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setFontSize(s)}
              className={`flex-1 rounded py-1 text-[10px] font-medium transition ${
                fontSize === s
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFontSize(Math.min(20, fontSize + 1))}
          disabled={fontSize >= 20}
          className="rounded-lg border border-[var(--border-card)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  </div>

  {/* Menú lateral */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'sidebarSection')}
    </p>
    <div
      onClick={() => void setSidebarLabelsVisible(!sidebarLabelsVisible)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)] cursor-pointer"
    >
      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'sidebarLabelsTitle')}</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'sidebarLabelsDesc')}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${
          sidebarLabelsVisible ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'
        }`}>
          {sidebarLabelsVisible
            ? t(language, 'settings', 'sidebarLabelsOn')
            : t(language, 'settings', 'sidebarLabelsOff')}
        </span>
        <ToggleSwitch checked={sidebarLabelsVisible} onChange={setSidebarLabelsVisible} size="lg" />
      </div>
    </div>
  </div>

  </>;
}
