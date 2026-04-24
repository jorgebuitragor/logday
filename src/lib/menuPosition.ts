export interface MenuSize {
  width: number;
  height: number;
}

export interface MenuPoint {
  x: number;
  y: number;
}

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PointerOptions {
  padding?: number;
}

interface AnchorOptions {
  sideX?: 'right' | 'left';
  alignY?: 'start' | 'end';
  gap?: number;
  padding?: number;
  flip?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(value, max));
}

function viewportBounds(padding: number) {
  return {
    minX: padding,
    minY: padding,
    maxX: window.innerWidth - padding,
    maxY: window.innerHeight - padding,
  };
}

export function placeMenuAtPointer(point: MenuPoint, size: MenuSize, options: PointerOptions = {}): MenuPoint {
  const padding = options.padding ?? 8;
  const bounds = viewportBounds(padding);

  let x = point.x;
  let y = point.y;

  if (x + size.width > bounds.maxX) x = point.x - size.width;
  if (y + size.height > bounds.maxY) y = point.y - size.height;

  x = clamp(x, bounds.minX, bounds.maxX - size.width);
  y = clamp(y, bounds.minY, bounds.maxY - size.height);

  return { x, y };
}

export function placeMenuNearAnchor(anchor: AnchorRect, size: MenuSize, options: AnchorOptions = {}): MenuPoint {
  const padding = options.padding ?? 8;
  const gap = options.gap ?? 4;
  const flip = options.flip ?? true;

  let sideX = options.sideX ?? 'right';
  let alignY = options.alignY ?? 'start';

  const bounds = viewportBounds(padding);

  const placeX = () => (sideX === 'right' ? anchor.right + gap : anchor.left - size.width - gap);
  const placeY = () => (alignY === 'start' ? anchor.top : anchor.bottom - size.height);

  let x = placeX();
  let y = placeY();

  if (flip) {
    if (x + size.width > bounds.maxX && sideX === 'right') {
      sideX = 'left';
      x = placeX();
    } else if (x < bounds.minX && sideX === 'left') {
      sideX = 'right';
      x = placeX();
    }

    if (y + size.height > bounds.maxY && alignY === 'start') {
      alignY = 'end';
      y = placeY();
    } else if (y < bounds.minY && alignY === 'end') {
      alignY = 'start';
      y = placeY();
    }
  }

  x = clamp(x, bounds.minX, bounds.maxX - size.width);
  y = clamp(y, bounds.minY, bounds.maxY - size.height);

  return { x, y };
}