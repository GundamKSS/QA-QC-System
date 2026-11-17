"use client";

import { useCallback, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards — without a setState-in-effect. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Assumes online on the server; the browser corrects it after hydration. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

function subscribeKeyboard(onChange: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", onChange);
  window.addEventListener("resize", onChange);
  document.addEventListener("focusin", onChange);
  document.addEventListener("focusout", onChange);
  return () => {
    viewport?.removeEventListener("resize", onChange);
    window.removeEventListener("resize", onChange);
    document.removeEventListener("focusin", onChange);
    document.removeEventListener("focusout", onChange);
  };
}

/** Keep the bottom tabs out of the way while a phone keyboard covers the viewport. */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribeKeyboard, () => {
    const viewport = window.visualViewport;
    return Boolean(viewport && document.activeElement?.matches("input, textarea, [contenteditable='true']")
      && viewport.height < Math.max(window.innerHeight, document.documentElement.clientHeight) * 0.75);
  }, () => false);
}

/** A query-string value read after hydration (keeps the page static under Cache Components). */
export function useSearchParam(name: string): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get(name) ?? "",
    () => "",
  );
}

let clockNow = 0;
const deadlines = new Map<number, number>();

/**
 * Milliseconds left of `durationMs`, counted on this device's clock from the moment `key`
 * (a server response time) is first shown — so a device clock that runs fast or slow can't
 * end the countdown early or late. Ticks every second while `active`; returns `durationMs`
 * during SSR and hydration.
 */
export function useCountdown(key: number, durationMs: number, active: boolean): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active) return () => {};
      clockNow = Date.now();
      if (!deadlines.has(key)) deadlines.set(key, clockNow + durationMs);
      const id = window.setInterval(() => {
        clockNow = Date.now();
        onChange();
      }, 1000);
      return () => window.clearInterval(id);
    },
    [key, durationMs, active],
  );
  return useSyncExternalStore(
    subscribe,
    () => {
      const deadline = deadlines.get(key);
      return active && deadline !== undefined ? Math.max(0, deadline - clockNow) : durationMs;
    },
    () => durationMs,
  );
}
