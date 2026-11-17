import { stage } from "@/lib/config/experience";
import type { ScanPhase } from "./scanTimeline";

const turn = Math.PI * 2;

/** Focus clearance around the wide tank, handles and service fittings; local X/Z radii. */
export const focusOrbitEnvelope = {
  radiusX: stage.scan.ringRadius * 1.1,
  radiusZ: stage.scan.ringRadius * 0.62,
  clearance: 0.06,
} as const;

/** Field activity never overrides the authentication result or a pending request. */
export function scanOrbitActive(phase: ScanPhase, inputFocused: boolean): boolean {
  return inputFocused && phase !== "submitting" && phase !== "success" && phase !== "locked";
}

/** Advance a visible scanner without catching up time spent in a hidden tab. */
export function advanceScanOrbit(angle: number, delta: number, active: boolean): number {
  const remainder = Number.isFinite(angle) ? angle % turn : 0;
  const current = remainder < 0 ? remainder + turn : remainder === 0 ? 0 : remainder;
  if (!active || !Number.isFinite(delta) || delta <= 0) return current;
  const step = Math.min(delta, 0.05);
  return (current + step * turn / stage.scan.focusOrbitSeconds) % turn;
}
