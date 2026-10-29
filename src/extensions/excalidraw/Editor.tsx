import { useMemo, useRef, useState } from 'react';
import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { Z_MODAL_NESTED } from '../../lib/zIndex';
import { ModalOverlay } from '../../components/shared/ModalOverlay';
import { ModalPanel } from '../../components/shared/ModalPanel';
import type { NoteBlockEditorProps } from '../types';
import { setLocalExcalidrawAssets } from './assets';
import { MAX_SCENE_BYTES, byteSize, parseScene, sceneToCode } from './scene';

setLocalExcalidrawAssets();

type Api = {
  getSceneElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
};

/** Excalidraw casi a pantalla completa, sobre la nota (X1, X2). */
export default function ExcalidrawEditor({ code, onSave, onClose }: NoteBlockEditorProps) {
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const showToast = useAppStore((s) => s.showToast);
  const apiRef = useRef<Api | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const initial = useMemo(() => parseScene(code).scene, [code]);
  // onChange se dispara también al abrir: se compara la versión de cada
  // elemento con la del inicio para saber si hay algo sin guardar.
  const fingerprint = (els: readonly unknown[]) =>
    JSON.stringify((els as { id: string; version: number; isDeleted?: boolean }[]).filter((e) => !e.isDeleted).map((e) => [e.id, e.version]));
  const initialPrint = useMemo(() => fingerprint(initial.elements), [initial]);
  const hasChanges = () => !!apiRef.current && fingerprint(apiRef.current.getSceneElements()) !== initialPrint;
  const cancel = () => { if (hasChanges()) setConfirmDiscard(true); else onClose(); };
  const dark = theme !== 'light' && theme !== 'sepia';

  const save = () => {
    const api = apiRef.current;
    if (!api) return;
    // `local` guarda también las imágenes pegadas (como data URL).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = serializeAsJSON(api.getSceneElements() as any, api.getAppState() as any, api.getFiles() as any, 'local');
    const out = sceneToCode(json);
    if (byteSize(out) > MAX_SCENE_BYTES) {
      showToast({ kind: 'error', title: t(language, 'excalidraw', 'tooBig'), description: t(language, 'excalidraw', 'tooBigHint'), durationMs: 6000 });
      return;
    }
    onSave(out);
  };

  return (
    <ModalOverlay zIndex={Z_MODAL_NESTED}>
      <ModalPanel className="flex h-[92vh] w-[96vw] flex-col overflow-hidden rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{t(language, 'excalidraw', 'editorTitle')}</p>
          <div className="flex items-center gap-2">
            {confirmDiscard ? (
              <>
                <span className="text-xs text-amber-400">{t(language, 'excalidraw', 'discardConfirm')}</span>
                <button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]">
                  {t(language, 'excalidraw', 'keepEditing')}
                </button>
                <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10">
                  {t(language, 'excalidraw', 'discard')}
                </button>
              </>
            ) : (
              <button type="button" onClick={cancel} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]">
                {t(language, 'excalidraw', 'cancel')}
              </button>
            )}
            <button type="button" onClick={save} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500">
              {t(language, 'excalidraw', 'save')}
            </button>
          </div>
        </div>
        {/* Excalidraw ocupa el alto de su contenedor: necesita uno fijo. */}
        <div className="min-h-0 flex-1">
          <Excalidraw
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            excalidrawAPI={(api: any) => { apiRef.current = api; }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            initialData={{ elements: initial.elements as any, appState: { ...initial.appState, collaborators: new Map() } as any, files: initial.files as any, scrollToContent: true }}
            theme={dark ? 'dark' : 'light'}
            langCode={language === 'en' ? 'en' : 'es-ES'}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: true } }}
          />
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
