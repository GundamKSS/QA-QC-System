"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Color, type Group, type InstancedMesh, type Object3D } from "three";
import { stage } from "@/lib/config/experience";
import { clampDrag, damp, dragIntent, releaseDrag, type DragIntent } from "./interactionMotion";
import type { ScanPhase } from "./scanTimeline";

const DEG = Math.PI / 180;
const FINE_HOVER = "(hover: hover) and (pointer: fine)";
const BLOCKED = "[data-stage-block], form, input, button, textarea, select, label, a, [role='button'], [contenteditable='true']";

type Drag = {
  id: number;
  touch: boolean;
  startX: number;
  startY: number;
  startOffset: number;
  lastX: number;
  lastTime: number;
  intent: DragIntent;
};

function blocked(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(BLOCKED) !== null;
}

type HoveredFin = { mesh: InstancedMesh; index: number };
const WHITE = new Color(1, 1, 1);

function finHit(object: Object3D | undefined, instanceId: number | undefined): HoveredFin | null {
  const mesh = object as InstancedMesh | undefined;
  return mesh?.isInstancedMesh && mesh.name === "compressor-fins" && instanceId !== undefined
    ? { mesh, index: instanceId }
    : null;
}

/**
 * Model-only events are raycast from the shared auth event source. Native window
 * listeners merely continue a gesture that began on a real model intersection.
 * They never capture pointers, move focus, or stop events from reaching the form.
 */
