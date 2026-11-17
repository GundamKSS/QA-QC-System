import { describe, expect, it } from "vitest";
import { motion } from "@/lib/config/experience";
import { checkpointPositions, sampleCheckpoint, sampleSignalWave, sampleSignalStrength } from "@/components/canvas/checkpointPulse";

describe("compressor inspection signals", () => {
  it("lights each real component as the introductory laser reaches it", () => {
    checkpointPositions.forEach(([, height], index) => {
      expect(sampleCheckpoint(index, height - 0.001, 0, "reveal", false).tone).toBe("dim");
      expect(sampleCheckpoint(index, height, 0, "reveal", false).tone).toBe("active");
      expect(sampleCheckpoint(index, -1, 20, "idle", false).tone).toBe("active");
    });
  });
  it("finishes all success checks within the existing login hold", () => {
    checkpointPositions.forEach((_, index) => {
      expect(sampleCheckpoint(index, 0, motion.successHoldMs / 1000, "success", false)).toEqual({tone:"pass",checkProgress:1});
    });
    expect(sampleCheckpoint(2, 0, 0.05, "success", false).checkProgress).toBe(0);
  });
  it("keeps lock and reduced-motion error signals quiet", () => {
    checkpointPositions.forEach((_, index) => {
      expect(sampleCheckpoint(index, 3, 1, "locked", false)).toEqual({tone:"dim",checkProgress:0});
      expect(sampleCheckpoint(index, 3, 0.05, "error", true).tone).toBe("dim");
      expect(sampleCheckpoint(index, 3, 0, "success", true)).toEqual({tone:"pass",checkProgress:1});
    });
    expect(sampleCheckpoint(1, 3, 0.05, "error", false).tone).toBe("fail");
    expect(sampleCheckpoint(1, 3, 1, "error", false).tone).toBe("dim");
  });
  it("expands a wave and fades it out before resetting without a bright flash", () => {
    const start=sampleSignalWave(0,0,0,true,false);
    const middle=sampleSignalWave(1.4,0,0,true,false);
    const end=sampleSignalWave(2.799,0,0,true,false);
    expect(start.opacity).toBe(0); expect(middle.opacity).toBeGreaterThan(0);
    expect(end.opacity).toBeLessThan(0.0001);expect(end.scale).toBeGreaterThan(middle.scale);
    expect(sampleSignalWave(2.8,0,0,true,false)).toEqual(start);
  });
  it("staggers both wavefronts and all three stations", () => {
    expect(sampleSignalWave(0.5,0,0,true,false)).not.toEqual(sampleSignalWave(0.5,0,1,true,false));
    expect(sampleSignalWave(0.5,0,0,true,false)).not.toEqual(sampleSignalWave(0.5,1,0,true,false));
  });
  it("hides every wave during static presentation or non-active states", () => {
    for (const time of [0,0.8,2.4,100]) for (const station of [0,1,2]) for (const wave of [0,1]) {
      expect(sampleSignalWave(time,station,wave,true,true)).toEqual({scale:1,opacity:0});
      expect(sampleSignalWave(time,station,wave,false,false)).toEqual({scale:1,opacity:0});
    }
  });
  it("returns bounded finite values for clock interruptions", () => {
    for (const time of [-1,NaN,Infinity,0,0.01,1.3,2.799,2.8,1000,Number.MAX_VALUE]) {
      const sample=sampleSignalWave(time,1,1,true,false);
      expect(Number.isFinite(sample.opacity)).toBe(true);expect(Number.isFinite(sample.scale)).toBe(true);
      expect(sample.opacity).toBeGreaterThanOrEqual(0);expect(sample.opacity).toBeLessThanOrEqual(0.75);
      expect(sample.scale).toBeGreaterThanOrEqual(1);expect(sample.scale).toBeLessThanOrEqual(3.3);
    }
  });
  it("keeps the core pulse gentle and freezes it under reduced motion", () => {
    for (const time of [0, 0.4, 1.4, 2.8, NaN, Infinity]) {
      expect(sampleSignalStrength(time, 1, false)).toBeGreaterThanOrEqual(0.76);
      expect(sampleSignalStrength(time, 1, false)).toBeLessThanOrEqual(1);
      expect(sampleSignalStrength(time, 1, true)).toBe(0.95);
    }
  });
});
