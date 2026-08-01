import type { CSSProperties, MouseEvent, ReactNode } from 'react';

interface ModalPanelProps {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** Detiene la propagación del click para que el ModalOverlay que lo envuelve
 * no lo interprete como un click en el fondo. */
export function ModalPanel({ className, style, children }: ModalPanelProps) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <div className={className} style={style} onClick={stop}>
      {children}
    </div>
  );
}
