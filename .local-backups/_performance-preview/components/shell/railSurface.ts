/** A single outline for the rail and its rounded extension. Coordinates are CSS pixels. */
export type RailShape = { extension: number; center: number; panelHeight: number };
export const RAIL_WIDTH = 68;
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function advanceRailShape(current: RailShape, target: RailShape, delta: number, still: boolean): RailShape {
  const amount = still ? 1 : 1 - Math.exp(-20 * clamp(finite(delta, 0), 0, 0.05));
  const move = (from: number, to: number) => {
    const end = finite(to, 0), start = finite(from, end);
    return Math.abs(end - start) < 0.05 ? end : start + (end - start) * amount;
  };
  return { extension: Math.max(0, move(current.extension, target.extension)), center: move(current.center, target.center), panelHeight: Math.max(0, move(current.panelHeight, target.panelHeight)) };
}

export function railSurfacePath(height: number, shape: RailShape): string {
  const h = Math.max(68, finite(height, 68));
  const edge = RAIL_WIDTH - 0.5, left = 0.5, bottom = h - 0.5;
  const baseRadius = 22;
  const extension = clamp(finite(shape.extension, 0), 0, 360);
  const start = `M22.5 .5 H45.5 Q${edge} .5 ${edge} 22.5`;
  const finish = `V${bottom-baseRadius} Q${edge} ${bottom} 45.5 ${bottom} H22.5 Q${left} ${bottom} ${left} ${bottom-baseRadius} V22.5 Q${left} .5 22.5 .5 Z`;
  if (extension < 0.1 || h < 120) return start + finish;
  const panelHeight = clamp(finite(shape.panelHeight, 76), 54, Math.max(54, h - 80));
  const top = clamp(finite(shape.center, h / 2) - panelHeight / 2, 38, h - 38 - panelHeight);
  const end = top + panelHeight;
  const neck = Math.min(16, extension / 3, top - 22.5, h - 22.5 - end);
  const radius = Math.min(18, extension / 3, panelHeight / 3);
  const right = edge + extension;
  return start + `V${top-neck} Q${edge} ${top} ${edge+neck} ${top} H${right-radius} Q${right} ${top} ${right} ${top+radius} V${end-radius} Q${right} ${end} ${right-radius} ${end} H${edge+neck} Q${edge} ${end} ${edge} ${end+neck}` + finish;
}
