import { authPolicy } from "@/config/auth";
import { checkLocalRoles } from "./local-users";
import type { LocalUserStore } from "./local-store";
import { normalizeEmployeeCode } from "./employee-code";
import { verifyPin, type PinGuard } from "./pin";
import type { SessionUser } from "./types";

type Account = { id: string; employeeCode: string } | null;

/** Mirrors the LOCAL-relevant part of `AuthResult` (mock-adapter.ts) so the login action handles both alike. */
export type LocalAuthResult =
  | { kind: "success"; user: SessionUser }
  | { kind: "invalid"; attemptsLeft: number; account: Account }
  | { kind: "pinLocked"; justLocked: boolean; account: Account }
  | { kind: "locked"; lockedUntil: number; justLocked: boolean; account: Account }
  | { kind: "busy"; account: Account }
  | { kind: "disabled"; account: Account }
  | { kind: "forbidden"; reason: string; account: Account };

export type LocalAuthDeps = {
  store: LocalUserStore;
  guard: PinGuard;
  pepper: string;
  /** A real hash of a throwaway PIN, so an unknown code costs the same as a wrong PIN. */
  dummyHash: string;
  ip?: string | null;
};

export const NO_LOCAL_ROLE = "บัญชีนี้ยังไม่ได้รับบทบาทที่ใช้งานได้ กรุณาติดต่อผู้ดูแลระบบ";

/**
 * Login for field staff (DEC-12): employee code (F0001…) + PIN checked by QCheck itself.
 *
 * - Codes in the F namespace never go to the central system; an unknown one is checked against a
 *   dummy hash and fails exactly like a wrong PIN (no account enumeration, similar timing).
 * - Wrong PINs lock the account after `authPolicy.pin.maxAttempts`; the lock is persisted and only
 *   an Admin / QC Head clears it. A separate per-IP limiter (which a successful login does NOT
 *   reset, so one valid account can't refill the budget) slows one source trying many accounts.
 * - A deactivated account is only reported after the right PIN, so status isn't leaked.
 */
export async function authenticateLocal(codeInput: string, pin: string, deps: LocalAuthDeps): Promise<LocalAuthResult> {
  const { store, guard, pepper, dummyHash, ip } = deps;
  const employeeCode = normalizeEmployeeCode(codeInput);
  const user = await store.findByCode(employeeCode);
  const account: Account = user ? { id: user.id, employeeCode: user.employeeCode } : null;

  if (user?.pinLocked) return { kind: "pinLocked", justLocked: false, account };

  const ipTicket = ip ? guard.beginIp(ip) : null;
  if (ipTicket?.kind === "locked") return { kind: "locked", lockedUntil: ipTicket.lockedUntil, justLocked: false, account };
  if (ipTicket?.kind === "busy") return { kind: "busy", account };

  const ticket = guard.beginAccount(employeeCode);
  if (ticket.kind === "locked") {
    if (ipTicket?.kind === "started") ipTicket.release();
    return { kind: "pinLocked", justLocked: false, account };
  }
  if (ticket.kind === "busy") {
    if (ipTicket?.kind === "started") ipTicket.release();
    return { kind: "busy", account };
  }

  try {
    const matches = await verifyPin(pin, user?.pinHash ?? dummyHash, pepper);
    const ok = matches && user !== null;
    const outcome = ticket.settle(ok);
    if (ok) {
      if (ipTicket?.kind === "started") ipTicket.release();
      if (!user.isActive) return { kind: "disabled", account };
      const { roles } = checkLocalRoles(user.roles);
      if (roles.length === 0) return { kind: "forbidden", reason: NO_LOCAL_ROLE, account };
      return { kind: "success", user: { id: user.id, employeeCode: user.employeeCode, fullName: user.fullName, roles, mustChangePassword: user.mustChangePin, source: "LOCAL" } };
    }
    if (ipTicket?.kind === "started") ipTicket.settle(false);
    if (outcome.kind === "locked") {
      if (outcome.justLocked && user) await store.lockPin(user.id);
      return { kind: "pinLocked", justLocked: outcome.justLocked, account };
    }
    return { kind: "invalid", attemptsLeft: outcome.kind === "invalid" ? outcome.attemptsLeft : authPolicy.pin.maxAttempts - 1, account };
  } finally {
    ticket.release();
    if (ipTicket?.kind === "started") ipTicket.release();
  }
}
