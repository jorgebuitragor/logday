// Vista previa y archivo de los QR y códigos de barras (Adenda B.1 y B.4).
// La tarjeta va en blanco fijo en todos los temas: un lector necesita
// módulos oscuros sobre fondo claro, y atenuarla bajaría el contraste.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ImageDown, type LucideIcon } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../../store/appStore';
import { fs } from '../../../lib/invoke';
import { useDevtools } from './context';
import { CopyButton, PanelHeader } from './controls';
import { FOCUS_RING, SECONDARY_CLS } from './classes';

/** El PNG se dibuja desde el mismo SVG, en un canvas del tamaño pedido,
 *  con fondo blanco y sin suavizado (los bordes de los módulos, nítidos). */
async function svgToPngBase64(svg: string, width: number, height: number): Promise<string> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d no disponible');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png').split(',')[1];
}

export interface ImageSource {
  svg: string;
  width: number;
  height: number;
  /** Nombre sin extensión. */
  baseName: string;
}

/** Guardar como PNG o SVG con el diálogo del sistema. Solo se escribe lo
 *  que el usuario elige y donde lo elige (D9). Cancelar no avisa nada. */
export function useImageSaver() {
  const { tr, announce } = useDevtools();
  const showToast = useAppStore((s) => s.showToast);
  return async (kind: 'png' | 'svg', image: ImageSource) => {
    try {
      const path = await save({
        defaultPath: `${image.baseName}.${kind}`,
        filters: [{ name: kind.toUpperCase(), extensions: [kind] }],
      });
      if (!path) return;
      if (kind === 'png') await fs.writeBinary(path, await svgToPngBase64(image.svg, image.width, image.height));
      else await fs.writeFile(path, image.svg);
      const fileName = path.split(/[\\/]/).pop() ?? path;
      showToast({ kind: 'success', title: tr('imageSaved'), description: fileName });
      announce(tr('imageSaved'));
    } catch {
      showToast({ kind: 'error', title: tr('imageSaveError') });
    }
  };
}

/** "Guardar como PNG", "Guardar como SVG" y "Copiar SVG". En angosto, los
 *  dos "Guardar" se juntan en un menú. */
export function ImageActions({ image }: { image: ImageSource | null }) {
  const { tr, shortcut } = useDevtools();
  const saveImage = useImageSaver();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menu]);
  const run = (kind: 'png' | 'svg') => {
    setMenu(false);
    if (image) void saveImage(kind, image);
  };
  return (
    <>
      <div className="hidden items-center gap-1.5 @lg/tool:flex">
        <button type="button" disabled={!image} onClick={() => run('png')} title={`${tr('saveAsPng')} (${shortcut('mod+shift+S')})`} className={SECONDARY_CLS}>
          <ImageDown size={13} aria-hidden />
          {tr('saveAsPng')}
        </button>
        <button type="button" disabled={!image} onClick={() => run('svg')} className={SECONDARY_CLS}>
          {tr('saveAsSvg')}
        </button>
      </div>
      <div ref={menuRef} className="relative @lg/tool:hidden" onKeyDown={(e) => e.key === 'Escape' && setMenu(false)}>
        <button type="button" disabled={!image} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className={SECONDARY_CLS}>
          <ImageDown size={13} aria-hidden />
          {tr('saveImage')}
          <ChevronDown size={12} className="text-[var(--text-hint)]" aria-hidden />
        </button>
        {menu && (
          <div role="menu" className="absolute right-0 z-30 mt-1.5 min-w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] p-1 shadow-xl">
            {(['png', 'svg'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="menuitem"
                onClick={() => run(kind)}
                className={`w-full rounded-md px-3 py-1.5 text-left text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ${FOCUS_RING}`}
              >
                {kind.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
      <CopyButton text={image?.svg ?? ''} label={tr('copySvg')} showLabel shortcut="mod+shift+C" disabled={!image} />
    </>
  );
}

/** La tarjeta blanca con el SVG. Con un error, el último código válido se
 *  ve gris y con "No válido" encima, para que nadie lo escanee por error. */
export function CodePreview({
  svg, label, invalid, emptyIcon: EmptyIcon, info, actions, imgClass,
}: {
  svg: string | null;
  label: string;
  invalid: boolean;
  emptyIcon: LucideIcon;
  info?: ReactNode;
  actions?: ReactNode;
  imgClass: string;
}) {
  const { tr } = useDevtools();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <PanelHeader title={tr('preview')}>{actions}</PanelHeader>
      {svg ? (
        <div className="max-w-full overflow-x-auto">
          <div className="relative inline-flex">
            {/* Excepción explícita a los tokens: blanco fijo, como el logo del menú lateral (Sidebar.tsx). */}
            <div
              role="img"
              aria-label={label}
              className={`inline-flex items-center justify-center rounded-xl bg-white p-3 shadow-sm ring-1 ring-[var(--border-card)] ${invalid ? 'opacity-40 grayscale' : ''} ${imgClass}`}
              // El SVG lo arma tools/codes.ts: solo rectángulos y el texto escapado.
              dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg aria-hidden="true" ') }}
            />
            {invalid && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] shadow">{tr('previewInvalid')}</span>
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[12rem] w-[min(16rem,100%)] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-card)] p-4 text-center">
          <EmptyIcon size={28} className="text-[var(--text-hint)]" aria-hidden />
          <p className="text-xs text-[var(--text-hint)]">{tr('previewEmpty')}</p>
        </div>
      )}
      {info && <p className="text-[11px] tabular-nums text-[var(--text-hint)]">{info}</p>}
    </div>
  );
}

/** `AAAAMMDD-HHmm` en hora local, para el nombre del archivo. */
export function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
