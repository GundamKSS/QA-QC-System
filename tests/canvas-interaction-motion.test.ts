import { describe, expect, it } from "vitest";
import { clampDrag, damp, dragIntent, releaseDrag } from "@/components/canvas/interactionMotion";

const limit = 35 * Math.PI / 180;

describe("model gesture intent", () => {
  it("keeps taps and vertical touch gestures available to the page", () => {
    expect(dragIntent(3, 2, true)).toBe("pending");
    expect(dragIntent(4, 18, true)).toBe("vertical");
    expect(dragIntent(18, 4, true)).toBe("horizontal");
    expect(dragIntent(7, 7, true)).toBe("pending");
    expect(dragIntent(4, 1, false)).toBe("horizontal");
  });

  it("bounds both directions of a drag", () => {
    expect(clampDrag(10, limit)).toBe(limit);
    expect(clampDrag(-10, limit)).toBe(-limit);
    expect(clampDrag(0.25, limit)).toBe(0.25);
  });
});

describe("model drag release", () => {
  it("retains a release impulse briefly, then returns to rest", () => {
    let state = releaseDrag(0, 2, 1 / 60, limit, 5, 7);
    expect(state.offset).toBeGreaterThan(0);
    expect(state.velocity).toBeLessThan(2);
    for (let i = 0; i < 240; i++) {
      state = releaseDrag(state.offset, state.velocity, 1 / 60, limit, 5, 7);
      expect(Math.abs(state.offset)).toBeLessThanOrEqual(limit);
    }
    expect(state.offset).toBeCloseTo(0, 4);
    expect(state.velocity).toBe(0);
  });

  it("stops an outward fling at the drag limit and bounds a long paused frame", () => {
    const atEdge = releaseDrag(limit, 20, 1 / 60, limit, 5, 7);
    expect(atEdge.offset).toBeLessThan(limit);
    expect(atEdge.velocity).toBe(0);
    expect(releaseDrag(0.25, 1, 60, limit, 5, 7)).toEqual(releaseDrag(0.25, 1, 0.05, limit, 5, 7));
  });

  it("uses frame independent damping for smooth pointer response", () => {
    let sampled = 0;
    for (let i = 0; i < 60; i++) sampled = damp(sampled, 1, 14, 1 / 60);
    expect(sampled).toBeCloseTo(damp(0, 1, 14, 1), 10);
  });
});
