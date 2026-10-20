import { useState } from 'react';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  /** Double-click resets to default width */
  onReset?: () => void;
}

/**
 * A thin draggable vertical divider that resizes adjacent panels.
 * Uses pointer capture so the drag stays smooth even when the cursor
 * moves quickly outside the element.
 */
export function ResizeHandle({ onResize, onReset }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.movementX !== 0) onResize(e.movementX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={onReset}
      title={onReset ? 'Doble clic para restablecer' : undefined}
      className={`group relative z-10 w-[3px] shrink-0 cursor-col-resize select-none transition-colors ${
        dragging ? 'bg-white/20' : 'bg-transparent hover:bg-white/10'
      }`}
    >
      {/* Wider interactive hit area */}
      <div className="absolute inset-y-0 -left-2 -right-2" />
    </div>
  );
}
