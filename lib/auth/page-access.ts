import { ROLES, type ProgramRole, type Role } from "./types";

/** docs/02 §1: admission to a page. Record ownership and write permissions must
 * still be checked in that page's data queries/actions when its module is built. */
export const PAGE_ACCESS = {
  home: ROLES,
  alerts: ROLES,
  account: ROLES,
  /** View plans; ADMIN added because Admin may open plans (A11, user 20 Oct 2026). */
  plans: ["QC_HEAD", "QA_HEAD", "ADMIN"],
  /** Open / edit a plan (A11): QC Head, Admin — DEV from ProgramPermission sees all pages. QA Head views plans only. */
  "plan-open": ["QC_HEAD", "ADMIN"],
  /** Open work orders (call-ins), choose / change their QC and cancel them (docs/16 W1). QA Head only views them on the plan. */
  "work-order": ["QC_HEAD", "ADMIN"],
  jobs: ["QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR", "ADMIN"],
  /** Past work orders (docs/18): the role's third bottom tab, replacing Alerts there (the top-bar bell remains). */
  history: ["QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR", "ADMIN"],
  "qa-queue": ["QA_HEAD", "QA_INSPECTOR", "ADMIN"],
  scan: ["QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR", "ADMIN"],
  master: ["MASTERDATA_ADMIN", "ADMIN", "QC_HEAD", "QA_HEAD", "PM", "MANAGEMENT"],
  "master-edit": ["MASTERDATA_ADMIN", "ADMIN"],
  reports: ["ADMIN", "QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR", "PURCHASING", "PM", "MANAGEMENT"],
  settings: ["ADMIN"],
  /** Field users & Central user permissions: Admin/Dev manage all; Head QC / Head QA may unlock their own inspectors' PINs. */
  users: ["ADMIN", "QC_HEAD", "QA_HEAD"],
  dashboard: ["ADMIN", "QA_HEAD", "PURCHASING", "PM", "MANAGEMENT"],
  audit: ["ADMIN", "QC_HEAD", "QA_HEAD", "MANAGEMENT"],
  checklists: ROLES,
} as const satisfies Record<string, readonly Role[]>;

export type AppPage = keyof typeof PAGE_ACCESS;

/**
 * Pages granted automatically when Datacenter ProgramPermission is `ADMIN`,
 * even before granular operational sub-roles are assigned in QCheck.
 * All other operational pages (plans, jobs, qa-queue, master, reports, etc.)
 * are checked against QCheck's own `dbo.user_roles` table just like `USER`.
 */
const PROGRAM_ADMIN_DEFAULT_PAGES = new Set<AppPage>(["home", "alerts", "account", "users", "settings"]);

/**
 * Page admission check:
 * - `programRole === "DEV"`: sees everything and every page.
 * - `programRole === "ADMIN"`: automatically gets user/permission management + settings + shell basics,
 *   and checks QCheck sub-roles (`roles`) for all other operational pages.
 * - `programRole === "USER"` (or LOCAL/mock): checks QCheck sub-roles (`roles`).
 */
export function canAccessPage(roles: readonly Role[], page: AppPage, programRole?: ProgramRole): boolean {
  if (programRole === "DEV") return true;
  if (programRole === "ADMIN" && PROGRAM_ADMIN_DEFAULT_PAGES.has(page)) return true;
  const allowed: readonly Role[] = PAGE_ACCESS[page];
  return roles.some((role) => allowed.includes(role));
}
