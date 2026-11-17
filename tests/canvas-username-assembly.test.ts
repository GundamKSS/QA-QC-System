import { describe, expect, it } from "vitest";
import { buildInspectionGeometry } from "@/components/canvas/inspectionGeometry";
import { inspectionPart } from "@/components/canvas/inspectionParts";
import { scanBounds, type ScanPhase } from "@/components/canvas/scanTimeline";
import { advanceUsernameAssembly, usernameAssemblyActive, usernameAssemblyLayouts } from "@/components/canvas/usernameAssembly";

const phases: ScanPhase[] = ["reveal", "idle", "focus", "submitting", "success", "error", "locked", "offline"];

describe("Username blueprint composition", () => {
  it.each(phases)("respects credential focus and authentication priority during %s", (phase) => {
    expect(usernameAssemblyActive(phase, false, false)).toBe(false);
    expect(usernameAssemblyActive(phase, true, true)).toBe(false);
    expect(usernameAssemblyActive(phase, true, false)).toBe(!["submitting", "success", "locked"].includes(phase));
  });

  it("reverses from the current spread when switching fields quickly", () => {
    let amount = 0;
    for (let i = 0; i < 12; i++) amount = advanceUsernameAssembly(amount, 1 / 60, true, false, "focus");
    const opening = amount;
    amount = advanceUsernameAssembly(amount, 1 / 60, false, false, "focus");
    expect(amount).toBeLessThan(opening);
    expect(amount).toBeGreaterThan(0);
    const closing = amount;
    amount = advanceUsernameAssembly(amount, 1 / 60, true, false, "focus");
    expect(amount).toBeGreaterThan(closing);
    expect(amount).toBeLessThan(1);
    for (let i = 0; i < 120; i++) amount = advanceUsernameAssembly(amount, 1 / 60, false, false, "focus");
    expect(amount).toBeLessThan(0.001);
  });

  it("reassembles before the login fly-through finishes and holds still for reduced motion", () => {
    let amount = 1;
    for (let i = 0; i < 18; i++) amount = advanceUsernameAssembly(amount, 1 / 60, true, false, "success");
    expect(amount).toBeLessThan(0.01);
    expect(advanceUsernameAssembly(1, 1 / 60, true, true, "focus")).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity, -1, 0, 60])("keeps frame time %s finite and bounded", (delta) => {
    const amount = advanceUsernameAssembly(0.4, delta, true, false, "focus");
    expect(Number.isFinite(amount)).toBe(true);
    expect(amount).toBeGreaterThanOrEqual(0.4);
    expect(amount).toBeLessThanOrEqual(advanceUsernameAssembly(0.4, 0.05, true, false, "focus"));
  });

  it("keeps all three detailed assemblies above the lowered laser and inside the upper model silhouette", () => {
    expect(new Set(usernameAssemblyLayouts.map(layout => layout.id))).toEqual(new Set(["gauge", "pump", "motor"]));
    for (const layout of usernameAssemblyLayouts) {
      const part = inspectionPart(layout.id);
      const pieces = buildInspectionGeometry(layout.id);
      try {
        for (const piece of pieces) {
          const bounds = piece.geometry.boundingBox!;
          const low = part.anchor[1] + layout.offset[1] + (piece.exploded[1] + bounds.min.y) * 0.65;
          const high = part.anchor[1] + layout.offset[1] + (piece.exploded[1] + bounds.max.y) * 0.65;
          expect(low).toBeGreaterThan(scanBounds.midY - 0.45 + 0.06);
          expect(high).toBeLessThan(scanBounds.maxY);
        }
      } finally { pieces.forEach(piece => piece.geometry.dispose()); }
    }
  });
});
