"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Euler, Quaternion, Vector3, type PerspectiveCamera, type PointLight } from "three";
import { palette, stage } from "@/lib/config/experience";
import { clampParallax, sampleCamera, samplePasswordBackdrop, sampleUsernameBackdrop, springStep, type Spring } from "@/components/canvas/cameraMotion";
import { inspectionFraming, inspectionPart, type InspectionId } from "./inspectionParts";
import { dims } from "./compressorGeometry";
import { framingFor, placeCamera } from "./framing";
import type { ScanFrame, ScanPhase } from "./scanTimeline";

export function CameraRig({ frameRef, phase, still, credentialExpanded, passwordExpanded, selected, eventSource, onFade }: {
  frameRef: RefObject<ScanFrame>; phase: ScanPhase; still: boolean;
  credentialExpanded: boolean; passwordExpanded: boolean; selected: InspectionId | null;
  eventSource: HTMLElement; onFade: (opacity: number) => void;
}) {
  const get = useThree((state) => state.get);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  // Include the tilted view and a full yaw turn when fitting the horizontal tank.
  const placement = useMemo(() => placeCamera(width, height, dims.height + 0.5, Math.hypot(dims.width, dims.depth) + 0.2), [width, height]);
  const framing = useMemo(() => framingFor(width, height), [width, height]);
  const pointerRef = useRef({ x: 0, y: 0 });
  const parallaxRef = useRef({ x: 0, y: 0 });
  const lightRef = useRef<PointLight>(null);
  const viewRef = useRef({ offsetX: placement.offsetX, offsetY: placement.offsetY, opacity: 1 });
  const entryRef = useRef({ phase: null as ScanPhase | null, offsetX: placement.offsetX, offsetY: placement.offsetY, opacity: 1 });
  // Framing, zoom and fade ride critically damped springs: they start from rest and keep their
  // speed when the target flips mid-way (e.g. code field → password field), so the view never kicks.
  const springsRef = useRef<Record<"zoom" | "centerX" | "centerY" | "opacity", Spring>>({
    zoom: { value: 1, velocity: 0 },
    centerX: { value: framing.centerX, velocity: 0 },
    centerY: { value: framing.centerY, velocity: 0 },
    opacity: { value: 1, velocity: 0 },
  });
  const vectors = useMemo(() => ({ offset: new Vector3(), position: new Vector3(), aim: new Vector3(), look: new Vector3(...stage.camera.target), entryPosition: new Vector3(), entryLook: new Vector3(), rotation: new Euler(), modelRotation: new Quaternion() }), []);

  useEffect(() => { get().invalidate(); }, [get, credentialExpanded, passwordExpanded, selected, still]);

  useEffect(() => {
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reset = () => { pointerRef.current = { x: 0, y: 0 }; };
    const move = (event: PointerEvent) => {
      if (still || !hover.matches || event.pointerType === "touch" || (event.target instanceof Element && event.target.closest("[data-stage-block], input, button, a, select, textarea"))) {
        reset(); return;
      }
      const bounds = eventSource.getBoundingClientRect();
      pointerRef.current = clampParallax(
        Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1)),
        Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / Math.min(bounds.height, height)) * 2 - 1)),
      );
    };
    eventSource.addEventListener("pointermove", move);
    eventSource.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    return () => {
      eventSource.removeEventListener("pointermove", move);
      eventSource.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, [eventSource, height, still]);

  useLayoutEffect(() => {
    const { camera, invalidate } = get();
    const perspective = camera as PerspectiveCamera;
    perspective.position.set(...placement.position);
    perspective.lookAt(...placement.target);
    perspective.setViewOffset(width, height, placement.offsetX, placement.offsetY, width, height);
    perspective.updateProjectionMatrix();
    vectors.look.set(...placement.target);
    viewRef.current.offsetX = placement.offsetX;
    viewRef.current.offsetY = placement.offsetY;
    springsRef.current.centerX = { value: framing.centerX, velocity: 0 };
    springsRef.current.centerY = { value: framing.centerY, velocity: 0 };
    invalidate();
  }, [get, width, height, placement, framing, vectors]);

  useFrame(({ camera, scene }, delta) => {
    const elapsed = frameRef.current.phaseElapsed ?? 0;
    const beat = sampleCamera(phase, elapsed, frameRef.current.introProgress, still);
    const backdrop = passwordExpanded
      ? samplePasswordBackdrop(framing, phase, credentialExpanded, still)
      : sampleUsernameBackdrop(framing, phase, credentialExpanded, still);
    const view = viewRef.current;
    const entry = entryRef.current;
    if (entry.phase !== phase) {
      entry.phase = phase;
      if (phase === "success") {
        vectors.entryPosition.copy(camera.position);
        vectors.entryLook.copy(vectors.look);
        entry.offsetX = view.offsetX;
        entry.offsetY = view.offsetY;
        entry.opacity = view.opacity;
      }
    }
    const step = Math.min(Math.max(delta, 0), 0.05);
    // One rate for the whole move — switching rates mid-motion is itself a visible jolt.
    const damping = 1 - Math.exp(-stage.interaction.cameraDamping * step);
    const direct = still || (!selected && !backdrop.active && frameRef.current.introProgress < 1);
    const springs = springsRef.current;
    // Success has its own timed path (it must finish inside the welcome hold), so it bypasses the springs.
    const spring = (key: keyof typeof springs, target: number) => {
      springs[key] = direct || phase === "success" ? { value: target, velocity: 0 } : springStep(springs[key], target, stage.interaction.viewSpring, step);
      return springs[key].value;
    };
    const interactive = !selected && !still && !backdrop.active && (phase === "idle" || phase === "reveal" || phase === "offline");
    parallaxRef.current.x += ((interactive ? pointerRef.current.x : 0) - parallaxRef.current.x) * (still ? 1 : damping);
    parallaxRef.current.y += ((interactive ? pointerRef.current.y : 0) - parallaxRef.current.y) * (still ? 1 : damping);
    const max = stage.interaction.parallaxDeg * Math.PI / 180;
    vectors.rotation.set(-parallaxRef.current.y * max, -parallaxRef.current.x * max, 0);
    const zoom = spring("zoom", backdrop.active ? backdrop.zoom : beat.zoom);
    vectors.offset.set(placement.position[0] - placement.target[0], placement.position[1] - placement.target[1], placement.position[2] - placement.target[2]).multiplyScalar(zoom).applyEuler(vectors.rotation);
    const aimY = backdrop.active && passwordExpanded ? stage.interaction.passwordBackdrop.aimY : beat.aimY;
    vectors.aim.set(placement.target[0], aimY, placement.target[2]);
    vectors.position.copy(vectors.aim).add(vectors.offset);
    let centerX = backdrop.centerX, centerY = backdrop.centerY;
    if (selected) {
      const part = inspectionPart(selected);
      const detailFrame = inspectionFraming(width, height);
      const model = scene.getObjectByName("compressor-interaction");
      model?.updateWorldMatrix(true, false);
      vectors.aim.set(part.anchor[0] + 0.08, part.anchor[1], part.anchor[2] + 0.38);
      if (model) {vectors.aim.applyMatrix4(model.matrixWorld);model.getWorldQuaternion(vectors.modelRotation);}
      const tangent = Math.tan(stage.camera.fovDeg * Math.PI / 360);
      const distance = Math.max((part.size[1] * 0.75 + 0.25) / (2 * detailFrame.height * tangent), (part.size[0] * 0.75 + 0.35) / (2 * detailFrame.width * tangent * width / height)) + 0.4;
      vectors.offset.set(0.18, 0.16, 1).normalize().applyQuaternion(vectors.modelRotation).multiplyScalar(distance);
      vectors.position.copy(vectors.aim).add(vectors.offset);
      centerX = detailFrame.centerX;centerY = detailFrame.centerY;
    }
    const offsetX = width * (0.5 - spring("centerX", centerX));
    const offsetY = height * (0.5 - spring("centerY", centerY));
    if (phase === "success" && !still) {
      // Scale the distance actually on screen, so a close credential view never pulls back first.
      vectors.aim.set(vectors.entryLook.x, vectors.entryLook.y + beat.aimY - stage.camera.target[1], vectors.entryLook.z);
      vectors.offset.copy(vectors.entryPosition).sub(vectors.entryLook).multiplyScalar(beat.zoom);
      camera.position.copy(vectors.aim).add(vectors.offset);
      vectors.look.copy(vectors.aim);
      view.offsetX = entry.offsetX * beat.zoom;
      view.offsetY = entry.offsetY * beat.zoom;
    } else {
      camera.position.lerp(vectors.position, direct ? 1 : damping);
      vectors.look.lerp(vectors.aim, direct ? 1 : damping);
      view.offsetX = offsetX;
      view.offsetY = offsetY;
    }
    const perspective = camera as PerspectiveCamera;
    perspective.setViewOffset(width, height, view.offsetX, view.offsetY, width, height);
    camera.lookAt(vectors.look);
    camera.updateMatrixWorld();
    if (lightRef.current) {
      const intensity = phase === "focus" ? 0.85 : phase === "locked" ? 0.05 : 0.6;
      lightRef.current.intensity += (intensity - lightRef.current.intensity) * (still ? 1 : damping);
    }
    view.opacity = phase === "success" && !still ? entry.opacity : spring("opacity", selected ? 1 : backdrop.opacity);
    onFade(beat.opacity * view.opacity);
  }, -1);

  return <pointLight ref={lightRef} name="inspection-focus-light" color={palette.ember500} position={[2, 1.7, -1.5]} intensity={0.6} distance={7} decay={2} />;
}
