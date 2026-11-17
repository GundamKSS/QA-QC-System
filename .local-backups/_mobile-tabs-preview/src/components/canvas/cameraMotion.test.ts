import { describe, expect, it } from "vitest";
import { motion, stage } from "@/config/experience";
import { Euler, Quaternion } from "three";
import { clampParallax, sampleCamera, sampleUsernameBackdrop, successEntryBlend } from "./cameraMotion";

describe("camera parallax budget", () => {
  it("keeps diagonal and edge rotations within one 2.5 degree budget", () => {
    const max = 2.5 * Math.PI / 180;
    for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, -1]]) {
      const pointer = clampParallax(x, y);
      const rotation = new Quaternion().setFromEuler(new Euler(-pointer.y * max, -pointer.x * max, 0));
      expect(rotation.angleTo(new Quaternion())).toBeLessThanOrEqual(max + 1e-12);
    }
    expect(clampParallax(0.3, -0.4)).toEqual({ x: 0.3, y: -0.4 });
  });
});

describe("camera interaction beats", () => {
  it("finishes the success fade before the existing navigation deadline", () => {
    const start = sampleCamera("success", 0, 1, false);
    const end = sampleCamera("success", motion.successHoldMs / 1000, 1, false);
    expect(start.opacity).toBe(1);
    expect(end.opacity).toBe(0);
    expect(end.zoom).toBeGreaterThan(0);
    expect(end.zoom).toBeLessThan(start.zoom);
    expect(end.aimY).toBeGreaterThan(start.aimY);
  });

  it("keeps reduced motion at the same view through focus and success", () => {
    expect(sampleCamera("focus", 0, 1, true)).toEqual(sampleCamera("success", 0.6, 1, true));
    expect(sampleCamera("idle", 0, 0, true).zoom).toBe(1);
  });

  it("moves closer for focus and backs away on lock without changing the aim", () => {
    const focus = sampleCamera("focus", 0, 1, false);
    const locked = sampleCamera("locked", 0, 1, false);
    expect(focus.zoom).toBeLessThan(1);
    expect(locked.zoom).toBeGreaterThan(1);
    expect(locked.aimY).toBe(focus.aimY);
  });
});

describe("username backdrop camera", () => {
  it("enlarges and centers every layout using the configured backdrop height", () => {
    const config = stage.interaction.usernameBackdrop;
    for (const framing of Object.values(stage.framing)) {
      const backdrop = sampleUsernameBackdrop(framing, "focus", true, false);
      expect(backdrop.active).toBe(true);
      expect(backdrop.zoom).toBeGreaterThan(0);
      expect(backdrop.zoom).toBeLessThan(1);
      expect(framing.height / backdrop.zoom).toBeCloseTo(config.height);
      expect(backdrop.centerX).toBe(config.centerX);
      expect(backdrop.centerY).toBe(config.centerY);
      expect(backdrop.opacity).toBe(config.opacity);
    }
  });

  it("returns to each original framing when username focus ends", () => {
    for (const framing of Object.values(stage.framing)) {
      expect(sampleUsernameBackdrop(framing, "focus", false, false)).toEqual({
        active: false, zoom: 1, centerX: framing.centerX, centerY: framing.centerY, opacity: 1,
      });
    }
    expect(sampleCamera("focus", 0, 1, false).zoom).toBe(1 - stage.interaction.focusPush);
  });

  it.each(["submitting", "success", "locked"] as const)("gives %s priority over username focus", (phase) => {
    expect(sampleUsernameBackdrop(stage.framing.phone, phase, true, false).active).toBe(false);
  });

  it("keeps reduced motion at the original size and framing", () => {
    for (const phase of ["focus", "error", "offline", "success"] as const) {
      expect(sampleUsernameBackdrop(stage.framing.phone, phase, true, true)).toEqual(
        sampleUsernameBackdrop(stage.framing.phone, phase, false, true),
      );
    }
  });

  it("still responds to username focus while correcting an error or offline", () => {
    for (const phase of ["error", "offline"] as const) {
      expect(sampleUsernameBackdrop(stage.framing.phone, phase, true, false).active).toBe(true);
    }
  });

  it("joins success from the visible view before the fly-through without extending the hold", () => {
    expect(successEntryBlend(0)).toBe(0);
    expect(successEntryBlend(0.075)).toBeCloseTo(0.5);
    expect(successEntryBlend(0.15)).toBe(1);
    expect(successEntryBlend(stage.interaction.successFlyStartSeconds)).toBe(1);
    expect(sampleCamera("success", motion.successHoldMs / 1000, 1, false).opacity).toBe(0);
  });
});
