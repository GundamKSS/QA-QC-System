import { dims } from "./compressorGeometry";
import { stage } from "@/lib/config/experience";

export type ScanPhase = "reveal" | "idle" | "focus" | "submitting" | "success" | "error" | "locked" | "offline";

export type ScanFrame = {
  /** Model-local height; everything below this plane has its physical material. */
  scanY: number;
  /** Global physical-material override, independent of the scan plane (0–1). */
  reveal: number;
  ringOpacity: number;
  introProgress: number;
  /** Set by the scene controller; presentation components share the same phase clock. */
  phaseElapsed?: number;
};

export const scanTiming = stage.scan;

export const scanBounds = {
  minY: -0.12,
  maxY: dims.height + 0.12,
  midY: dims.height / 2,
} as const;

export type ScanOptions = {
  still?: boolean;
  introSeconds?: number;
  phase?: ScanPhase;
  /** Seconds since the current authentication phase began. */
  phaseElapsed?: number;
};

const unit = (value: number) => Math.max(0, Math.min(1, value));
const seconds = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
const ease = (value: number) => {
  const t = unit(value);
  return t * t * (3 - 2 * t);
};
const atHeight = (progress: number) => scanBounds.minY + (scanBounds.maxY - scanBounds.minY) * progress;

/** Fade the ring outside the model, keeping both ends of a sweep unobtrusive. */
function ringAt(scanY: number, opacity: number) {
  const progress = (scanY - scanBounds.minY) / (scanBounds.maxY - scanBounds.minY);
  return opacity * ease(progress / 0.08) * ease((1 - progress) / 0.08);
}

function idleFrame(elapsed: number): ScanFrame {
  const cycle = seconds(elapsed) % scanTiming.idleCycleSeconds;
  const sweepSeconds = (scanTiming.idleCycleSeconds - scanTiming.topHoldSeconds) / 2;
  const sweep = Math.max(0, cycle - scanTiming.topHoldSeconds) / sweepSeconds;
  // Start and finish above the model. A hold and eased turns avoid a visible reset.
  // The downward pass restores blueprint lines; the upward pass reveals the painted machine.
  const scanY = atHeight(sweep <= 1 ? 1 - ease(sweep) : ease(sweep - 1));
  return { scanY, reveal: 0, ringOpacity: ringAt(scanY, 0.75), introProgress: 1 };
}

/** A short welcome scan once per local day; returning visits skip the long reveal. */
export function getIntroDuration(lastSeenDay: string | null, today: string): number {
  return lastSeenDay === today ? scanTiming.repeatIntroSeconds : scanTiming.firstIntroSeconds;
}

/** Blend from the last drawn frame so interrupted form phases never teleport the laser. */
export function blendScan(from: ScanFrame, target: ScanFrame, elapsed: number): ScanFrame {
  const progress = ease(seconds(elapsed) / scanTiming.phaseTransitionSeconds);
  const mix = (start: number, end: number) => start + (end - start) * progress;
  return {
    ...target,
    scanY: mix(from.scanY, target.scanY),
    reveal: mix(from.reveal, target.reveal),
    ringOpacity: mix(from.ringOpacity, target.ringOpacity),
  };
}

/**
 * Pure animation sampling in seconds. Explicit form phases may interrupt the intro;
 * they retain the fully revealed material so typing never hides the object again.
 */
export function sampleScan(elapsed: number, options: ScanOptions = {}): ScanFrame {
  const time = seconds(elapsed);
  const { still = false, phase = "reveal" } = options;
  const introSeconds =
    options.introSeconds !== undefined && Number.isFinite(options.introSeconds) && options.introSeconds > 0
      ? options.introSeconds
      : scanTiming.firstIntroSeconds;

  if (still) {
    return { scanY: scanBounds.midY, reveal: 1, ringOpacity: phase === "locked" ? 0 : 0.25, introProgress: 1 };
  }

  if (phase === "focus" || phase === "locked") {
    return { scanY: scanBounds.midY, reveal: 1, ringOpacity: phase === "locked" ? 0 : 0.4, introProgress: 1 };
  }

  const phaseTime = seconds(options.phaseElapsed ?? time);
  if (phase === "submitting") {
    const sweep = (phaseTime % (scanTiming.submittingSweepSeconds * 2)) / scanTiming.submittingSweepSeconds;
    const scanY = atHeight(sweep <= 1 ? ease(sweep) : 1 - ease(sweep - 1));
    return { scanY, reveal: 1, ringOpacity: ringAt(scanY, 0.9), introProgress: 1 };
  }

  if (phase === "success") {
    const progress = ease(phaseTime / scanTiming.successSeconds);
    const scanY = scanBounds.midY + (scanBounds.maxY - scanBounds.midY) * progress;
    return { scanY, reveal: 1, ringOpacity: ringAt(scanY, 0.9 * (1 - progress)), introProgress: 1 };
  }

  if ((phase === "reveal" || phase === "idle") && time < introSeconds) {
    const introProgress = unit(time / introSeconds);
    const scanY = atHeight(ease(introProgress));
    return { scanY, reveal: 0, ringOpacity: ringAt(scanY, 0.85), introProgress };
  }

  // Error and offline keep the ordinary scan; their DOM messages remain independent.
  return idleFrame(time - introSeconds);
}
