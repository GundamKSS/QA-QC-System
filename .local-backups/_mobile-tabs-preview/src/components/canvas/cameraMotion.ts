import { stage } from "@/config/experience";
import type { ScanPhase } from "./scanTimeline";

const unit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = (value: number) => { const t = unit(value); return t * t * (3 - 2 * t); };

/** One angular budget for both axes, including diagonal pointer positions. */
export function clampParallax(x: number, y: number) {
  const scale = Math.max(1, Math.hypot(x, y));
  return { x: x / scale, y: y / scale };
}

/** Username focus uses a viewport backdrop; authentication and reduced motion take priority. */
export function sampleUsernameBackdrop(
  framing: { height: number; centerX: number; centerY: number },
  phase: ScanPhase,
  expanded: boolean,
  still: boolean,
) {
  const config = stage.interaction.usernameBackdrop;
  const active = expanded && !still && phase !== "submitting" && phase !== "success" && phase !== "locked";
  return {
    active,
    zoom: active ? framing.height / Math.max(0.1, unit(config.height)) : 1,
    centerX: active ? unit(config.centerX) : framing.centerX,
    centerY: active ? unit(config.centerY) : framing.centerY,
    opacity: active ? unit(config.opacity) : 1,
  };
}

/** Join the success path from the view currently on screen before its fly-through begins. */
export function successEntryBlend(elapsed: number) {
  return smooth(elapsed / 0.15);
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
    zoom: phase === "focus" ? 1 - interaction.focusPush : phase === "locked" ? 1 + interaction.lockedPull : 0.84 + 0.16 * intro,
    aimY: stage.camera.target[1],
    opacity: phase === "locked" ? 0.65 : 1,
  };
}
