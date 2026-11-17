export type HapticKind = "tap" | "shutter" | "warn" | "complete";

/**
 * Tactile vibration patterns (in milliseconds) tuned for mobile factory inspection:
 * - `tap`: Crisp 12ms light tick for 1-click Pass, N/A, presets, and step pills
 * - `shutter`: 20ms mechanical shutter snap when capturing defect spot photos
 * - `warn`: Double pulse when flagging NG (Fail) or hitting a step guard
 * - `complete`: Ascending celebration pulse when auto-opening S07 Summary or finishing inspection
 */
export const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 12,
  shutter: 20,
  warn: [18, 40, 24],
  complete: [15, 50, 30],
};

/**
 * Triggers mobile haptic feedback via the Web Vibration API (`navigator.vibrate`).
 * Safely no-ops on desktop/unsupported browsers or when `prefers-reduced-motion` is enabled.
 */
export function triggerHaptic(kind: HapticKind = "tap"): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  try {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return false;
    }

    if (typeof navigator.vibrate !== "function") {
      return false;
    }

    const pattern = HAPTIC_PATTERNS[kind];
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
