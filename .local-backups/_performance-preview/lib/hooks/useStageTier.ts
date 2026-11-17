"use client";

import { useSyncExternalStore } from "react";

export type StageTier = "3d" | "static";

type NavigatorHints = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };

let detected: StageTier | undefined;

/**
 * Whether this device gets the WebGL stage (docs/07 §8). Pass 2 keeps it simple — Save-Data,
 * ≤ 2 GB RAM or no WebGL2 → static; the full High/Medium/Low tiers arrive in Pass 6.
 * `?stage=static` forces the fallback (for testing it on a capable machine).
 */
function detect(): StageTier {
  const nav = navigator as NavigatorHints;
  if (new URLSearchParams(window.location.search).get("stage") === "static") return "static";
  if (nav.connection?.saveData) return "static";
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return "static";
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "static";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return "3d";
  } catch {
    return "static";
  }
}

const noopSubscribe = () => () => {};

/** null during SSR and hydration, then the tier (detected once per page load). */
export function useStageTier(): StageTier | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => (detected ??= detect()),
    () => null,
  );
}

let idle = false;
let scheduled = false;
const idleListeners = new Set<() => void>();

function subscribeIdle(onChange: () => void) {
  idleListeners.add(onChange);
  if (!idle && !scheduled) {
    scheduled = true;
    const reached = () => {
      idle = true;
      idleListeners.forEach((listener) => listener());
    };
    const wait = () =>
      "requestIdleCallback" in window ? window.requestIdleCallback(reached, { timeout: 1500 }) : setTimeout(reached, 300);
    if (document.readyState === "complete") wait();
    else window.addEventListener("load", wait, { once: true });
  }
  return () => {
    idleListeners.delete(onChange);
  };
}

/** False until the page has loaded and the browser is idle — the form always comes first. */
export function useAfterLoadIdle(): boolean {
  return useSyncExternalStore(
    subscribeIdle,
    () => idle,
    () => false,
  );
}
