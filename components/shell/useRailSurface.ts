"use client";

import { useEffect, type RefObject } from "react";
import { advanceRailShape, railSurfacePath, RAIL_WIDTH, type RailShape } from "./railSurface";

const ITEM = ".app-rail-link, .app-rail-account";

/** Animate one glass silhouette; pointer motion never causes React renders. */
export function useRailSurface(rootRef: RefObject<HTMLElement | null>, clipRef: RefObject<SVGPathElement | null>, outlineRef: RefObject<SVGPathElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
    let active: HTMLElement | null = null;
    let restoringFocus = false;
    let height = root.getBoundingClientRect().height;
    let current: RailShape = { extension: 0, center: 104, panelHeight: 76 };
    let target = { ...current };
    let frame = 0, last = 0, closeTimer = 0;
    const controller = new AbortController();
    const options = { signal: controller.signal };

    const paint = () => {
      const path = railSurfacePath(height, current);
      clipRef.current?.setAttribute("d", path);
      outlineRef.current?.setAttribute("d", path);
      root.style.setProperty("--rail-surface-width", `${RAIL_WIDTH + current.extension}px`);
    };
    const tick = (now: number) => {
      current = advanceRailShape(current, target, last ? (now - last) / 1000 : 1 / 60, reduce.matches);
      last = now;
      paint();
      const moving = Math.abs(current.extension-target.extension) > 0.05 || Math.abs(current.center-target.center) > 0.05 || Math.abs(current.panelHeight-target.panelHeight) > 0.05;
      frame = moving ? window.requestAnimationFrame(tick) : 0;
      if (!moving) last = 0;
    };
    const wake = () => { if (!frame) frame = window.requestAnimationFrame(tick); };
    const cancelClose = () => { window.clearTimeout(closeTimer);closeTimer = 0; };
    const findItem = (node: EventTarget | null) => node instanceof Element ? node.closest<HTMLElement>(ITEM) : null;
    const open = (item: HTMLElement | null) => {
      cancelClose();
      if (item && !root.contains(item)) return;
      if (item !== active) {
        active?.removeAttribute("data-expanded");
        active?.querySelector(".app-rail-card")?.setAttribute("inert", "");
        active = item;
        active?.setAttribute("data-expanded", "");
        active?.querySelector(".app-rail-card")?.removeAttribute("inert");
      }
      if (!item) { target = { ...target, extension: 0 };wake();return; }
      const panel = item.querySelector<HTMLElement>(".app-rail-label, .app-rail-card");
      if (!panel) return;
      const bounds = root.getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      height = bounds.height;
      const width = Math.min(box.right - bounds.left + 20, window.innerWidth - bounds.left - 16);
      target = { extension: Math.max(0, width - RAIL_WIDTH), center: box.top - bounds.top + box.height / 2, panelHeight: Math.max(76, box.height + 24) };
      if (current.extension < 0.1) current = { ...current, center: target.center, panelHeight: target.panelHeight };
      wake();
    };
    const closeSoon = () => { cancelClose();closeTimer = window.setTimeout(() => open(null), 90); };
    const over = (event: PointerEvent) => {
      if (!hover.matches || event.pointerType !== "mouse") return;
      const item = findItem(event.target);
      if (item) open(item);
    };
    const out = (event: PointerEvent) => {
      if (active?.contains(event.relatedTarget as Node | null)) return;
      const next = findItem(event.relatedTarget);
      if (next && root.contains(next)) open(next);
      else if (!(document.activeElement instanceof Element && document.activeElement.matches(":focus-visible") && root.contains(document.activeElement))) closeSoon();
    };
    const click = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(".app-rail-avatar")) open(findItem(event.target));
    };
    const focus = (event: FocusEvent) => {
      if (restoringFocus) return;
      const item = findItem(event.target);
      if (item && (item.matches(".app-rail-account") || (event.target instanceof Element && event.target.matches(":focus-visible")))) open(item);
    };
    const blur = (event: FocusEvent) => { if (!root.contains(event.relatedTarget as Node | null)) closeSoon(); };
    const resize = () => {
      height = root.getBoundingClientRect().height;
      if (height === 0) open(null);
      else if (active) open(active);
      paint();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active) return;
      const avatar = active.querySelector<HTMLButtonElement>(".app-rail-avatar");
      event.preventDefault();
      open(null);
      if (avatar) {restoringFocus = true;avatar.focus({preventScroll:true});restoringFocus = false;}
    };
    const windowBlur = () => open(null);
    const leave = () => {
      if (document.activeElement instanceof Element && document.activeElement.matches(":focus-visible") && root.contains(document.activeElement)) return;
      closeSoon();
    };
    const outside = (event: PointerEvent) => { if (!root.contains(event.target as Node | null)) open(null); };
    root.addEventListener("pointerover", over, options);
    root.addEventListener("pointerout", out, options);
    root.addEventListener("pointerleave", leave, options);
    root.addEventListener("click", click, options);
    root.addEventListener("focusin", focus, options);
    root.addEventListener("focusout", blur, options);
    root.addEventListener("keydown", escape, options);
    document.addEventListener("pointerdown", outside, options);
    window.addEventListener("blur", windowBlur, options);
    window.addEventListener("resize", resize, options);
    reduce.addEventListener("change", wake, options);
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    paint();
    return () => {
      controller.abort();observer.disconnect();cancelClose();window.cancelAnimationFrame(frame);
      active?.removeAttribute("data-expanded");root.style.removeProperty("--rail-surface-width");
    };
  }, [rootRef, clipRef, outlineRef]);
}
