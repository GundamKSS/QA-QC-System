import { PROGRAM_ROLES, ROLES, type ProgramRole, type Role, type SessionUser } from "./types";

const KNOWN_ROLES = new Set<string>(ROLES);
const KNOWN_PROGRAM_ROLES = new Set<string>(PROGRAM_ROLES);
const PROGRAM_ROLE_PRIORITY: readonly ProgramRole[] = ["DEV", "ADMIN", "USER"];

export type ParsedProgramRole = {
  /** Highest-privilege recognized ProgramPermission level (`DEV` > `ADMIN` > `USER`), or null if none recognized. */
  programRole: ProgramRole | null;
  /** Codes from the central system that QCheck doesn't recognize — dropped, worth an audit line. */
  unknown: string[];
};

/**
 * Parses `role_prog` of PRG003 from Datacenter ProgramPermission.
 * Accepts an array or comma-separated string containing `User`, `Admin`, or `Dev` (case-insensitive).
 * If multiple levels are present, the highest privilege (`DEV` > `ADMIN` > `USER`) wins.
 */
export function parseProgramRole(value: unknown): ParsedProgramRole {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const codes = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  const matched = new Set<ProgramRole>();
  const unknown: string[] = [];
  for (const code of new Set(codes)) {
    if (KNOWN_PROGRAM_ROLES.has(code)) matched.add(code as ProgramRole);
    else unknown.push(code);
  }

  const programRole = PROGRAM_ROLE_PRIORITY.find((level) => matched.has(level)) ?? null;
  return { programRole, unknown };
}

/**
 * Resolves the effective QCheck sub-roles for a user:
 * - `DEV` from ProgramPermission sees everything and every page (all QCheck roles).
 * - `ADMIN` and `USER` (or LOCAL/mock) use the sub-roles stored in QCheck's own `dbo.user_roles` table.
 */
export function resolveEffectiveRoles(programRole: ProgramRole | undefined, appRoles: readonly Role[]): Role[] {
  if (programRole === "DEV") return [...ROLES];
  return ROLES.filter((role) => appRoles.includes(role));
}

/**
 * Whether a signed-in user has any access to QCheck pages:
 * - `DEV` always has full access.
 * - `ADMIN` always has access to admin/user-permission management (plus any sub-roles in QCheck).
 * - `USER` / `LOCAL` must hold at least one QCheck sub-role.
 */
export function hasAppAccess(user: Pick<SessionUser, "roles" | "programRole">): boolean {
  if (user.programRole === "DEV" || user.programRole === "ADMIN") return true;
  return user.roles.length > 0;
}

/** The local dev-mode switch (used for offline demo fallback & local dev impersonation). */
export function devRoleAllowed(): boolean {
  return process.env.QCHECK_ALLOW_DEV_ROLE === "on";
}

const LEGACY_ROLE_ALIASES: Record<string, Role> = {
  MASTER_ADMIN: "MASTERDATA_ADMIN",
};

/** Re-checks role codes read back from the session cookie or DB (accepts legacy MASTER_ADMIN alias). */
export function knownRoles(value: unknown): Role[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set<Role>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const mapped = LEGACY_ROLE_ALIASES[item] ?? item;
    if (KNOWN_ROLES.has(mapped)) valid.add(mapped as Role);
  }
  return ROLES.filter((role) => valid.has(role));
}

/** Re-checks `programRole` read back from the session cookie or DB. */
export function knownProgramRole(value: unknown): ProgramRole | undefined {
  if (typeof value !== "string") return undefined;
  const upper = value.trim().toUpperCase();
  return KNOWN_PROGRAM_ROLES.has(upper) ? (upper as ProgramRole) : undefined;
}

/** Whether a user holds permission to inspect units for the given side (`QC` vs `QA`). */
export function canInspectSide(roles: readonly Role[], side: "QC" | "QA", programRole?: ProgramRole): boolean {
  if (programRole === "DEV" || roles.includes("ADMIN")) return true;
  if (side === "QA") return roles.includes("QA_INSPECTOR") || roles.includes("QA_HEAD");
  return roles.includes("QC_INSPECTOR") || roles.includes("QC_HEAD");
}
