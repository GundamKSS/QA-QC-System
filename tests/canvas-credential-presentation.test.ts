import { describe, expect, it } from "vitest";
import { sampleCredentialPresentation } from "@/components/canvas/credentialPresentation";
import type { ScanPhase } from "@/components/canvas/scanTimeline";

describe("credential animation sequence", () => {
  it("zooms into a completed blueprint for Username without opening parts", () => {
    expect(sampleCredentialPresentation("focus", true, false, false)).toEqual({
      zoomed: true, blueprint: true, exploded: false,
    });
  });

  it("opens parts for Password while retaining the blueprint and enabling its close view", () => {
    const username = sampleCredentialPresentation("focus", true, false, false);
    const password = sampleCredentialPresentation("focus", false, true, false);
    expect(password).toEqual({ ...username, exploded: true });
    expect(sampleCredentialPresentation("focus", true, false, false)).toEqual(username);
  });

  it("supports Password first and returns to the normal view outside the form", () => {
    expect(sampleCredentialPresentation("focus", false, true, false).exploded).toBe(true);
    expect(sampleCredentialPresentation("idle", false, false, false)).toEqual({
      zoomed: false, blueprint: false, exploded: false,
    });
  });

  it.each(["submitting", "error", "offline"] as const)("retains the credential composition during %s", (phase) => {
    for (const username of [true, false]) {
      expect(sampleCredentialPresentation(phase, username, !username, false)).toEqual(
        sampleCredentialPresentation("focus", username, !username, false),
      );
    }
  });

  it.each(["success", "locked"] as const)("hands control to %s", (phase) => {
    expect(sampleCredentialPresentation(phase, true, true, false)).toEqual({
      zoomed: false, blueprint: false, exploded: false,
    });
  });

  it.each<ScanPhase>(["idle", "focus", "submitting", "success", "error", "locked", "offline"])("respects reduced motion during %s", (phase) => {
    expect(sampleCredentialPresentation(phase, true, true, true)).toEqual({
      zoomed: false, blueprint: false, exploded: false,
    });
  });
});
