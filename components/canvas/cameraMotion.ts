import { stage } from "@/lib/config/experience";
import type { ScanPhase } from "./scanTimeline";

const unit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = (value: number) => { const t = unit(value); return t * t * (3 - 2 * t); };

export type Spring = { value: number; velocity: number };

/**
 * One step of a critically damped spring (exact solution, stable for any dt). Unlike an
 * exponential follow it eases in from rest, and it carries its velocity into a new target.
 */
export function springStep(spring: Spring, target: number, omega: number, delta: number): Spring {
  const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  const offset = spring.value - target;
  const decay = Math.exp(-omega * dt);
  const temp = (spring.velocity + omega * offset) * dt;
  return { value: target + (offset + temp) * decay, velocity: (spring.velocity - omega * temp) * decay };
}

/** One angular budget for both axes, including diagonal pointer positions. */
export function clampParallax(x: number, y: number) {
  const scale = Math.max(1, Math.hypot(x, y));
  return { x: x / scale, y: y / scale };
}

/** Credential steps share a close backdrop, held through submit until the success fly-through. */
export function sampleUsernameBackdrop(
  framing: { height: number; width?: number; centerX: number; centerY: number },
  phase: ScanPhase,
  expanded: boolean,
  still: boolean,
) {
  const config = stage.interaction.usernameBackdrop;
  const active = expanded && !still && phase !== "success" && phase !== "locked";
  const compact = framing.height < 0.4;
  const zoom = compact
    ? Math.max(framing.height / config.compactHeight, (framing.width ?? config.compactWidth) / config.compactWidth)
    : framing.height / config.height;
  return {
    active,
    zoom: active ? zoom : 1,
    centerX: active ? config.centerX : framing.centerX,
    centerY: active ? compact ? config.compactCenterY : config.centerY : framing.centerY,
    opacity: active ? config.opacity : 1,
  };
}

/** Password moves further into the scanned model and centres its exploded assemblies on screen. */
export function samplePasswordBackdrop(
  framing: Parameters<typeof sampleUsernameBackdrop>[0],
  phase: ScanPhase,
  expanded: boolean,
  still: boolean,
) {
  const backdrop = sampleUsernameBackdrop(framing, phase, expanded, still);
  const config = stage.interaction.passwordBackdrop;
  return backdrop.active ? {
    ...backdrop,
    zoom: backdrop.zoom * config.zoomFactor,
    centerY: framing.height < 0.4 ? config.compactCenterY : config.centerY,
    opacity: config.opacity,
  } : backdrop;
}

/** A bounded camera beat that always finishes inside the login action's welcome hold. */
export function sampleCamera(phase: ScanPhase, phaseElapsed: number, introProgress: number, still: boolean) {
  const { interaction } = stage;
  if (still) return { zoom: 1, aimY: stage.camera.target[1], opacity: phase === "locked" ? 0.65 : 1 };
  if (phase === "success") {
    const progress = smooth((phaseElapsed - interaction.successFlyStartSeconds) / (interaction.successEndSeconds - interaction.successFlyStartSeconds));
    const fade = smooth((phaseElapsed - interaction.successFadeStartSeconds) / (interaction.successEndSeconds - interaction.successFadeStartSeconds));
    return { zoom: 1 - 0.82 * progress, aimY: stage.camera.target[1] + 0.8 * progress, opacity: 1 - fade };
  }
  const intro = 1 - Math.pow(1 - unit(introProgress), 3);
  return {
    zoom: phase === "locked" ? 1 + interaction.lockedPull : 0.84 + 0.16 * intro,
    aimY: stage.camera.target[1],
    opacity: phase === "locked" ? 0.65 : 1,
  };
}
