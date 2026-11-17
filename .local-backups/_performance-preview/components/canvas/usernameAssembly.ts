import type { InspectionId } from "./inspectionParts";
import type { ScanPhase } from "./scanTimeline";

/** Small outward moves preserve the tank silhouette and keep the upper components in view. */
export const usernameAssemblyLayouts: readonly { id: InspectionId; offset: readonly [number, number, number] }[] = [
  { id: "gauge", offset: [-0.35, 0.05, 0.45] },
  { id: "pump", offset: [0, -0.05, 0.4] },
  { id: "motor", offset: [-0.25, -0.1, 0.38] },
];

export function usernameAssemblyActive(phase: ScanPhase, usernameFocused: boolean, still: boolean) {
  return usernameFocused && !still && phase !== "submitting" && phase !== "success" && phase !== "locked";
}

/** Reversible, bounded motion: rapid switches resume from the currently drawn assembly. */
export function advanceUsernameAssembly(current: number, delta: number, active: boolean, still: boolean, phase: ScanPhase) {
  if (still) return 0;
  const start = Math.max(0, Math.min(1, Number.isFinite(current) ? current : 0));
  const step = Number.isFinite(delta) ? Math.max(0, Math.min(0.05, delta)) : 0;
  const critical = phase === "submitting" || phase === "success" || phase === "locked";
  const target = active && !critical ? 1 : 0;
  return start + (target - start) * (1 - Math.exp(-(critical ? 16 : 4.5) * step));
}
