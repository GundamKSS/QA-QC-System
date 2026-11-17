import { describe, expect, it } from "vitest";
import { motion, stage } from "@/lib/config/experience";
import { Euler, Quaternion } from "three";
import { clampParallax, sampleCamera, samplePasswordBackdrop, sampleUsernameBackdrop, springStep, type Spring } from "@/components/canvas/cameraMotion";

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

  it("keeps Password at the complete view and backs away on lock", () => {
    const focus = sampleCamera("focus", 0, 1, false);
    const locked = sampleCamera("locked", 0, 1, false);
    expect(focus.zoom).toBe(1);
    expect(locked.zoom).toBeGreaterThan(1);
    expect(locked.aimY).toBe(focus.aimY);
  });
});

describe("username backdrop camera", () => {
  it("enlarges Username into a subdued backdrop on every screen", () => {
    const config = stage.interaction.usernameBackdrop;
    for (const framing of Object.values(stage.framing)) {
      const backdrop = sampleUsernameBackdrop(framing, "focus", true, false);
      expect(backdrop.active).toBe(true);
      expect(backdrop.zoom).toBeGreaterThan(0);
      expect(backdrop.zoom).toBeLessThan(1);
      const compact = framing.height < 0.4;
      expect(backdrop.zoom).toBeCloseTo(compact
        ? Math.max(framing.height / config.compactHeight, framing.width / config.compactWidth)
        : framing.height / config.height);
      expect(backdrop.centerX).toBe(config.centerX);
      expect(backdrop.centerY).toBe(compact ? config.compactCenterY : config.centerY);
      expect(backdrop.opacity).toBeLessThan(0.6);
    }
  });

  it("keeps portrait assemblies within the screen width and above the form", () => {
    for (const framing of [stage.framing.phone, stage.framing.phoneShort, stage.framing.tablet]) {
      const backdrop = sampleUsernameBackdrop(framing, "focus", true, false);
      expect(framing.width / backdrop.zoom).toBeLessThanOrEqual(stage.interaction.usernameBackdrop.compactWidth);
      expect(backdrop.centerY).toBeLessThan(0.25);
    }
  });

  it("returns to each original framing when username focus ends", () => {
    for (const framing of Object.values(stage.framing)) {
      expect(sampleUsernameBackdrop(framing, "focus", false, false)).toEqual({
        active: false, zoom: 1, centerX: framing.centerX, centerY: framing.centerY, opacity: 1,
      });
    }
    expect(sampleCamera("focus", 0, 1, false).zoom).toBe(1);
  });

  it.each(["success", "locked"] as const)("gives %s priority over username focus", (phase) => {
    expect(sampleUsernameBackdrop(stage.framing.phone, phase, true, false).active).toBe(false);
  });

  it("holds the close framing while authentication is pending", () => {
    for (const framing of Object.values(stage.framing)) {
      expect(sampleUsernameBackdrop(framing, "submitting", true, false)).toEqual(
        sampleUsernameBackdrop(framing, "focus", true, false),
      );
    }
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

  it("only moves forward from the current distance, finishing within the navigation hold", () => {
    let previousZoom = 1;
    for (let time = 0; time <= motion.successHoldMs / 1000; time += 1 / 120) {
      const frame = sampleCamera("success", time, 1, false);
      expect(frame.zoom).toBeGreaterThan(0);
      expect(frame.zoom).toBeLessThanOrEqual(previousZoom);
      previousZoom = frame.zoom;
    }
    expect(sampleCamera("success", stage.interaction.successFlyStartSeconds, 1, false).zoom).toBe(1);
    expect(sampleCamera("success", motion.successHoldMs / 1000, 1, false).opacity).toBe(0);
  });
});

describe("password fullscreen camera", () => {
  it("zooms further than Username on every layout and centres the exploded parts", () => {
    for (const framing of Object.values(stage.framing)) {
      const username = sampleUsernameBackdrop(framing, "focus", true, false);
      const password = samplePasswordBackdrop(framing, "focus", true, false);
      expect(password.zoom).toBeGreaterThan(0);
      expect(password.zoom).toBeLessThan(username.zoom);
      expect(password.centerX).toBe(0.5);
      expect(password.centerY).toBe(framing.height < 0.4 ? stage.interaction.passwordBackdrop.compactCenterY : 0.5);
    }
  });

  it("holds its closer view through submit and gives success and lock control of the camera", () => {
    for (const framing of Object.values(stage.framing)) {
      expect(samplePasswordBackdrop(framing, "submitting", true, false)).toEqual(
        samplePasswordBackdrop(framing, "focus", true, false),
      );
      for (const phase of ["success", "locked"] as const) {
        expect(samplePasswordBackdrop(framing, phase, true, false).active).toBe(false);
      }
    }
  });

  it("returns to the original framing when inactive or reduced motion is enabled", () => {
    for (const framing of Object.values(stage.framing)) {
      expect(samplePasswordBackdrop(framing, "focus", false, false)).toEqual(
        sampleUsernameBackdrop(framing, "focus", false, false),
      );
      expect(samplePasswordBackdrop(framing, "focus", true, true)).toEqual(
        sampleUsernameBackdrop(framing, "focus", false, true),
      );
    }
  });
});

describe("view spring (code field → password field)", () => {
  const omega = stage.interaction.viewSpring;
  const run = (spring: Spring, target: number, frames: number, dt = 1 / 60) => {
    const speeds: number[] = [];
    for (let i = 0; i < frames; i++) {
      const next = springStep(spring, target, omega, dt);
      speeds.push(Math.abs(next.value - spring.value) / dt);
      spring = next;
    }
    return { spring, speeds };
  };

  it("eases in from rest instead of starting at full speed", () => {
    const { speeds } = run({ value: 0, velocity: 0 }, 1, 120);
    const peak = Math.max(...speeds);
    expect(speeds[0]).toBeLessThan(peak * 0.15);
    // Speed peaks at t = 1/omega (0.2 s) and keeps rising until then.
    for (let i = 1; i < 10; i++) expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1]);
  });

  it("settles within about a second without overshoot", () => {
    const { spring, speeds } = run({ value: 0, velocity: 0 }, 1, 90);
    expect(Math.abs(spring.value - 1)).toBeLessThan(0.02);
    expect(speeds.every((v) => Number.isFinite(v))).toBe(true);
    let value = 0, s: Spring = { value: 0, velocity: 0 };
    for (let i = 0; i < 300; i++) { s = springStep(s, 1, omega, 1 / 60); value = Math.max(value, s.value); }
    expect(value).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("keeps its velocity when the target flips mid-move (no jolt between frames)", () => {
    let { spring } = run({ value: 0, velocity: 0 }, 1, 20);
    const before = spring.velocity;
    spring = springStep(spring, 0, omega, 1 / 60);
    expect(Math.abs(spring.velocity - before)).toBeLessThan(Math.abs(before) * 0.5);
  });

  it("is stable for long frames", () => {
    const { spring } = run({ value: 0, velocity: 0 }, 1, 5, 0.25);
    expect(spring.value).toBeGreaterThan(0.9);
    expect(spring.value).toBeLessThanOrEqual(1);
  });
});
