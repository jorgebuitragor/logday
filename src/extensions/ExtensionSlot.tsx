import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { ExtensionBoundary } from './ExtensionBoundary';
import { extensionRuntime } from './runtime';
import type { DailyActionProps, ExtensionId, ExtensionPoint, NoteBlockEditorProps, NoteBlockProps, SidebarStatusProps } from './types';

interface PointProps {
  Settings: object;
  View: object;
  dailyActions: DailyActionProps;
  NoteBlock: NoteBlockProps;
  NoteBlockEditor: NoteBlockEditorProps;
  SidebarStatus: SidebarStatusProps;
}

const Nothing = () => null;

// Un `lazy` por extensión y punto, para no recrearlo en cada render. Si el
// `import()` falla, se olvida: al volver a montarse lo reintenta (si no,
// React guarda el rechazo para siempre).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lazyCache = new Map<string, LazyExoticComponent<ComponentType<any>>>();

function lazyPoint(id: ExtensionId, point: ExtensionPoint) {
  const key = `${id}:${point}`;
  let component = lazyCache.get(key);
  if (!component) {
    component = lazy(() =>
      extensionRuntime.load(id).then(
        (mod) => ({ default: (mod[point] as ComponentType<object> | undefined) ?? Nothing }),
        (err) => {
          lazyCache.delete(key);
          throw err;
        },
      ),
    );
    lazyCache.set(key, component);
  }
  return component;
}

/** Dibuja lo que una extensión aporta a un punto de la app, cargándolo
 *  bajo demanda y aislado en su `ExtensionBoundary` (R15, R16). */
export function ExtensionSlot<P extends ExtensionPoint>({
  id, point, props, variant,
}: {
  id: ExtensionId;
  point: P;
  props: PointProps[P];
  variant?: 'block' | 'inline';
}) {
  const { language, setExtensionEnabled } = useAppStore(
    useShallow((s) => ({ language: s.language, setExtensionEnabled: s.setExtensionEnabled })),
  );
  const Component = lazyPoint(id, point);
  return (
    <ExtensionBoundary
      id={id}
      language={language}
      variant={variant}
      onDisable={() => void setExtensionEnabled(id, false)}
    >
      <Suspense fallback={null}>
        <Component {...props} />
      </Suspense>
    </ExtensionBoundary>
  );
}
