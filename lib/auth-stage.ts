"use client";

import { useSyncExternalStore } from "react";
import type { ScanPhase } from "@/components/canvas/scanTimeline";

type StageSignal = { phase: ScanPhase; round: number; typing: boolean; usernameFocused: boolean; passwordFocused: boolean; inputFocused: boolean };
const initial: StageSignal = { phase: "idle", round: 0, typing: false, usernameFocused: false, passwordFocused: false, inputFocused: false };
let current = initial;
const listeners = new Set<() => void>();

/** Only presentation state crosses this boundary; no form values or credentials. */
export function publishAuthStage(phase: ScanPhase, round = 0, typing = false, usernameFocused = false, inputFocused = false, passwordFocused = false) {
  if (current.phase === phase && current.round === round && current.typing === typing && current.usernameFocused === usernameFocused && current.passwordFocused === passwordFocused && current.inputFocused === inputFocused) return;
  current = { phase, round, typing, usernameFocused, passwordFocused, inputFocused };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useAuthStage() {
  return useSyncExternalStore(subscribe, () => current, () => initial);
}
