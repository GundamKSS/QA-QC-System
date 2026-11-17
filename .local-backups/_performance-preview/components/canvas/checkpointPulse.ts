import { stage } from "@/lib/config/experience";
import type { ScanPhase } from "./scanTimeline";

/** Physical inspection locations: pressure gauge, pump crankcase, motor fan cover. */
export const checkpointPositions = [[-1.29, 1.65, 0.46], [-0.58, 1.94, 0.51], [0.92, 1.78, 0.49]] as const;
export type CheckpointTone = "dim" | "active" | "pass" | "fail";
const safeTime = (time: number) => Number.isFinite(time) ? Math.max(0, time) : 0;

export function sampleCheckpoint(index: number, scanY: number, phaseElapsed: number, phase: ScanPhase, still: boolean) {
  if (phase === "locked") return { tone: "dim" as CheckpointTone, checkProgress: 0 };
  const time = safeTime(phaseElapsed);
  if (phase === "error") return { tone: (!still && index === 1 && time < stage.interaction.errorFlashSeconds ? "fail" : "dim") as CheckpointTone, checkProgress: 0 };
  if (phase === "success") {
    const t = still ? 1 : Math.max(0, Math.min(1, (time - index * stage.interaction.checkpointStepSeconds) / stage.interaction.checkpointRevealSeconds));
    return { tone: (t > 0 ? "pass" : "active") as CheckpointTone, checkProgress: t * t * (3 - 2 * t) };
  }
  return { tone: (phase !== "reveal" || scanY >= checkpointPositions[index][1] ? "active" : "dim") as CheckpointTone, checkProgress: 0 };
}

/** Two expanding wavefronts per quiet 2.8s cycle. No flashes under reduced motion. */
export function sampleSignalWave(elapsed: number, station: number, wave: number, active: boolean, still: boolean) {
  if (!active || still) return { scale: 1, opacity: 0 };
  const progress = ((safeTime(elapsed) + station * 0.47 + wave * 1.4) % 2.8) / 2.8;
  const fadeIn = Math.min(1, progress / 0.12);
  return { scale: 1 + progress * 2.3, opacity: 0.75 * fadeIn * (1 - progress) ** 2 };
}

/** A gentle heartbeat in the stationary core, synchronized with its outgoing waves. */
export function sampleSignalStrength(elapsed: number, station: number, still: boolean) {
  if (still) return 0.95;
  const angle = ((safeTime(elapsed) + station * 0.47) % 2.8) / 2.8 * Math.PI * 2;
  return 0.76 + 0.24 * (Math.cos(angle) * 0.5 + 0.5);
}
