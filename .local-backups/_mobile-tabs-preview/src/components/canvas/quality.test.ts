import { describe, expect, it } from "vitest";
import { degrade, dprFor, initialQuality } from "./quality";

describe("stage quality", () => {
  it("starts high on a capable desktop and medium on phones or small machines", () => {
    expect(initialQuality({ cores: 12, memoryGb: 8, coarsePointer: false })).toBe("high");
    expect(initialQuality({ cores: 8, coarsePointer: true })).toBe("medium");
    expect(initialQuality({ cores: 4, memoryGb: 8 })).toBe("medium");
    expect(initialQuality({ cores: 12, memoryGb: 4 })).toBe("medium");
    expect(initialQuality({})).toBe("high");
  });

  it("honours a valid forced level and ignores junk", () => {
    expect(initialQuality({ cores: 12, forced: "low" })).toBe("low");
    expect(initialQuality({ cores: 12, forced: "ultra" })).toBe("high");
  });

  it("steps down one level at a time and stops at low", () => {
    expect(degrade("high")).toBe("medium");
    expect(degrade("medium")).toBe("low");
    expect(degrade("low")).toBe("low");
  });

  it("caps DPR by level", () => {
    expect(dprFor("high", 3)).toBe(1.75);
    expect(dprFor("medium", 3)).toBe(1.5);
    expect(dprFor("low", 3)).toBe(1);
    expect(dprFor("high", 1)).toBe(1);
  });
});
