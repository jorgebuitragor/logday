// Vista de DevTools (specs/devtools D0, design "Interfaz" §2 y §7): la
// columna de herramientas (o el selector en ventana angosta), la
// herramienta abierta y los atajos. Cada herramienta se carga al abrirla.
import { lazy, Suspense, useCallback, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type LazyExoticComponent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { Note } from '../../types/note';
import { ConfirmDeleteModal } from '../../components/shared/ConfirmDeleteModal';
import {
  ALL_TOOLS, DEVTOOLS_ID, clearDrafts, queueLoad, readDevtoolsSettings, takePendingLoad, toolForBlock,
  type NoteCodeBlock, type ToolId,
} from './model';
import { openNote as openNoteInApp, saveOutputAsNote } from './notes';
import { cancelRegex } from './tools/regexRunner';
import { DevtoolsContext, type DevtoolsContextValue, type FocusTarget, type OptionValue, type ToolActions } from './ui/context';
import { isMac, makeTr, shortDateTime, shortcutLabel, toolKey } from './ui/text';
import { PICKER_TOOLS } from './ui/meta';
import { Spinner } from './ui/controls';
import { ToolNav } from './ui/ToolNav';
import { NotePicker } from './ui/NotePicker';

type LazyTool = LazyExoticComponent<ComponentType>;
/** Una exportación con nombre de un módulo con varias herramientas. */
function named<M, K extends keyof M>(load: () => Promise<M>, name: K): LazyTool {
  return lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
}

const formats = () => import('./views/FormatTools');
const encoders = () => import('./views/EncodeTools');

const VIEWS: Record<ToolId, LazyTool> = {
  json: named(formats, 'JsonTool'),
  yaml: named(formats, 'YamlTool'),
  xml: named(formats, 'XmlTool'),
  convert: lazy(() => import('./views/ConvertTool')),
  base64: named(encoders, 'Base64Tool'),
  url: named(encoders, 'UrlTool'),
  html: named(encoders, 'HtmlTool'),
  jwt: lazy(() => import('./views/JwtTool')),
  uuid: lazy(() => import('./views/UuidTool')),
  hash: lazy(() => import('./views/HashTool')),
  password: lazy(() => import('./views/PasswordTool')),
  lorem: lazy(() => import('./views/LoremTool')),
  qr: lazy(() => import('./views/QrTool')),
  barcode: lazy(() => import('./views/BarcodeTool')),
  timestamp: lazy(() => import('./views/TimestampTool')),
  cron: lazy(() => import('./views/CronTool')),
  regex: lazy(() => import('./views/RegexTool')),
  diff: lazy(() => import('./views/DiffTool')),
  'sql-list': lazy(() => import('./views/SqlListTool')),
  'list-compare': lazy(() => import('./views/ListCompareTool')),
};

export default function DevtoolsView() {
  const { language, raw, update, showToast } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[DEVTOOLS_ID]?.settings,
      update: s.updateExtensionSettings,
      showToast: s.showToast,
    })),
  );
  const settings = useMemo(() => readDevtoolsSettings(raw), [raw]);
  const tr = useMemo(() => makeTr(language), [language]);
  const mac = useMemo(isMac, []);

  const [tool, setTool] = useState<ToolId>(settings.lastTool);
  // Cambia para volver a montar la herramienta (vaciar, traer de una nota).
  const [mountKey, setMountKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ tool: ToolId; title: string } | null>(null);
  const [live, setLive] = useState('');
  const actionsRef = useRef<ToolActions>({});
  const focusRequest = useRef<FocusTarget | null>(null);
  const navSearchRef = useRef<HTMLInputElement>(null);

  const announce = useCallback((message: string) => {
    // Vaciar y volver a escribir: así se anuncia aunque se repita el texto.
    setLive('');
    window.setTimeout(() => setLive(message), 50);
  }, []);

  const goTo = useCallback(
    (next: ToolId, focus?: FocusTarget) => {
      focusRequest.current = focus ?? null;
      setSwitcherOpen(false);
      // La misma herramienta no se vuelve a montar sola: para que tome el
      // foco pedido, se monta de nuevo (lo escrito sigue en la memoria).
      if (next === tool && focus) setMountKey((k) => k + 1);
      setTool(next);
      void update(DEVTOOLS_ID, { lastTool: next });
    },
    [tool, update],
  );

  const setOptions = useCallback(
    (target: ToolId, patch: Record<string, OptionValue>) => {
      // Se lee del store en el momento: dos cambios seguidos no se pisan.
      const current = readDevtoolsSettings(useAppStore.getState().extensions[DEVTOOLS_ID]?.settings);
      void update(DEVTOOLS_ID, { options: { ...current.options, [target]: { ...current.options[target], ...patch } } });
    },
    [update],
  );

  const copyText = useCallback(
    async (text: string) => {
      try {
        await invoke('write_clipboard', { text });
        announce(tr('copied'));
        return true;
      } catch {
        showToast({ kind: 'error', title: tr('copyError') });
        return false;
      }
    },
    [announce, showToast, tr],
  );

  const openNote = useCallback((note: Note) => void openNoteInApp(note), []);

  const saveNote = useCallback(
    async (target: ToolId, fenceLanguage: string, output: string) => {
      const title = tr('noteTitle', { tool: tr(toolKey(target, 'name')), date: shortDateTime(Date.now(), language) });
      try {
        const note = await saveOutputAsNote(title, fenceLanguage, output);
        showToast({
          kind: 'success',
          title: tr('noteCreated'),
          description: title,
          action: { label: tr('openNote'), onClick: () => openNote(note) },
        });
        announce(tr('noteCreatedLive', { title }));
        return note;
      } catch {
        showToast({ kind: 'error', title: tr('noteCreateError') });
        return null;
      }
    },
    [announce, language, openNote, showToast, tr],
  );

  const loadBlock = useCallback(
    (note: Note, block: NoteCodeBlock) => {
      setPickerOpen(false);
      const target = toolForBlock(block) ?? (PICKER_TOOLS.has(tool) ? tool : 'json');
      queueLoad(target, block.code);
      // El borrador ya lleva el bloque; la herramienta se vuelve a montar.
      takePendingLoad(target);
      if (target === 'sql-list') setOptions('sql-list', { direction: block.language === 'sql' ? 'toList' : 'toSql' });
      setLoaded({ tool: target, title: note.title });
      setMountKey((k) => k + 1);
      goTo(target, 'input');
      announce(tr('loadedFrom', { title: note.title }));
    },
    [announce, goTo, setOptions, tool, tr],
  );

  const clearAll = () => {
    setConfirmClear(false);
    cancelRegex();
    clearDrafts();
    setLoaded(null);
    setMountKey((k) => k + 1);
    announce(tr('cleared'));
  };

  const ctx = useMemo<DevtoolsContextValue>(
    () => ({
      tool,
      language,
      tr,
      mac,
      settings,
      setOptions,
      announce,
      copyText,
      saveNote,
      openNote,
      openPicker: () => {
        if (PICKER_TOOLS.has(tool)) setPickerOpen(true);
      },
      actionsRef,
      loadedFrom: loaded?.tool === tool ? loaded.title : null,
      clearLoaded: () => setLoaded(null),
      takeFocus: (target) => {
        if (focusRequest.current !== target) return false;
        focusRequest.current = null;
        return true;
      },
      goTo,
      shortcut: (spec) => shortcutLabel(spec, mac),
      switcherOpen,
      setSwitcherOpen,
    }),
    [tool, language, tr, mac, settings, setOptions, announce, copyText, saveNote, openNote, loaded, goTo, switcherOpen],
  );

  // Atajos (design §7): todos con ⌘⇧ (Ctrl+Shift) para no chocar con los
  // globales de la app. Solo actúan con la vista montada y sin un modal.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || pickerOpen || confirmClear) return;
    if (!(mac ? e.metaKey : e.ctrlKey)) return;
    const a = actionsRef.current;
    const key = e.key.toLowerCase();
    let action: (() => void) | undefined;
    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const i = ALL_TOOLS.indexOf(tool);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      action = () => goTo(ALL_TOOLS[(i + step + ALL_TOOLS.length) % ALL_TOOLS.length]);
    } else if (e.altKey && /^Digit[1-4]$/.test(e.code) && a.tab) {
      const index = Number(e.code.slice(5)) - 1;
      action = () => a.tab?.(index);
    } else if (key === 'enter' && !e.shiftKey && !e.altKey) {
      action = a.primary;
    } else if (e.shiftKey && !e.altKey) {
      if (key === 'f') {
        action = () => {
          // Con la columna visible, su buscador; si no, el selector.
          if (navSearchRef.current?.offsetParent) navSearchRef.current.focus();
          else setSwitcherOpen(true);
        };
      } else if (key === 'c') action = a.copy;
      else if (key === 's') action = a.save;
      else if (key === 'o') action = PICKER_TOOLS.has(tool) ? () => setPickerOpen(true) : undefined;
      else if (key === 'x') action = a.swap;
      else if (key === 'backspace') action = a.clear;
    }
    if (!action) return;
    e.preventDefault();
    // Que no lleguen a los atajos globales de `window` (⌘F de la búsqueda).
    e.stopPropagation();
    action();
  };

  const View = VIEWS[tool];

  return (
    <DevtoolsContext.Provider value={ctx}>
      <div className="@container/devtools flex min-h-0 flex-1" onKeyDown={onKeyDown}>
        <nav
          aria-label={tr('navLabel')}
          className="hidden w-[200px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)] @xl/devtools:flex"
        >
          <ToolNav
            active={tool}
            idPrefix="devtools-nav"
            searchRef={navSearchRef}
            showKbd
            onSelect={(next, focusInput) => goTo(next, focusInput ? 'input' : undefined)}
          />
          <div className="border-t border-[var(--border)] px-3 py-2.5">
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-[var(--text-hint)]">
              <ShieldCheck size={11} className="mt-px shrink-0" aria-hidden />
              {tr('privacyNote')}
            </p>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="mt-1.5 rounded-md px-1.5 py-0.5 text-[10px] text-[var(--text-hint)] hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {tr('clearAll')}
            </button>
          </div>
        </nav>
        <section aria-labelledby="devtools-tool-title" className="@container/tool flex min-w-0 flex-1 flex-col overflow-y-auto">
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center">
                <Spinner />
              </div>
            }
          >
            <View key={`${tool}:${mountKey}`} />
          </Suspense>
          {/* En ventana angosta, el pie de la lista va al final de la herramienta. */}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] px-5 py-2.5 @xl/devtools:hidden">
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-[var(--text-hint)]">
              <ShieldCheck size={11} className="mt-px shrink-0" aria-hidden />
              {tr('privacyNote')}
            </p>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="rounded-md px-1.5 py-0.5 text-[10px] text-[var(--text-hint)] hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {tr('clearAll')}
            </button>
          </div>
        </section>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {live}
        </div>
        {pickerOpen && <NotePicker onClose={() => setPickerOpen(false)} onPick={loadBlock} />}
        {confirmClear && (
          <ConfirmDeleteModal
            title={tr('clearAllTitle')}
            message={tr('clearAllMessage')}
            cancelLabel={tr('cancel')}
            confirmLabel={tr('clearAllConfirm')}
            onCancel={() => setConfirmClear(false)}
            onConfirm={clearAll}
          />
        )}
      </div>
    </DevtoolsContext.Provider>
  );
}
