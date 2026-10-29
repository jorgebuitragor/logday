import { useEffect, useState } from 'react';
import { PenTool } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import type { NoteBlockProps } from '../types';
import { setLocalExcalidrawAssets } from './assets';
import { parseScene } from './scene';

/** El dibujo dentro de la nota: un SVG que se arma con Excalidraw al vuelo
 *  (no se guarda aparte). Clic → editarlo (X2). */
export default function ExcalidrawBlock({ code, onEdit }: NoteBlockProps) {
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { scene, ok } = parseScene(code);
  const empty = scene.elements.length === 0;
  const dark = theme !== 'light' && theme !== 'sepia';

  useEffect(() => {
    if (empty || !ok) { setSvg(null); return; }
    let alive = true;
    setLocalExcalidrawAssets();
    void import('@excalidraw/excalidraw')
      .then(({ exportToSvg }) => exportToSvg({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements: scene.elements as any,
        appState: { ...scene.appState, exportBackground: false, exportWithDarkMode: dark },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        files: scene.files as any,
        exportPadding: 12,
      }))
      .then((el) => {
        if (!alive) return;
        // Tamaño natural, sin agrandar un dibujo pequeño; solo se achica
        // si no cabe (CSS del contenedor).
        el.style.maxHeight = '420px';
        setSvg(el.outerHTML);
        setFailed(false);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  // El código cambia cuando se guarda el dibujo; el tema, al cambiarlo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, dark]);

  if (empty || !ok || failed) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="my-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-high)] px-4 py-6 text-xs text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
      >
        <PenTool size={14} />
        {t(language, 'excalidraw', !ok ? 'blockBroken' : failed ? 'blockRenderError' : 'blockEmpty')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      title={t(language, 'excalidraw', 'blockEdit')}
      className="my-2 block w-full overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-2 text-left transition hover:border-[var(--border-high)]"
    >
      {svg
        ? <div className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        : <div className="py-8 text-center text-[11px] text-[var(--text-hint)]">{t(language, 'excalidraw', 'blockLoading')}</div>}
    </button>
  );
}
