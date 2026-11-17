"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Euler, Vector3, type PerspectiveCamera, type PointLight } from "three";
import { palette, stage } from "@/config/experience";
import { clampParallax, sampleCamera, sampleUsernameBackdrop, successEntryBlend } from "./cameraMotion";
import { dims } from "./compressorGeometry";
import { framingFor, placeCamera } from "./framing";
import type { ScanFrame, ScanPhase } from "./scanTimeline";

export function CameraRig({ frameRef, phase, still, usernameExpanded, eventSource, onFade }: {
  frameRef: RefObject<ScanFrame>; phase: ScanPhase; still: boolean;
  usernameExpanded: boolean;
  eventSource: HTMLElement; onFade: (opacity: number) => void;
}) {
  const get = useThree((state) => state.get);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const placement = useMemo(() => placeCamera(width, height, dims.height), [width, height]);
  const framing = useMemo(() => framingFor(width, height), [width, height]);
  const pointerRef = useRef({ x: 0, y: 0 });
  const parallaxRef = useRef({ x: 0, y: 0 });
  const lightRef = useRef<PointLight>(null);
  const viewRef = useRef({ offsetX: placement.offsetX, offsetY: placement.offsetY, opacity: 1 });
  const entryRef = useRef({ phase: null as ScanPhase | null, offsetX: placement.offsetX, offsetY: placement.offsetY });
  const vectors = useMemo(() => ({ offset: new Vector3(), position: new Vector3(), aim: new Vector3(), look: new Vector3(...stage.camera.target), entryPosition: new Vector3(), entryLook: new Vector3(), rotation: new Euler() }), []);

  useEffect(() => { get().invalidate(); }, [get, usernameExpanded, still]);

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
    invalidate();
  }, [get, width, height, placement, vectors]);

  useFrame(({ camera }, delta) => {
    const elapsed = frameRef.current.phaseElapsed ?? 0;
    const beat = sampleCamera(phase, elapsed, frameRef.current.introProgress, still);
    const backdrop = sampleUsernameBackdrop(framing, phase, usernameExpanded, still);
    const view = viewRef.current;
    const entry = entryRef.current;
    if (entry.phase !== phase) {
      entry.phase = phase;
      if (phase === "success") {
        vectors.entryPosition.copy(camera.position);
        vectors.entryLook.copy(vectors.look);
        entry.offsetX = view.offsetX;
        entry.offsetY = view.offsetY;
      }
    }
    const step = Math.min(Math.max(delta, 0), 0.05);
    const reframing = backdrop.active || Math.abs(view.opacity - 1) > 0.001 || Math.abs(view.offsetX - placement.offsetX) > 0.1 || Math.abs(view.offsetY - placement.offsetY) > 0.1;
    const damping = 1 - Math.exp(-(reframing ? stage.interaction.usernameBackdrop.damping : stage.interaction.cameraDamping) * step);
    const interactive = !still && !backdrop.active && (phase === "idle" || phase === "reveal" || phase === "offline");
    parallaxRef.current.x += ((interactive ? pointerRef.current.x : 0) - parallaxRef.current.x) * (still ? 1 : damping);
    parallaxRef.current.y += ((interactive ? pointerRef.current.y : 0) - parallaxRef.current.y) * (still ? 1 : damping);
    const max = stage.interaction.parallaxDeg * Math.PI / 180;
    vectors.rotation.set(-parallaxRef.current.y * max, -parallaxRef.current.x * max, 0);
    vectors.offset.set(placement.position[0] - placement.target[0], placement.position[1] - placement.target[1], placement.position[2] - placement.target[2]).multiplyScalar(backdrop.active ? backdrop.zoom : beat.zoom).applyEuler(vectors.rotation);
    vectors.aim.set(placement.target[0], beat.aimY, placement.target[2]);
    vectors.position.copy(vectors.aim).add(vectors.offset);
    const direct = still || (!backdrop.active && frameRef.current.introProgress < 1);
    const offsetX = width * (0.5 - backdrop.centerX);
    const offsetY = height * (0.5 - backdrop.centerY);
    if (phase === "success" && !still) {
      const blend = successEntryBlend(elapsed);
      camera.position.lerpVectors(vectors.entryPosition, vectors.position, blend);
      vectors.look.lerpVectors(vectors.entryLook, vectors.aim, blend);
      view.offsetX = entry.offsetX + (offsetX - entry.offsetX) * blend;
      view.offsetY = entry.offsetY + (offsetY - entry.offsetY) * blend;
    } else {
      camera.position.lerp(vectors.position, direct ? 1 : damping);
      vectors.look.lerp(vectors.aim, direct ? 1 : damping);
      view.offsetX += (offsetX - view.offsetX) * (direct ? 1 : damping);
      view.offsetY += (offsetY - view.offsetY) * (direct ? 1 : damping);
    }
    const perspective = camera as PerspectiveCamera;
    perspective.setViewOffset(width, height, view.offsetX, view.offsetY, width, height);
    camera.lookAt(vectors.look);
    if (lightRef.current) {
      const intensity = phase === "focus" ? 2.4 : phase === "locked" ? 0.05 : 0.6;
      lightRef.current.intensity += (intensity - lightRef.current.intensity) * (still ? 1 : damping);
    }
    view.opacity += (backdrop.opacity - view.opacity) * (still ? 1 : damping);
    onFade(beat.opacity * view.opacity);
  }, -1);

  return <pointLight ref={lightRef} name="inspection-focus-light" color={palette.ember500} position={[2, 1.7, -1.5]} intensity={0.6} distance={7} decay={2} />;
}
