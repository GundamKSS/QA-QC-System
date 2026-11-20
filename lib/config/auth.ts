/**
 * Auth policy (FR-AUTH-01/02/05, docs/02 §3 M01). Server and client both read it,
 * so keep it free of secrets and Node-only imports.
 */
export const authPolicy = {
  /** Consecutive failures before the account is locked. */
  maxAttempts: 5,
  /** Lock duration after `maxAttempts` failures. */
  lockMinutes: 15,
  /** Show "attempts left" once this many attempts remain (failures 3 and 4). */
  warnWhenAttemptsLeft: 2,
  /** Personal device session length (FR-AUTH-05 ⚙️). Shared devices time out on idle (`devices`). */
  sessionHours: 12,
  /**
   * Per device type (FR-AUTH-05 ⚙️, docs/10 §2). `idleMinutes: null` = no idle timeout.
   * Shared devices sign the user out after 30 idle minutes and warn `warnSeconds` before.
   */
  devices: {
    personal: { idleMinutes: null, warnSeconds: 0 },
    shared: { idleMinutes: 30, warnSeconds: 60 },
  },
  /** PIN for field staff without a central account (DEC-12, docs/12). */
  pin: {
    length: 6,
    /** Wrong PINs before the account is locked until an Admin / QC Head unlocks it. */
    maxAttempts: 5,
  },
  /** Field (LOCAL) users: Admin-created, PIN login, roles set inside QCheck (docs/12 §2 R2–R3). */
  local: {
    /** Codes the central system never issues (it uses TRW####). F + at least 4 digits, e.g. F0001. */
    codePattern: /^F\d{4,}$/,
    /** Field users may only ever hold these roles — never ADMIN, heads or MASTERDATA_ADMIN. */
    allowedRoles: ["QC_INSPECTOR", "QA_INSPECTOR"],
  },
  sessionCookie: "qcheck_session",
  /** HttpOnly opaque device token bound by Admin for shared factory tablets/kiosks (FR-AUTH-05). */
  deviceCookie: "qcheck_device",
  /** Where a signed-in user lands when no safe `next` is given. */
  homePath: "/home",
  changePasswordPath: "/change-password",
  noAccessPath: "/no-access",
  loginPath: "/login",
  /** POST-only route handler (app/api/auth/logout/route.ts). */
  logoutPath: "/api/auth/logout",
  /** Tirawat Datacenter API configuration */
  datacenter: {
    defaultBaseUrl: "http://192.168.0.248:8000",
    authPermissionProgPath: "/auth/auth_permission_prog",
    defaultProgramCode: "PRG003",
  },
} as const;

/** Never a post-login destination: `next` pointing here falls back to `homePath`. `/api` is endpoints, not pages. */
export const authOnlyPaths = [authPolicy.loginPath, authPolicy.changePasswordPath, authPolicy.noAccessPath, "/auth", "/api"] as const;
