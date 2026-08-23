import { useEffect, useState } from 'react';
import { registerRootZoneHighlight, unregisterRootZoneHighlight } from '../../lib/folderDragDrop';

// Línea visual que indica que la carpeta se soltará en el nivel raíz
export function RootDropLine() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    registerRootZoneHighlight(setActive);
    return () => unregisterRootZoneHighlight(setActive);
  }, []);
  return (
    <div className={`mx-2 mt-1 h-0.5 rounded-full transition-colors duration-100 ${
      active ? 'bg-indigo-500' : 'bg-transparent'
    }`} />
  );
}
