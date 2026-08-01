type HighlightCallback = (active: boolean) => void;

const dropHighlightCallbacks = new Map<string, HighlightCallback>();
let rootZoneHighlightCallback: HighlightCallback | null = null;

export function registerDropHighlight(path: string, cb: HighlightCallback) {
  dropHighlightCallbacks.set(path, cb);
}

export function unregisterDropHighlight(path: string) {
  dropHighlightCallbacks.delete(path);
}

export function registerRootZoneHighlight(cb: HighlightCallback) {
  rootZoneHighlightCallback = cb;
}

export function unregisterRootZoneHighlight(cb: HighlightCallback) {
  if (rootZoneHighlightCallback === cb) rootZoneHighlightCallback = null;
}

// Drag & drop con Pointer Events (funciona en WKWebView/Tauri, a
// diferencia del HTML5 Drag and Drop API que es poco confiable ahí).
export function startFolderDrag(
  draggedPath: string,
  onDrop: (targetPath: string) => void,
) {
  document.body.style.cursor = 'grabbing';

  const onMove = (e: PointerEvent) => {
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    // Encontrar la carpeta bajo el cursor (si hay alguna)
    let folderUnderCursor: string | null = null;
    for (const el of els) {
      const found = (el as HTMLElement).closest?.('[data-folder-path]');
      if (found) { folderUnderCursor = found.getAttribute('data-folder-path'); break; }
    }
    // Actualizar highlight de carpetas
    dropHighlightCallbacks.forEach((cb, path) => {
      const valid = path !== draggedPath && !path.startsWith(draggedPath + '/');
      cb(valid && folderUnderCursor === path);
    });
    // Actualizar línea guía de zona raíz
    const overRoot = folderUnderCursor === null &&
      els.some(el => (el as HTMLElement).closest?.('[data-root-zone]') != null);
    rootZoneHighlightCallback?.(overRoot);
  };

  const onUp = (e: PointerEvent) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
    dropHighlightCallbacks.forEach(cb => cb(false));
    rootZoneHighlightCallback?.(false);

    // Encontrar la carpeta destino bajo el cursor
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    let target: string | null = null;
    for (const el of els) {
      const found = (el as HTMLElement).closest?.('[data-folder-path]');
      if (found) { target = found.getAttribute('data-folder-path'); break; }
    }
    if (target && target !== draggedPath && !target.startsWith(draggedPath + '/')) {
      onDrop(target);
    } else if (!target && els.some(el => (el as HTMLElement).closest?.('[data-root-zone]') != null)) {
      // Soltar en zona raíz → mover a nivel raíz
      onDrop('');
    }
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}
