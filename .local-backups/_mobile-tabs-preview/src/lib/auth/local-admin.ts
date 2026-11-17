import { randomInt } from "node:crypto";
import { checkLocalRoles } from "./local-users";
import type { LocalUserDetail, LocalUserStore } from "./local-store";
import { hashPin, pinFormatError, verifyPin, type PinGuard } from "./pin";
import type { Role } from "./types";
import { authPolicy } from "@/config/auth";

/** Admin may manage every field user; a QC Head may only unlock QC inspectors' PINs (docs/12 I4). */
export const canManageLocalUsers = (roles: readonly Role[]) => roles.includes("ADMIN");

export function canUnlockLocalUser(actorRoles: readonly Role[], target: Pick<LocalUserDetail, "roles">): boolean {
  if (canManageLocalUsers(actorRoles)) return true;
  return actorRoles.includes("QC_HEAD") && target.roles.includes("QC_INSPECTOR");
}

export type AdminError =
  | "forbidden"
  | "not_found"
  | "name_required"
  | "email_invalid"
  | "roles_required"
  | "roles_rejected"
  | "pin_format"
  | "pin_same"
  | "pin_mismatch"
  | "pin_wrong"
  | "pin_locked";

export type AdminDeps = { store: LocalUserStore; pepper: string; guard: PinGuard; actor: { id: string; roles: readonly Role[] } };
export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; error: AdminError; rejected?: string[] };

/** A random PIN that passes the format rules (no repeats or straight runs). */
export function generateTempPin(next: (max: number) => number = (max) => randomInt(max)): string {
  for (;;) {
    const pin = String(next(10 ** authPolicy.pin.length)).padStart(authPolicy.pin.length, "0");
    if (pinFormatError(pin) === null) return pin;
  }
}

const clean = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProfileInput = { fullName: string; nickname?: string | null; email?: string | null; department?: string | null };

function profileOf(input: ProfileInput): { ok: true; profile: { fullName: string; nickname: string | null; email: string | null; department: string | null } } | { ok: false; error: AdminError } {
  const fullName = input.fullName.trim().slice(0, 200);
  if (!fullName) return { ok: false, error: "name_required" };
  const email = clean(input.email);
  if (email && (email.length > 256 || !EMAIL.test(email))) return { ok: false, error: "email_invalid" };
  return { ok: true, profile: { fullName, nickname: clean(input.nickname)?.slice(0, 100) ?? null, email, department: clean(input.department)?.slice(0, 100) ?? null } };
}

/** Creates a field user with the next F-code and a temporary PIN, shown to the Admin once. */
export async function createLocalUser(deps: AdminDeps, input: ProfileInput & { roles: readonly string[] }): Promise<Outcome<{ user: LocalUserDetail; tempPin: string }>> {
  if (!canManageLocalUsers(deps.actor.roles)) return { ok: false, error: "forbidden" };
  const parsed = profileOf(input);
  if (!parsed.ok) return parsed;
  const { roles, rejected } = checkLocalRoles(input.roles);
  if (rejected.length > 0) return { ok: false, error: "roles_rejected", rejected };
  if (roles.length === 0) return { ok: false, error: "roles_required" };
  const tempPin = generateTempPin();
  const user = await deps.store.create({ ...parsed.profile, roles, pinHash: await hashPin(tempPin, deps.pepper), mustChangePin: true, createdBy: deps.actor.id });
  return { ok: true, user, tempPin };
}

export async function updateLocalUser(deps: AdminDeps, id: string, input: ProfileInput & { roles: readonly string[] }): Promise<Outcome<{ before: Role[]; after: Role[] }>> {
  if (!canManageLocalUsers(deps.actor.roles)) return { ok: false, error: "forbidden" };
  const current = await deps.store.findDetailById(id);
  if (!current) return { ok: false, error: "not_found" };
  const parsed = profileOf(input);
  if (!parsed.ok) return parsed;
  const { roles, rejected } = checkLocalRoles(input.roles);
  if (rejected.length > 0) return { ok: false, error: "roles_rejected", rejected };
  if (roles.length === 0) return { ok: false, error: "roles_required" };
  await deps.store.updateProfile(id, parsed.profile, deps.actor.id);
  await deps.store.setRoles(id, roles, deps.actor.id);
  return { ok: true, before: current.roles, after: roles };
}

/** Issues a new temporary PIN (also unlocks): the user must change it at next login. */
export async function resetLocalPin(deps: AdminDeps, id: string): Promise<Outcome<{ employeeCode: string; tempPin: string }>> {
  if (!canManageLocalUsers(deps.actor.roles)) return { ok: false, error: "forbidden" };
  const user = await deps.store.findDetailById(id);
  if (!user) return { ok: false, error: "not_found" };
  const tempPin = generateTempPin();
  await deps.store.setPin(id, await hashPin(tempPin, deps.pepper), { mustChange: true, by: deps.actor.id });
  deps.guard.unlockAccount(user.employeeCode);
  return { ok: true, employeeCode: user.employeeCode, tempPin };
}

/** Clears a PIN lock without changing the PIN. Admin, or a QC Head for QC inspectors. */
export async function unlockLocalPin(deps: AdminDeps, id: string): Promise<Outcome<{ employeeCode: string }>> {
  const user = await deps.store.findDetailById(id);
  if (!user) return { ok: false, error: "not_found" };
  if (!canUnlockLocalUser(deps.actor.roles, user)) return { ok: false, error: "forbidden" };
  await deps.store.unlockPin(id, deps.actor.id);
  deps.guard.unlockAccount(user.employeeCode);
  return { ok: true, employeeCode: user.employeeCode };
}

export async function setLocalActive(deps: AdminDeps, id: string, active: boolean): Promise<Outcome<{ employeeCode: string }>> {
  if (!canManageLocalUsers(deps.actor.roles)) return { ok: false, error: "forbidden" };
  const user = await deps.store.findDetailById(id);
  if (!user) return { ok: false, error: "not_found" };
  await deps.store.setActive(id, active, deps.actor.id);
  return { ok: true, employeeCode: user.employeeCode };
}

/**
 * A field user choosing their own PIN (forced after a temporary one). The current PIN is checked
 * through the same limiter as login, so this form can't be used to guess it.
 */
export async function changeOwnPin(deps: Omit<AdminDeps, "actor"> & { userId: string }, input: { current: string; next: string; confirm: string }): Promise<Outcome> {
  const user = await deps.store.findById(deps.userId);
  if (!user || !user.isActive) return { ok: false, error: "not_found" };
  if (user.pinLocked) return { ok: false, error: "pin_locked" };
  if (pinFormatError(input.next) !== null) return { ok: false, error: "pin_format" };
  if (input.next !== input.confirm) return { ok: false, error: "pin_mismatch" };
  if (input.next === input.current) return { ok: false, error: "pin_same" };

  const ticket = deps.guard.beginAccount(user.employeeCode);
  if (ticket.kind !== "started") return { ok: false, error: "pin_locked" };
  try {
    const matches = await verifyPin(input.current, user.pinHash, deps.pepper);
    const outcome = ticket.settle(matches);
    if (!matches) {
      if (outcome.kind === "locked" && outcome.justLocked) await deps.store.lockPin(user.id);
      return { ok: false, error: outcome.kind === "locked" ? "pin_locked" : "pin_wrong" };
    }
  } finally {
    ticket.release();
  }
  await deps.store.setPin(user.id, await hashPin(input.next, deps.pepper), { mustChange: false, by: user.id });
  return { ok: true };
}
