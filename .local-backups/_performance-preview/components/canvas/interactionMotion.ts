export type DragIntent = "pending" | "horizontal" | "vertical";

/** Let the browser keep ordinary vertical touch scrolling. */
export function dragIntent(dx: number, dy: number, touch: boolean): DragIntent {
  const x = Math.abs(dx);
  const y = Math.abs(dy);
  const threshold = touch ? 6 : 3;
  if (Math.max(x, y) < threshold) return "pending";
  if (touch && y > x) return "vertical";
  return x > y * (touch ? 1.15 : 0.5) ? "horizontal" : "pending";
}

export function clampDrag(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

export function damp(current: number, target: number, strength: number, delta: number): number {
  return target + (current - target) * Math.exp(-strength * delta);
}

/** Integrate a small release impulse while the dragged pose returns to its rest angle. */
export function releaseDrag(
  offset: number,
  velocity: number,
  delta: number,
  limit: number,
  returnDamping: number,
  inertiaDamping: number,
): { offset: number; velocity: number } {
  const step = Math.min(Math.max(delta, 0), 0.05);
  const moved = offset + velocity * step;
  const nextVelocity = Math.abs(moved) > limit ? 0 : velocity * Math.exp(-inertiaDamping * step);
  return {
    offset: damp(clampDrag(moved, limit), 0, returnDamping, step),
    velocity: Math.abs(nextVelocity) < 0.0001 ? 0 : nextVelocity,
  };
}
