import "server-only";
import { authPolicy } from "@/lib/config/auth";
import { createAttemptTracker, type AttemptTracker } from "./attempts";
import { authenticateWithDatacenter } from "./datacenter-adapter";
import { authenticateLocal } from "./local-auth";
import { getDummyPinHash, getLocalStore, getPinGuard, pinPepper } from "./local-runtime";
import { isLocalCode } from "./local-users";
import { normalizeEmployeeCode } from "./employee-code";
import { authenticate as mockAuthenticate, mockAuthEnabled, type AuthResult } from "./mock-adapter";

const globalStore = globalThis as typeof globalThis & { __qcheckAttemptTracker?: AttemptTracker };

export function getAttemptTracker(): AttemptTracker {
  globalStore.__qcheckAttemptTracker ??= createAttemptTracker();
  return globalStore.__qcheckAttemptTracker;
}

export function resetAttemptTrackerForTests() {
  delete globalStore.__qcheckAttemptTracker;
}

/**
 * Authenticates user through Datacenter API (API_Datacenter/auth/auth_permission_prog)
 * and validates program permissions (PRG003).
 * QCHECK_AUTH=mock selects seeded demo users without calling the central API.
 * Central failures never silently fall back to demo credentials.
 */
export async function authenticate(employeeCodeInput: string, password: string, context: { ip?: string | null } = {}): Promise<AuthResult> {
  const employeeCode = normalizeEmployeeCode(employeeCodeInput);
  const rawUsername = typeof employeeCodeInput === "string" ? employeeCodeInput.trim() : "";
  // Field staff (F0001…, DEC-12) have no central account: their code is checked against QCheck's
  // own PIN store and never sent to the central system.
  if (isLocalCode(rawUsername)) {
    const pepper = pinPepper();
    if (!pepper) return { kind: "unavailable", message: "PIN login is not configured (PIN_PEPPER)", account: null };
    try {
      return await authenticateLocal(rawUsername, password, {
        store: getLocalStore(),
        guard: getPinGuard(),
        pepper,
        dummyHash: await getDummyPinHash(pepper),
        ip: context.ip ?? null,
      });
    } catch (error) {
      return { kind: "unavailable", message: error instanceof Error ? error.message : "PIN login failed", account: null };
    }
  }
  const provider = process.env.QCHECK_AUTH || "central";
  if (provider === "mock") {
    if (!mockAuthEnabled()) return { kind: "unavailable", message: "Demo authentication is disabled", account: null };
    return mockAuthenticate(employeeCode, password);
  }
  if (provider !== "central") return { kind: "unavailable", message: "Invalid authentication provider configuration", account: null };

  const tracker = getAttemptTracker();

  const ticket = tracker.begin(employeeCode);
  // A rejected username is not proof of a real account; do not write it to audit logs.
  const account = null;

  if (ticket.kind === "locked") {
    return { kind: "locked", lockedUntil: ticket.lockedUntil, justLocked: false, account };
  }
  if (ticket.kind === "busy") {
    return { kind: "busy", account };
  }

  try {
    // 1. Authenticate with Datacenter API
    const dcResult = await authenticateWithDatacenter(rawUsername, password);

    if (dcResult.kind === "success") {
      ticket.settle(true);
      return { kind: "success", user: dcResult.user, unknownRoles: dcResult.unknownRoles };
    }

    if (dcResult.kind === "forbidden") {
      // Credentials were valid, but user is not allowed to access PRG003
      ticket.settle(true);
      return { kind: "forbidden", reason: dcResult.reason, account: dcResult.account, unknownRoles: dcResult.unknownRoles };
    }

    if (dcResult.kind === "disabled") {
      ticket.settle(true);
      return { kind: "disabled", account: dcResult.account ?? account };
    }

    // The central system failed: not a wrong password, so don't count it toward the lockout.
    //    `finally` releases the slot without recording a failure.
    if (dcResult.kind === "error") {
      return { kind: "unavailable", message: dcResult.message, account };
    }

    const outcome = ticket.settle(false);
    if (outcome.kind === "locked") return { ...outcome, account };
    if (outcome.kind === "invalid") return { ...outcome, account };
    return { kind: "invalid", attemptsLeft: authPolicy.maxAttempts - 1, account };
  } finally {
    if (ticket.kind === "started") ticket.release();
  }
}
