import type { ScanPhase } from "@/components/canvas/scanTimeline";

/** Separate the scanned blueprint from the exploded parts so each credential can choose its camera view. */
export function sampleCredentialPresentation(phase: ScanPhase, username: boolean, password: boolean, still: boolean) {
  const active = !still && phase !== "success" && phase !== "locked";
  const blueprint = active && (username || password);
  return { zoomed: blueprint, blueprint, exploded: active && password };
}
