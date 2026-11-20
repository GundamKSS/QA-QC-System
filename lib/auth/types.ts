/** Roles from docs/02 §1 (one user can hold several — FR-AUTH-04). */
export const ROLES = [
  "ADMIN",
  "MASTERDATA_ADMIN",
  "QC_HEAD",
  "QC_INSPECTOR",
  "QA_HEAD",
  "QA_INSPECTOR",
  "PURCHASING",
  "PM",
  "MANAGEMENT",
] as const;

export type Role = (typeof ROLES)[number];

/** Coarse permission level coming from Datacenter ProgramPermission (`role_prog` of PRG003). */
export const PROGRAM_ROLES = ["USER", "ADMIN", "DEV"] as const;

export type ProgramRole = (typeof PROGRAM_ROLES)[number];

export type Affiliation = "TRW" | "PUMA";

/** Program permission item returned by Datacenter auth endpoint */
export type DatacenterProgram = {
  program_id: number;
  program_code: string;
  program_name: string;
  url?: string;
  /** QCheck role codes: an array, or a comma-separated string (docs/08 §1). */
  role_prog: string | string[];
  can_use: boolean;
  is_active: boolean;
  granted_at?: string | null;
};

/** Response schema from API_Datacenter/auth/auth_permission_prog */
export type DatacenterAuthResponse = {
  access_token: string;
  display_name: string;
  employee_no: string;
  email: string;
  role: string;
  programs: DatacenterProgram[];
};

export type PermissionCheckResult =
  | { allowed: true; program: DatacenterProgram }
  | {
      allowed: false;
      reason: "not_granted" | "cannot_use" | "inactive";
      message: string;
      program?: DatacenterProgram;
    };

/** Mirrors the `users` table in docs/03 (password_hash only, never plaintext). */
export type UserRecord = {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string;
  affiliation: Affiliation;
  roles: Role[];
  passwordHash: string;
  mustChangePassword: boolean;
  isActive: boolean;
};

/** The narrow user shape that pages and client components may see. */
export type SessionUser = {
  id: string;
  employeeCode: string;
  fullName: string;
  roles: Role[];
  /** Coarse permission level from Datacenter ProgramPermission (`USER` | `ADMIN` | `DEV`). Absent for LOCAL/mock. */
  programRole?: ProgramRole;
  /** True only when a DEV account is actively impersonating another user (stored inside encrypted JWE cookie). */
  impersonatedByDev?: boolean;
  mustChangePassword: boolean;
  email?: string;
  /** Field staff (no central account) sign in with a PIN — DEC-12. Absent = CENTRAL. */
  source?: "LOCAL";
};

/** What `POST /api/auth/change-pin` answers; the PIN form renders `error` and the browser follows `redirectTo` after `done`. */
export type PinChangeState = { status: "idle" } | { status: "error"; message: string } | { status: "done" };

/**
 * What the `/api/admin/users…` routes answer to the user-management forms. `tempPin` is shown once
 * and never stored or logged.
 */
export type AdminState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string; tempPin?: string; employeeCode?: string };

/** What `POST /api/auth/login` answers to the login form (it renders each `status`; `at` is unique per answer). */
export type LoginState =
  | { status: "idle" }
  | {
      status: "invalid";
      employeeCode: string;
      /** Shown only when few attempts remain (see authPolicy.warnWhenAttemptsLeft). */
      attemptsLeft: number | null;
      fieldErrors?: { employeeCode?: boolean; password?: boolean };
      at: number;
    }
  | { status: "locked"; employeeCode: string; lockedUntil: number; at: number }
  /** Field user's PIN is locked after too many wrong tries; an Admin / QC Head must unlock it. */
  | { status: "pinLocked"; employeeCode: string; at: number }
  | { status: "disabled"; employeeCode: string; at: number }
  | { status: "forbidden"; employeeCode: string; message: string; at: number }
  /** The central auth system is down, slow or answered garbage — not the user's fault (FR-AUTH-08). */
  | { status: "unavailable"; employeeCode: string; at: number }
  /** The browser got no usable answer from QCheck itself (network dropped, server restarting) — built by the form, never sent by the server. */
  | { status: "unreachable"; employeeCode: string; at: number }
  /** `employeeCode` keeps the field filled while the welcome line shows (React resets the form). */
  | { status: "success"; employeeCode: string; next: string; fullName: string; at: number };