export function ModelInteraction({ still, active, pointerEnabled = true, phase, children }: {
  still: boolean;
  active: boolean;
  pointerEnabled?: boolean;
  phase: ScanPhase;
  children: ReactNode;
}) {
  const model = useRef<Group>(null);
  const connected = useThree((state) => state.events.connected as HTMLElement | undefined);
  const canvas = useThree((state) => state.gl.domElement);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const source = connected instanceof HTMLElement ? connected : canvas.parentElement;
  const moving = active && !still && phase !== "locked" && phase !== "submitting" && phase !== "success";
  const enabled = moving && pointerEnabled;
  const controls = useRef({
    drag: null as Drag | null,
    hovered: false,
    fineHover: false,
    restYaw: stage.initialYawDeg * DEG,
    offset: 0,
    target: 0,
    velocity: 0,
    highlight: 0,
    turnSpeed: stage.idleTurnDegPerSec as number,
  });
  const selectedFin = useRef<HoveredFin | null>(null);
  const highlightColor = useRef(new Color(1, 1, 1));
  const cursor = useRef<{ element: HTMLElement; previous: string; applied: string } | null>(null);
  const selection = useRef<{ element: HTMLElement; userSelect: string; webkitUserSelect: string } | null>(null);
  const touchHandler = useRef<((event: TouchEvent) => void) | null>(null);
  const touchListening = useRef(false);

  const restoreSelection = useCallback(() => {
    const previous = selection.current;
    if (!previous) return;
    if (previous.element.style.userSelect === "none") previous.element.style.userSelect = previous.userSelect;
    if (previous.element.style.webkitUserSelect === "none") previous.element.style.webkitUserSelect = previous.webkitUserSelect;
    selection.current = null;
  }, []);

  const stopTouch = useCallback(() => {
    if (touchListening.current && touchHandler.current) window.removeEventListener("touchmove", touchHandler.current);
    touchListening.current = false;
  }, []);

  const setCursor = useCallback((value: "grab" | "grabbing" | null) => {
    // Read the imperative R3F store here; a hook snapshot is immutable to React.
    const root = get();
    const element = root.events.connected instanceof HTMLElement ? root.events.connected : root.gl.domElement.parentElement;
    const previous = cursor.current;
    if (previous && (!value || previous.element !== element)) {
      if (previous.element.style.cursor === previous.applied) previous.element.style.cursor = previous.previous;
      cursor.current = null;
    }
    if (!value || !element) return;
    if (!cursor.current) cursor.current = { element, previous: element.style.cursor, applied: value };
    cursor.current.applied = value;
    cursor.current.element.style.cursor = value;
  }, [get]);

  const selectFin = useCallback((next: HoveredFin | null) => {
    const previous = selectedFin.current;
    if (previous?.mesh === next?.mesh && previous?.index === next?.index) return;
    if (previous) {
      previous.mesh.setColorAt(previous.index, WHITE);
      if (previous.mesh.instanceColor) previous.mesh.instanceColor.needsUpdate = true;
    }
    selectedFin.current = next;
    controls.current.highlight = 0;
  }, []);

  const clearInput = useCallback(() => {
    const state = controls.current;
    state.drag = null;
    state.hovered = false;
    state.velocity = 0;
    selectFin(null);
    restoreSelection();
    stopTouch();
    setCursor(null);
  }, [setCursor, selectFin, restoreSelection, stopTouch]);

  useEffect(() => {
    const state = controls.current;
    // Preserve the visible angle when pointer interaction is disabled. Background
    // motion can continue independently without intercepting a form blur click.
    if (!enabled) {
      clearInput();
      if (model.current) state.restYaw = model.current.rotation.y;
      state.offset = state.target = state.highlight = 0;
      return;
    }

    const media = window.matchMedia(FINE_HOVER);
    const mediaChanged = () => {
      state.fineHover = media.matches;
      if (!media.matches) clearInput();
    };
    mediaChanged();

    const move = (event: PointerEvent) => {
      if (blocked(event.target)) {
        clearInput();
        return;
      }
      const drag = state.drag;
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.intent === "pending") drag.intent = dragIntent(dx, dy, drag.touch);
      if (drag.intent === "vertical") {
        clearInput();
        return;
      }
      if (drag.intent !== "horizontal") return;
      const limit = stage.interaction.maxDragDeg * DEG;
      state.target = clampDrag(drag.startOffset + dx * stage.interaction.dragRadiansPerPx, limit);
      const seconds = Math.max(0.008, (event.timeStamp - drag.lastTime) / 1000);
      const speed = clampDrag((event.clientX - drag.lastX) * stage.interaction.dragRadiansPerPx / seconds, 3);
      state.velocity = state.velocity * 0.35 + speed * 0.65;
      drag.lastX = event.clientX;
      drag.lastTime = event.timeStamp;
      if (!drag.touch && state.fineHover) setCursor("grabbing");
      invalidate();
    };
    const end = (event: PointerEvent) => {
      const drag = state.drag;
      if (!drag || event.pointerId !== drag.id) return;
      if (event.type === "pointercancel" || drag.intent !== "horizontal" || event.timeStamp - drag.lastTime > 100) state.velocity = 0;
      state.drag = null;
      restoreSelection();
      stopTouch();
      if (drag.touch || blocked(event.target)) {
        state.hovered = false;
        selectFin(null);
        setCursor(null);
      } else setCursor(state.hovered && state.fineHover ? "grab" : null);
      invalidate();
    };
    // Pointer moves alone cannot cancel native touch panning on every browser.
    // Wait for horizontal intent, then cancel only that touchmove. A vertical
    // gesture and pinch zoom keep their default browser behavior.
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length > 1) clearInput();
      else if (state.drag?.touch && state.drag.intent === "horizontal" && event.cancelable) event.preventDefault();
    };
    touchHandler.current = touchMove;
    // R3F's pointerdown listener is passive. Its real model hit arms this
    // matching mouse event, whose default selection/focus action can be canceled.
    const mouseDown = (event: MouseEvent) => {
      if (!state.drag || state.drag.touch || event.button !== 0 || blocked(event.target)) return;
      event.preventDefault();
      const root = get();
      const element = root.events.connected instanceof HTMLElement ? root.events.connected : root.gl.domElement.parentElement;
      if (element && !selection.current) {
        selection.current = { element, userSelect: element.style.userSelect, webkitUserSelect: element.style.webkitUserSelect };
        element.style.userSelect = element.style.webkitUserSelect = "none";
      }
    };
    const down = (event: PointerEvent) => {
      if (blocked(event.target) || !event.isPrimary) clearInput();
    };
    const leave = () => clearInput();
    window.addEventListener("pointermove", move, { capture: true, passive: true });
    window.addEventListener("pointerdown", down, { capture: true, passive: true });
    window.addEventListener("pointerup", end, { passive: true });
    window.addEventListener("pointercancel", end, { passive: true });
    source?.addEventListener("mousedown", mouseDown, { capture: true, passive: false });
    window.addEventListener("blur", leave);
    source?.addEventListener("pointerleave", leave);
    media.addEventListener("change", mediaChanged);
    return () => {
      clearInput();
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      source?.removeEventListener("mousedown", mouseDown, true);
      touchHandler.current = null;
      window.removeEventListener("blur", leave);
      source?.removeEventListener("pointerleave", leave);
      media.removeEventListener("change", mediaChanged);
    };
  }, [enabled, source, clearInput, setCursor, selectFin, invalidate, get, restoreSelection, stopTouch]);

  const hover = (event: ThreeEvent<PointerEvent>) => {
    const state = controls.current;
    if (!enabled || !state.fineHover || event.pointerType !== "mouse" || blocked(event.nativeEvent.target)) return;
    state.hovered = true;
    const front = event.intersections.find((hit) => hit.eventObject === model.current);
    selectFin(finHit(front?.object, front?.instanceId));
    setCursor(state.drag?.intent === "horizontal" ? "grabbing" : "grab");
  };

  const leave = (event: ThreeEvent<PointerEvent>) => {
    if (event.intersections.some((hit) => hit.eventObject === model.current)) return;
    controls.current.hovered = false;
    selectFin(null);
    if (!controls.current.drag) setCursor(null);
  };

  const down = (event: ThreeEvent<PointerEvent>) => {
    if (!enabled || event.button !== 0 || event.isPrimary === false || blocked(event.nativeEvent.target)) return;
    const state = controls.current;
    if (state.drag) return;
    state.velocity = 0;
    state.target = state.offset;
    state.drag = {
      id: event.pointerId,
      touch: event.pointerType === "touch",
      startX: event.clientX,
      startY: event.clientY,
      startOffset: state.offset,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      intent: "pending",
    };
    if (state.drag.touch && touchHandler.current && !touchListening.current) {
      window.addEventListener("touchmove", touchHandler.current, { passive: false });
      touchListening.current = true;
    }
  };

  useFrame((_, delta) => {
    if (!moving || !model.current) return;
    const state = controls.current;
    const step = Math.min(Math.max(delta, 0), 0.05);
    const { maxDragDeg, returnDamping, dragDamping, inertiaDamping } = stage.interaction;
    const targetSpeed = phase === "focus" || !pointerEnabled ? stage.focusTurnDegPerSec : stage.idleTurnDegPerSec;
    state.turnSpeed = damp(state.turnSpeed, targetSpeed, 4, step);
    if (state.drag) state.offset = damp(state.offset, state.target, dragDamping, step);
    else {
      const released = releaseDrag(state.offset, state.velocity, step, maxDragDeg * DEG, returnDamping, inertiaDamping);
      state.offset = state.target = released.offset;
      state.velocity = released.velocity;
      state.restYaw += state.turnSpeed * DEG * step;
    }
    const fin = selectedFin.current;
    if (fin) {
      const highlight = damp(state.highlight, 1, dragDamping, step);
      const next = 1 - highlight < 0.001 ? 1 : highlight;
      if (next !== state.highlight) {
        state.highlight = next;
        const strength = 1 + next * 0.1;
        highlightColor.current.setRGB(strength, strength, strength);
        fin.mesh.setColorAt(fin.index, highlightColor.current);
        if (fin.mesh.instanceColor) fin.mesh.instanceColor.needsUpdate = true;
      }
    }
    model.current.rotation.y = state.restYaw + state.offset;
    model.current.userData.dragOffset = state.offset;
    model.current.userData.dragging = state.drag?.intent === "horizontal";
  }, -0.5);

  return (
    <group ref={model} name="compressor-interaction" rotation-y={stage.initialYawDeg * DEG}
      onPointerOver={hover} onPointerMove={hover} onPointerOut={leave} onPointerDown={down}>
      {children}
    </group>
  );
}
