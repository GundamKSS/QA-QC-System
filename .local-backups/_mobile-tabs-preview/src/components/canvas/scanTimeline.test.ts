import { describe, expect, it } from "vitest";
import { dims } from "./compressorGeometry";
import { blendScan, getIntroDuration, sampleScan, scanBounds, scanTiming, type ScanPhase } from "./scanTimeline";

describe("scan intro", () => {
  it("reveals upwards from below the base to above the entire model", () => {
    const start = sampleScan(0);
    const middle = sampleScan(scanTiming.firstIntroSeconds / 2);
    const end = sampleScan(scanTiming.firstIntroSeconds);
    expect(start.scanY).toBeLessThan(0);
    expect(start.introProgress).toBe(0);
    expect(middle.scanY).toBeGreaterThan(start.scanY);
    expect(end.scanY).toBeGreaterThan(dims.height);
    expect(end.introProgress).toBe(1);
    expect(end.ringOpacity).toBe(0);
  });

  it("uses a shorter repeat intro only on the same local day", () => {
    expect(getIntroDuration(null, "2026-10-18")).toBe(1.4);
    expect(getIntroDuration("2026-10-17", "2026-10-18")).toBe(1.4);
    const repeat = getIntroDuration("2026-10-18", "2026-10-18");
    expect(repeat).toBe(0.45);
    expect(sampleScan(repeat, { introSeconds: repeat }).introProgress).toBe(1);
    expect(sampleScan(repeat, { introSeconds: repeat }).scanY).toBeGreaterThan(dims.height);
  });

  it("plays the intro while the initial form phase is idle", () => {
    expect(sampleScan(0.3, { phase: "idle" })).toEqual(sampleScan(0.3, { phase: "reveal" }));
  });

  it("keeps the blueprint reveal active on every idle sweep and loops without a jump", () => {
    const end = scanTiming.firstIntroSeconds;
    expect(sampleScan(end + scanTiming.topHoldSeconds / 2).scanY).toBe(scanBounds.maxY);
    const down = sampleScan(end + scanTiming.idleCycleSeconds / 2);
    expect(down.scanY).toBeLessThan(scanBounds.midY);
    // Full-metal override must stay off throughout both directions of repeated scans.
    for (let t = end; t < end + scanTiming.idleCycleSeconds * 2; t += 0.25) {
      expect(sampleScan(t).reveal).toBe(0);
    }
    const before = sampleScan(end + scanTiming.idleCycleSeconds - 0.001);
    const after = sampleScan(end + scanTiming.idleCycleSeconds + 0.001);
    expect(Math.abs(after.scanY - before.scanY)).toBeLessThan(0.001);
    expect(Math.abs(after.ringOpacity - before.ringOpacity)).toBeLessThan(0.001);
  });
});

describe("scan form phases", () => {
  it("starts interrupted phases at the last visible laser position and settles on their target", () => {
    const phases: ScanPhase[] = ["idle", "focus", "submitting", "error", "success", "locked", "offline"];
    for (const phase of phases) {
      const from = sampleScan(4);
      const target = sampleScan(6, { phase, phaseElapsed: 0 });
      expect(blendScan(from, target, 0)).toMatchObject({ scanY: from.scanY, reveal: from.reveal, ringOpacity: from.ringOpacity });
      expect(blendScan(from, target, scanTiming.phaseTransitionSeconds)).toEqual(target);
    }
  });

  it("can interrupt a blend again without jumping or exceeding either frame", () => {
    const idle = sampleScan(3);
    const focus = sampleScan(3, { phase: "focus" });
    const visible = blendScan(idle, focus, scanTiming.phaseTransitionSeconds / 2);
    const submit = sampleScan(3, { phase: "submitting", phaseElapsed: 0 });
    expect(blendScan(visible, submit, 0).scanY).toBe(visible.scanY);
    for (const field of ["scanY", "reveal", "ringOpacity"] as const) {
      expect(visible[field]).toBeGreaterThanOrEqual(Math.min(idle[field], focus[field]));
      expect(visible[field]).toBeLessThanOrEqual(Math.max(idle[field], focus[field]));
    }
  });

  it("keeps a fully revealed stationary object when the form is focused", () => {
    const frame = sampleScan(0, { phase: "focus" });
    expect(frame.reveal).toBe(1);
    expect(frame.introProgress).toBe(1);
    expect(frame.scanY).toBe(scanBounds.midY);
    expect(sampleScan(25, { phase: "focus" })).toEqual(frame);
  });

  it("turns the ring off while the account is locked, including reduced motion", () => {
    for (const still of [false, true]) {
      const frame = sampleScan(0, { phase: "locked", still });
      expect(frame.reveal).toBe(1);
      expect(frame.ringOpacity).toBe(0);
    }
  });

  it("scans quickly during submission without changing the revealed material", () => {
    const frame = sampleScan(99, { phase: "submitting", phaseElapsed: scanTiming.submittingSweepSeconds / 2 });
    expect(frame.scanY).toBeCloseTo(scanBounds.midY);
    expect(frame.reveal).toBe(1);
    expect(frame.ringOpacity).toBeGreaterThan(0.5);
    expect(sampleScan(99, { phase: "submitting", phaseElapsed: scanTiming.submittingSweepSeconds }).scanY).toBe(scanBounds.maxY);
  });

  it("completes the success scan and fades its ring before navigation", () => {
    const start = sampleScan(99, { phase: "success", phaseElapsed: 0 });
    const end = sampleScan(99, { phase: "success", phaseElapsed: scanTiming.successSeconds });
    expect(start.scanY).toBe(scanBounds.midY);
    expect(end.scanY).toBe(scanBounds.maxY);
    expect(end.reveal).toBe(1);
    expect(end.ringOpacity).toBe(0);
    expect(sampleScan(99, { phase: "success", phaseElapsed: 999 })).toEqual(end);
  });

  it.each(["error", "offline"] as const)("preserves the idle scan during %s", (phase) => {
    expect(sampleScan(4, { phase })).toEqual(sampleScan(4, { phase: "idle" }));
  });

  it("shows full material with a still, modest ring under reduced motion", () => {
    const frame = sampleScan(0, { still: true });
    expect(frame).toEqual({ scanY: scanBounds.midY, reveal: 1, ringOpacity: 0.25, introProgress: 1 });
    expect(sampleScan(200, { still: true, phase: "submitting" })).toEqual(frame);
  });
});

describe("scan input bounds", () => {
  const phases: ScanPhase[] = ["reveal", "idle", "focus", "submitting", "success", "error", "locked", "offline"];

  it("returns finite, bounded uniforms for invalid or extreme elapsed values", () => {
    for (const phase of phases) {
      for (const elapsed of [-1, NaN, Infinity, -Infinity, 0, 0.25, 1.4, 100, Number.MAX_VALUE]) {
        const frame = sampleScan(elapsed, { phase, phaseElapsed: elapsed });
        expect(Number.isFinite(frame.scanY)).toBe(true);
        expect(frame.scanY).toBeGreaterThanOrEqual(scanBounds.minY);
        expect(frame.scanY).toBeLessThanOrEqual(scanBounds.maxY);
        for (const value of [frame.reveal, frame.ringOpacity, frame.introProgress]) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it.each([-1, NaN, Infinity, -Infinity])("treats invalid intro duration %s as the normal intro", (introSeconds) => {
    expect(sampleScan(0.5, { introSeconds })).toEqual(sampleScan(0.5));
  });
});
