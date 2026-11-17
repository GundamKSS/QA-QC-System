import { describe, expect, it } from "vitest";
import { stage } from "@/lib/config/experience";
import { advanceScanOrbit, focusOrbitEnvelope, scanOrbitActive } from "@/components/canvas/scanOrbit";
import { buildCompressorGeometry, disposeCompressorGeometry } from "@/components/canvas/compressorGeometry";
import type { ScanPhase } from "@/components/canvas/scanTimeline";

const turn = Math.PI * 2;
const phases: ScanPhase[] = ["reveal", "idle", "focus", "submitting", "success", "error", "locked", "offline"];

describe("focused scanner priority", () => {
  it.each(phases)("handles focused and blurred inputs during %s", (phase) => {
    const allowed = !["submitting", "success", "locked"].includes(phase);
    expect(scanOrbitActive(phase, true)).toBe(allowed);
    expect(scanOrbitActive(phase, false)).toBe(false);
  });
});

describe("scanner orbit clock", () => {
  it.each([20, 30, 60, 120])("completes a full turn at %i frames per second", (fps) => {
    const start = 0.31;
    let angle = start;
    const frames = Math.round(stage.scan.focusOrbitSeconds * fps);
    for (let frame = 0; frame < frames; frame++) angle = advanceScanOrbit(angle, 1 / fps, true);
    expect(angle).toBeCloseTo(start, 10);
  });

  it("holds its position while inactive and resumes from that angle", () => {
    const paused = advanceScanOrbit(0.7, 1 / 60, true);
    expect(advanceScanOrbit(paused, 4.2, false)).toBe(paused);
    const resumed = advanceScanOrbit(paused, 1 / 60, true);
    const uninterrupted = advanceScanOrbit(advanceScanOrbit(0.7, 1 / 60, true), 1 / 60, true);
    expect(resumed).toBe(uninterrupted);
  });

  it("crosses the turn boundary with the same angular step", () => {
    const step = (1 / 60) * turn / stage.scan.focusOrbitSeconds;
    const before = turn - step / 2;
    const after = advanceScanOrbit(before, 1 / 60, true);
    expect(after).toBeCloseTo(step / 2, 12);
    expect((after - before + turn) % turn).toBeCloseTo(step, 12);
  });

  it.each([-1, 0, NaN, Infinity, -Infinity])("ignores invalid or nonpositive frame time %s", (delta) => {
    expect(advanceScanOrbit(0.7, delta, true)).toBe(0.7);
  });

  it.each([1, 60, Number.MAX_VALUE])("caps a long frame of %s seconds instead of catching up", (delta) => {
    expect(advanceScanOrbit(0.7, delta, true)).toBe(advanceScanOrbit(0.7, 0.05, true));
  });

  it.each([-turn * 3 - 0.1, turn * 7 + 0.1, Number.MAX_VALUE, NaN, Infinity, -Infinity])("normalizes angle %s to a finite turn", (angle) => {
    for (const active of [false, true]) {
      const next = advanceScanOrbit(angle, 0.05, active);
      expect(Number.isFinite(next)).toBe(true);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(turn);
    }
  });
});


describe("focused scanner clearance", () => {
  it("keeps the entire machine inside the inner edge of the orbit, including handles and fittings", () => {
    const parts = buildCompressorGeometry();
    const radiusX = focusOrbitEnvelope.radiusX - focusOrbitEnvelope.clearance;
    const radiusZ = focusOrbitEnvelope.radiusZ - focusOrbitEnvelope.clearance;
    let outermost = 0;
    try {
      for (const geometry of Object.values(parts)) {
        const points = geometry.getAttribute("position");
        for (let i = 0; i < points.count; i++) {
          outermost = Math.max(outermost, (points.getX(i) / radiusX) ** 2 + (points.getZ(i) / radiusZ) ** 2);
        }
      }
      // The orbit shares the model's yaw, so this clearance holds for every camera angle.
      expect(outermost).toBeLessThan(1);
    } finally { disposeCompressorGeometry(parts); }
  });
});
