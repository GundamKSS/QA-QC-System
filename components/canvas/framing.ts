import { stage, type StageFraming } from "@/lib/config/experience";

/** Same breakpoints as the login page layout (globals.css, lg = 64rem). */
export function framingFor(width: number, height: number): StageFraming {
  if (width >= 1024) return stage.framing.laptop;
  if (width > height && height <= 540) return stage.framing.phoneLandscape;
  if (width >= 768) return stage.framing.tablet;
  return height <= 700 ? stage.framing.phoneShort : stage.framing.phone;
}

export type CameraPlacement = {
  position: [number, number, number];
  target: readonly [number, number, number];
  /** Lens shift in pixels: setViewOffset(width, height, x, y, width, height). */
  offsetX: number;
  offsetY: number;
};

/**
 * Distance so the object fills `framing.height` of the canvas, and a lens shift that moves
 * its centre to (centerX, centerY) without bending perspective the way panning would.
 */
export function placeCamera(width: number, height: number, objectHeight: number, objectWidth = 0): CameraPlacement {
  const framing = framingFor(width, height);
  const halfFov = (stage.camera.fovDeg * Math.PI) / 360;
  const verticalDistance = objectHeight / (2 * framing.height * Math.tan(halfFov));
  const horizontalDistance = objectWidth / (2 * framing.width * Math.tan(halfFov) * width / height);
  const distance = Math.max(verticalDistance, horizontalDistance);
  const [dx, dy, dz] = stage.camera.direction;
  const length = Math.hypot(dx, dy, dz);
  const [tx, ty, tz] = stage.camera.target;
  return {
    position: [tx + (dx / length) * distance, ty + (dy / length) * distance, tz + (dz / length) * distance],
    target: stage.camera.target,
    offsetX: width * (0.5 - framing.centerX),
    offsetY: height * (0.5 - framing.centerY),
  };
}
