// Vista previa aislada de HTML (specs/devtools D26). La usa el Visor HTML
// de DevTools y la reutilizará el Cliente HTTP para las respuestas
// `text/html` (paquete B de su rediseño). Lo que la aísla está en
// `lib/htmlPreviewDoc.ts`; aquí, el iframe y el ancho simulado.
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildPreviewDoc } from '../../lib/htmlPreviewDoc';

export interface HtmlPreviewProps {
  html: string;
  /** Imágenes, estilos, fuentes y medios por https (nunca scripts). */
  allowExternal?: boolean;
  /** Ancho simulado en px (375 móvil, 768 tablet) o `null` para el del
   *  panel. Si no cabe, la página se escala para que se vea entera. */
  width?: number | null;
  /** El `title` del iframe, para los lectores de pantalla. */
  title: string;
  /** Alto del marco (clases de Tailwind). */
  heightClass?: string;
  /** Recibe la escala aplicada (1 si no hizo falta), para mostrarla. */
  onScale?: (scale: number) => void;
}

/** La escala para que `width` quepa en `available` (nunca agranda). */
export function previewScale(width: number | null, available: number): number {
  if (!width || available <= 0 || width <= available) return 1;
  return available / width;
}

export function HtmlPreview({ html, allowExternal = false, width = null, title, heightClass = 'h-[60vh] min-h-[16rem]', onScale }: HtmlPreviewProps) {
  const doc = useMemo(() => buildPreviewDoc(html, { allowExternal }), [html, allowExternal]);
  const frameRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = previewScale(width, box.w);
  useEffect(() => onScale?.(scale), [scale, onScale]);

  // Con un ancho simulado, el iframe mide ese ancho y, si no cabe, se
  // escala; su alto se agranda en la misma proporción para llenar el marco.
  const style = width
    ? {
        width: `${width}px`,
        height: scale < 1 && box.h ? `${box.h / scale}px` : '100%',
        transform: scale < 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
      }
    : { width: '100%', height: '100%' };

  return (
    <div
      ref={frameRef}
      className={`relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] ${heightClass}`}
    >
      <div className={`h-full ${width && scale === 1 ? 'flex justify-center' : ''}`}>
        {/* sandbox vacío: sin scripts, formularios, ventanas ni el origen de
            la app. El fondo blanco es el lienzo que espera una página web,
            en cualquier tema. */}
        <iframe
          title={title}
          sandbox=""
          srcDoc={doc}
          referrerPolicy="no-referrer"
          className="block border-0 bg-white"
          style={style}
        />
      </div>
    </div>
  );
}
