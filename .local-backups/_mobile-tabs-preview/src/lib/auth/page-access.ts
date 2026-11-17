import { ROLES, type Role } from "./types";

/** docs/02 §1: admission to a page. Record ownership and write permissions must
 * still be checked in that page's data queries/actions when its module is built. */
export const PAGE_ACCESS = {
  home: ROLES,
  alerts: ROLES,
  account: ROLES,
  /** View plans; ADMIN added because Admin may open plans (A11, user 20 Oct 2026). */
  plans: ["QC_HEAD", "QA_HEAD", "ADMIN"],
  /** Open / edit a plan (A11): QC Head, QA Head, Admin — the local `dev` role expands to all roles. */
  "plan-open": ["QC_HEAD", "QA_HEAD", "ADMIN"],
  /** Open work orders (call-ins), choose / change their QC and cancel them (docs/16 W1). QA Head only views them on the plan. */
  "work-order": ["QC_HEAD", "ADMIN"],
  jobs: ["QC_HEAD", "QC_INSPECTOR"],
  "qa-queue": ["QA_HEAD", "QA_INSPECTOR"],
  scan: ["QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR"],
  master: ["MASTER_ADMIN", "QC_HEAD", "QA_HEAD", "PM", "MANAGEMENT"],
  "master-edit": ["MASTER_ADMIN"],
  reports: ["ADMIN", "QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR", "PURCHASING", "PM", "MANAGEMENT"],
  settings: ["ADMIN"],
  /** Field users (DEC-12): Admin manages them; a QC Head may open the page to unlock QC inspectors' PINs. */
  users: ["ADMIN", "QC_HEAD"],
  dashboard: ["QA_HEAD", "PURCHASING", "PM", "MANAGEMENT"],
  audit: ["ADMIN", "QC_HEAD", "QA_HEAD", "MANAGEMENT"],
  checklists: ROLES,
} as const satisfies Record<string, readonly Role[]>;

export type AppPage = keyof typeof PAGE_ACCESS;

/** Union of explicitly granted roles; ADMIN does not implicitly grant business roles. */
export function canAccessPage(roles: readonly Role[], page: AppPage): boolean {
  const allowed: readonly Role[] = PAGE_ACCESS[page];
  return roles.some(role => allowed.includes(role));
}
