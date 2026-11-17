import { describe, expect, it } from "vitest";
import { idleState, nextIdleCheckMs } from "./idle";

const MIN = 60_000;
const t0 = 1_700_000_000_000;

describe("idleState", () => {
  it("never times out on a personal device", () => {
    expect(idleState(t0, t0 + 48 * 60 * MIN, "personal")).toEqual({ status: "active", msLeft: null });
  });

  it("is active, then warns, then expires on a shared device (30 min, 60 s warning)", () => {
    expect(idleState(t0, t0 + 10 * MIN, "shared")).toEqual({ status: "active", msLeft: 20 * MIN });
    expect(idleState(t0, t0 + 29 * MIN, "shared")).toEqual({ status: "warning", msLeft: MIN });
    expect(idleState(t0, t0 + 29.5 * MIN, "shared")).toEqual({ status: "warning", msLeft: 0.5 * MIN });
    expect(idleState(t0, t0 + 30 * MIN, "shared")).toEqual({ status: "expired", msLeft: 0 });
    expect(idleState(t0, t0 + 31 * MIN, "shared").status).toBe("expired");
  });

  it("starts over from the latest activity", () => {
    expect(idleState(t0 + 25 * MIN, t0 + 30 * MIN, "shared")).toEqual({ status: "active", msLeft: 25 * MIN });
  });

  it("honours an overridden policy", () => {
    const policy = { idleMinutes: 5, warnSeconds: 30 };
    expect(idleState(t0, t0 + 4.6 * MIN, "shared", policy).status).toBe("warning");
    expect(idleState(t0, t0 + 5 * MIN, "shared", policy).status).toBe("expired");
  });
});

describe("nextIdleCheckMs", () => {
  it("sleeps until the warning, then until expiry", () => {
    expect(nextIdleCheckMs(t0, t0 + 10 * MIN, "shared")).toBe(19 * MIN);
    expect(nextIdleCheckMs(t0, t0 + 29.5 * MIN, "shared")).toBe(0.5 * MIN);
  });

  it("has nothing to schedule when expired or never timing out", () => {
    expect(nextIdleCheckMs(t0, t0 + 31 * MIN, "shared")).toBeNull();
    expect(nextIdleCheckMs(t0, t0 + 5 * MIN, "personal")).toBeNull();
  });
});
