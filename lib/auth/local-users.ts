import { authPolicy } from "@/lib/config/auth";
import { ROLES, type Role } from "./types";

/** True for codes in the field-staff namespace (F0001…). The central system never issues these. */
export function isLocalCode(code: string): boolean {
  return authPolicy.local.codePattern.test(code.trim().toUpperCase());
}

const allowed = new Set<string>(authPolicy.local.allowedRoles);

export type LocalRolesResult = { roles: Role[]; rejected: string[] };

/**
 * Roles an Admin may give a field user (docs/12 §2 R3): only the field roles, in canonical order.
 * Anything else (ADMIN, heads, unknown codes) is rejected rather than silently dropped, so the
 * Admin UI can say why.
 */
export function checkLocalRoles(requested: readonly string[]): LocalRolesResult {
  const wanted = new Set(requested);
  const rejected = [...wanted].filter((role) => !allowed.has(role));
  return { roles: ROLES.filter((role) => wanted.has(role) && allowed.has(role)), rejected };
}
