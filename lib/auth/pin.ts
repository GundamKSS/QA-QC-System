import { createHmac } from "node:crypto";
import { authPolicy } from "@/lib/config/auth";
import { createAttemptTracker } from "./attempts";
import { hashPassword, verifyPassword } from "./password";

export type PinFormatError = "length" | "digits" | "repeated" | "sequence";

const RUNS = ["0123456789", "9876543210"];

/**
 * PIN rules (DEC-12): exactly `authPolicy.pin.length` digits, not all the same digit, not a
 * straight run (123456, 654321). Returns the first problem, or null when acceptable.
 */
export function pinFormatError(pin: string): PinFormatError | null {
  if (!/^\d*$/.test(pin)) return "digits";
  if (pin.length !== authPolicy.pin.length) return "length";
  if (/^(\d)\1+$/.test(pin)) return "repeated";
  if (RUNS.some((run) => run.includes(pin))) return "sequence";
  return null;
}

/** PIN failures key on the employee code, so guessing is limited per account wherever it comes from. */
export const pinKey = (employeeCode: string) => `pin:${employeeCode.trim().toUpperCase()}`;

/** A per-IP key limits one source trying many accounts (docs/12 §2 R6). */
export const pinIpKey = (ip: string) => `pin-ip:${ip}`;

/**
 * Wrong-PIN limiter. After `maxAttempts` the account stays locked — no timed unlock — until an
 * Admin / QC Head unlocks it (`unlock`). The IP limiter is separate and does time out.
 */
export function createPinGuard(now: () => number = Date.now) {
  const accounts = createAttemptTracker({ maxAttempts: authPolicy.pin.maxAttempts, lockMinutes: 24 * 60 }, now);
  const ips = createAttemptTracker({ maxAttempts: authPolicy.pin.maxAttempts * 6, lockMinutes: 15 }, now);
  return {
    beginAccount: (employeeCode: string) => accounts.begin(pinKey(employeeCode)),
    accountStatus: (employeeCode: string) => accounts.status(pinKey(employeeCode)),
    beginIp: (ip: string) => ips.begin(pinIpKey(ip)),
    /** Clears the in-memory lock after an Admin / QC Head unlocks (or resets) the PIN. */
    unlockAccount: (employeeCode: string) => accounts.reset(pinKey(employeeCode)),
  };
}

export type PinGuard = ReturnType<typeof createPinGuard>;

/**
 * The PIN is keyed with a server-side secret (pepper) before hashing, so a leaked database alone
 * can't be brute-forced offline (a 6-digit PIN has only a million values). The scrypt hash and its
 * salt come from password.ts; swap to Argon2id once the runtime has crypto.argon2 (Node ≥ 24.7).
 */
function peppered(pin: string, pepper: string): string {
  if (pepper.length < 32) throw new Error("PIN_PEPPER must be at least 32 characters");
  return createHmac("sha256", pepper).update(`pin:${pin}`).digest("base64url");
}

export async function hashPin(pin: string, pepper: string): Promise<string> {
  return hashPassword(peppered(pin, pepper));
}

export async function verifyPin(pin: string, stored: string, pepper: string): Promise<boolean> {
  return verifyPassword(peppered(pin, pepper), stored);
}
