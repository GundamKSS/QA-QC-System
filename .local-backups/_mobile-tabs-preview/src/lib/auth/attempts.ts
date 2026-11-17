import { authPolicy } from "@/config/auth";

type Entry = { failures: number; inFlight: number; lockedUntil: number | null; lastFailureAt: number };

type Policy = { maxAttempts: number; lockMinutes: number };

export type AttemptStatus =
  | { locked: true; lockedUntil: number }
  | { locked: false; failures: number; attemptsLeft: number };

export type AttemptOutcome =
  | { kind: "ok" }
  | { kind: "invalid"; attemptsLeft: number }
  /** `justLocked`: this failure engaged the lock (the audit trail logs it as a failure + lockout). */
  | { kind: "locked"; lockedUntil: number; justLocked: boolean };

export type AttemptTicket =
  | { kind: "locked"; lockedUntil: number }
  /** Every remaining attempt is already being checked by a parallel request for this code. */
  | { kind: "busy" }
  | {
      kind: "started";
      /** Record the verdict once the password has been checked. */
      settle(passwordOk: boolean): AttemptOutcome;
      /** Give the slot back if verification threw; a no-op once settled. */
      release(): void;
    };

/** Above this many tracked codes, expired entries are swept (at most once a minute). */
const SWEEP_THRESHOLD = 1_000;

/**
 * Consecutive-failure lockout per employee code (FR-AUTH AC: 5 failures → 15 min).
 * Unknown codes are tracked too, so the response never reveals whether a code exists.
 *
 * `begin()` reserves the attempt synchronously, before the caller's first await, so parallel
 * requests can't all pass the lock check while their password hashes are still running: at
 * most `maxAttempts` passwords are ever checked per lock window.
 * Failures older than the lock duration stop counting. In-memory only: fine for the mock
 * adapter; the real backend does the same with an atomic `UPDATE … RETURNING`.
 */
export function createAttemptTracker(policy: Policy = authPolicy, now: () => number = Date.now) {
  const entries = new Map<string, Entry>();
  const lockMs = policy.lockMinutes * 60_000;
  let lastSweep = 0;

  function isStale(entry: Entry, at: number) {
    return entry.lockedUntil !== null ? entry.lockedUntil <= at : at - entry.lastFailureAt >= lockMs;
  }

  function current(key: string): Entry | undefined {
    const entry = entries.get(key);
    if (!entry || !isStale(entry, now())) return entry;
    if (entry.inFlight === 0) {
      entries.delete(key);
      return undefined;
    }
    entry.failures = 0;
    entry.lockedUntil = null;
    return entry;
  }

  function sweep() {
    const at = now();
    if (entries.size < SWEEP_THRESHOLD || at - lastSweep < 60_000) return;
    lastSweep = at;
    for (const [key, entry] of entries) {
      if (entry.inFlight === 0 && isStale(entry, at)) entries.delete(key);
    }
  }

  function status(key: string): AttemptStatus {
    const entry = current(key);
    if (entry?.lockedUntil) return { locked: true, lockedUntil: entry.lockedUntil };
    const failures = entry?.failures ?? 0;
    return { locked: false, failures, attemptsLeft: policy.maxAttempts - failures };
  }

  function begin(key: string): AttemptTicket {
    sweep();
    const existing = current(key);
    if (existing?.lockedUntil) return { kind: "locked", lockedUntil: existing.lockedUntil };
    if (existing && existing.failures + existing.inFlight >= policy.maxAttempts) return { kind: "busy" };

    const entry = existing ?? { failures: 0, inFlight: 0, lockedUntil: null, lastFailureAt: 0 };
    entries.set(key, entry);
    entry.inFlight += 1;
    let open = true;

    // Entries with requests in flight are never deleted, so `entry` stays the live record.
    function close() {
      if (!open) return false;
      open = false;
      entry.inFlight -= 1;
      return true;
    }

    return {
      kind: "started",
      settle(passwordOk) {
        if (!close()) throw new Error("Attempt already settled");
        const at = now();
        if (isStale(entry, at)) {
          entry.failures = 0;
          entry.lockedUntil = null;
        }
        if (entry.lockedUntil !== null) {
          // A parallel failure locked the code while this one was being checked.
          return { kind: "locked", lockedUntil: entry.lockedUntil, justLocked: false };
        }
        if (passwordOk) {
          entry.failures = 0;
          entry.lockedUntil = null;
          if (entry.inFlight === 0) entries.delete(key);
          return { kind: "ok" };
        }
        entry.failures += 1;
        entry.lastFailureAt = at;
        if (entry.failures >= policy.maxAttempts) {
          entry.lockedUntil = at + lockMs;
          return { kind: "locked", lockedUntil: entry.lockedUntil, justLocked: true };
        }
        return { kind: "invalid", attemptsLeft: policy.maxAttempts - entry.failures };
      },
      release() {
        if (close() && entry.failures === 0 && entry.inFlight === 0 && entry.lockedUntil === null) {
          entries.delete(key);
        }
      },
    };
  }

  /** Forget a key's failures and lock (an Admin / QC Head unlocking a PIN). */
  function reset(key: string) {
    const entry = entries.get(key);
    if (!entry) return;
    entry.failures = 0;
    entry.lockedUntil = null;
    if (entry.inFlight === 0) entries.delete(key);
  }

  return { status, begin, reset, size: () => entries.size };
}

export type AttemptTracker = ReturnType<typeof createAttemptTracker>;

/** "Attempts left" is only shown near the lock (failures 3 and 4, docs/07 §5). */
export function visibleAttemptsLeft(attemptsLeft: number): number | null {
  return attemptsLeft <= authPolicy.warnWhenAttemptsLeft ? attemptsLeft : null;
}
