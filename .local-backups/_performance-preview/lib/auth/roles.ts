import { ROLES, type Role } from "./types";

const KNOWN = new Set<string>(ROLES);
const DEV_ROLE = "DEV";

export type ParsedRoles = {
  roles: Role[];
  /** Codes from the central system that QCheck doesn't know — dropped, but worth an audit line. */
  unknown: string[];
};

/**
 * Turns `role_prog` of PRG003 into QCheck roles (FR-AUTH-04, docs/04 §3.1 ข้อ 3).
 * Accepts an array or a comma-separated string; trims and upper-cases each code; drops
 * unknown codes. `dev` grants every role, but only when `allowDev` (never in production).
 */
export function parseRoleProg(value: unknown, { allowDev }: { allowDev: boolean }): ParsedRoles {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const codes = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  const roles = new Set<Role>();
  const unknown: string[] = [];
  for (const code of new Set(codes)) {
    if (KNOWN.has(code)) roles.add(code as Role);
    else if (code === DEV_ROLE && allowDev) ROLES.forEach((role) => roles.add(role));
    else unknown.push(code);
  }
  // Keep the canonical order from ROLES so the "primary" role is stable.
  return { roles: ROLES.filter((role) => roles.has(role)), unknown };
}

/** The `dev` role is a convenience for local work only. */
export function devRoleAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.QCHECK_ALLOW_DEV_ROLE === "on";
}

/** Re-checks role codes read back from the session cookie. */
export function knownRoles(value: unknown): Role[] {
  return Array.isArray(value) ? ROLES.filter((role) => value.includes(role)) : [];
}
