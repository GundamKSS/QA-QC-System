import { stage } from "@/config/experience";

export type QualityLevel = "high" | "medium" | "low";

const ORDER: QualityLevel[] = ["high", "medium", "low"];

export type DeviceHints = {
  cores?: number;
  memoryGb?: number;
  coarsePointer?: boolean;
  /** `?quality=` in the URL, for testing a tier on a capable machine. */
  forced?: string | null;
};

/** The level to start at, from what the browser tells us about the device (docs/07 §8). */
export function initialQuality({ cores, memoryGb, coarsePointer, forced }: DeviceHints): QualityLevel {
  if (forced && (ORDER as string[]).includes(forced)) return forced as QualityLevel;
  const { cores: coreLimit, memoryGb: memoryLimit } = stage.quality.mediumBelow;
  if (coarsePointer) return "medium";
  if (typeof cores === "number" && cores <= coreLimit) return "medium";
  if (typeof memoryGb === "number" && memoryGb <= memoryLimit) return "medium";
  return "high";
}

/** One step down, never below Low. */
export function degrade(level: QualityLevel): QualityLevel {
  return ORDER[Math.min(ORDER.indexOf(level) + 1, ORDER.length - 1)];
}

export function qualitySettings(level: QualityLevel) {
  return stage.quality[level];
}

/** Device DPR clamped to the level's cap. */
export function dprFor(level: QualityLevel, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio || 1, qualitySettings(level).maxDpr);
}
