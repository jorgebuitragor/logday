// Soltar carpetas o .zip sobre la vista para importarlos (SK14). Tauri
// recibe lo que se arrastra desde el sistema antes que el WebView, así que
// se usa su evento (como en Notas). La ruta la vuelve a comprobar Rust
// contra lo que él mismo anotó del evento: el webview no puede inventarla.
import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type { Tr } from './text';

/** `true` mientras se arrastra algo encima de la ventana. */
export function useSkillDrop(enabled: boolean, onDrop: (paths: string[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const cb = useRef(onDrop);
  cb.current = onDrop;
  useEffect(() => {
    if (!enabled) {
      setDragging(false);
      return;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onDragDropEvent((event) => {
          const p = event.payload as { type: string; paths?: string[] };
          if (p.type === 'enter' || p.type === 'over') setDragging(true);
          else if (p.type === 'leave') setDragging(false);
          else if (p.type === 'drop') {
            setDragging(false);
            if (p.paths?.length) cb.current(p.paths);
          }
        }),
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled]);
  return dragging;
}

export function DropOverlay({ tr }: { tr: Tr }) {
  return (
    <div className="skl-overlay-in pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-500 bg-[var(--bg-panel)]/90 text-center backdrop-blur-sm">
      <Upload size={28} className="skl-float text-indigo-400" aria-hidden />
      <p className="text-sm font-medium text-[var(--text-primary)]">{tr('drop.title')}</p>
      <p className="text-xs text-[var(--text-hint)]">{tr('drop.help')}</p>
    </div>
  );
}
