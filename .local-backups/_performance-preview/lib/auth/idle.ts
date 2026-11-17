import { authPolicy } from "@/lib/config/auth";

/** FR-AUTH-05: a shared device (Admin-registered) times out on idle; a personal one lasts the session. */
export type DeviceKind = keyof typeof authPolicy.devices;

export type IdleState =
  | { status: "active"; msLeft: number | null }
  /** Inside the warning window: show "signing out in N seconds" with a way to stay. */
  | { status: "warning"; msLeft: number }
  | { status: "expired"; msLeft: 0 };

type DevicePolicy = { idleMinutes: number | null; warnSeconds: number };

/**
 * Where an idle timer stands. Pure: the caller supplies timestamps, so it works the same on
 * the server (re-checking on each request) and in a client timer, and tests need no clock.
 * `lastActivityAt` / `now` are epoch milliseconds.
 */
export function idleState(
  lastActivityAt: number,
  now: number,
  kind: DeviceKind,
  policy: DevicePolicy = authPolicy.devices[kind],
): IdleState {
  if (policy.idleMinutes === null) return { status: "active", msLeft: null };
  const msLeft = lastActivityAt + policy.idleMinutes * 60_000 - now;
  if (msLeft <= 0) return { status: "expired", msLeft: 0 };
  if (msLeft <= policy.warnSeconds * 1_000) return { status: "warning", msLeft };
  return { status: "active", msLeft };
}

/** Milliseconds until the state next changes — lets a client timer sleep instead of polling. */
export function nextIdleCheckMs(
  lastActivityAt: number,
  now: number,
  kind: DeviceKind,
  policy: DevicePolicy = authPolicy.devices[kind],
): number | null {
  const state = idleState(lastActivityAt, now, kind, policy);
  if (state.status === "expired" || policy.idleMinutes === null) return null;
  if (state.status === "warning") return state.msLeft;
  return Math.max(0, state.msLeft! - policy.warnSeconds * 1_000);
}
