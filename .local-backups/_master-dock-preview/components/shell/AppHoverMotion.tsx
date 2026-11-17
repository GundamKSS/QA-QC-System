"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TARGET = ".app-primary-action, .app-metal-action, a.app-panel";
const MOTION = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

/** A small pointer pull on actionable surfaces, including newly streamed content. */
export function AppHoverMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".app-theme-sand");
    if (!root) return;
    const media = window.matchMedia(MOTION);
    const controller = new AbortController();
    const options = { passive: true, signal: controller.signal };
    let active: HTMLElement | null = null;
    let bounds: DOMRect | null = null;
    let frame = 0;
    let x = 0;
    let y = 0;

    const reset = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      active?.style.removeProperty("--hover-x");
      active?.style.removeProperty("--hover-y");
      active = null;
      bounds = null;
    };

    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType !== "mouse" || event.buttons !== 0) {
        reset();
        return;
      }
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(TARGET) : null;
      if (!target || !root.contains(target) || target.closest(":disabled, [aria-disabled='true'], [inert]")) {
        reset();
        return;
      }
      if (target !== active) {
        reset();
        active = target;
        // Keep the entry rectangle stable: the pull must not chase its own translation.
        bounds = target.getBoundingClientRect();
      }
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!active?.isConnected || !bounds || !media.matches) {
          reset();
          return;
        }
        const strength = active.matches("a.app-panel") ? 2 : 3;
        const offset = (position: number, start: number, size: number) =>
          Math.max(-1, Math.min(1, ((position - start) / Math.max(size, 1) - 0.5) * 2)) * strength;
        active.style.setProperty("--hover-x", `${offset(x, bounds.left, bounds.width).toFixed(2)}px`);
        active.style.setProperty("--hover-y", `${offset(y, bounds.top, bounds.height).toFixed(2)}px`);
      });
    };

    const leave = (event: PointerEvent) => {
      if (!(event.relatedTarget instanceof Node) || !active?.contains(event.relatedTarget)) reset();
    };

    root.addEventListener("pointerover", move, options);
    root.addEventListener("pointermove", move, options);
    root.addEventListener("pointerout", leave, options);
    root.addEventListener("pointerdown", reset, options);
    root.addEventListener("pointerup", move, options);
    root.addEventListener("pointercancel", reset, options);
    window.addEventListener("blur", reset, options);
    window.addEventListener("resize", reset, options);
    window.addEventListener("scroll", reset, { ...options, capture: true });
    document.addEventListener("visibilitychange", reset, options);
    media.addEventListener("change", reset, options);
    return () => {
      controller.abort();
      reset();
    };
  }, [pathname]);

  return null;
}
