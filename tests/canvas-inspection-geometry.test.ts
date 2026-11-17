import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import { buildInspectionGeometry } from "@/components/canvas/inspectionGeometry";
import { inspectionFraming, inspectionParts } from "@/components/canvas/inspectionParts";

describe("interactive component anatomy", () => {
  it.each(inspectionParts)("provides selectable, finite surfaces for $id", (part) => {
    const pieces = buildInspectionGeometry(part.id);
    expect(new Set(pieces.map(piece => piece.id))).toEqual(new Set(part.items.map(item => item.id)));
    const bounds = new Box3();
    for (const piece of pieces) {
      const positions = piece.geometry.getAttribute("position");
      expect(positions.count).toBeGreaterThan(0);
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(piece.geometry.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
      const assembled = new Vector3(...piece.assembled), exploded = new Vector3(...piece.exploded);
      bounds.union(piece.geometry.boundingBox!.clone().translate(exploded));
      expect(assembled.distanceTo(exploded)).toBeGreaterThan(0.02);
      piece.geometry.dispose();
    }
    const size = bounds.getSize(new Vector3());
    expect(size.x).toBeLessThan(part.size[0] + 0.2);
    expect(size.y).toBeLessThan(part.size[1] + 0.2);
    expect(size.z).toBeLessThan(part.size[2] + 0.2);
  });

  it.each([[320,640],[390,844],[820,1180],[844,390],[1024,768],[1440,900]])("fits inspection above or beside its details at %i × %i", (width, height) => {
    const frame = inspectionFraming(width, height);
    expect(frame.centerX - frame.width / 2).toBeGreaterThan(0);
    expect(frame.centerX + frame.width / 2).toBeLessThan(1);
    expect(frame.centerY - frame.height / 2).toBeGreaterThan(0);
    expect(frame.centerY + frame.height / 2).toBeLessThan(1);
    if (width < 1024 && height > width) expect(frame.centerY + frame.height / 2).toBeLessThan(0.43);
    else expect(frame.centerX + frame.width / 2).toBeLessThan(0.55);
  });
});
