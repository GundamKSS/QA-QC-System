import "server-only";
import type { Fields } from "@/lib/api/body";
import { guardApi } from "@/lib/api/guard";
import { apiError } from "@/lib/api/response";
import { adminErrors } from "./admin-copy";
import { auditContext, type AuditContext } from "./audit";
import type { AdminDeps, AdminError } from "./local-admin";
import { getLocalStore, getPinGuard, pinPepper } from "./local-runtime";

/** HTTP status for each business answer of `local-admin`: what the person can retype is 422. */
export const adminErrorStatus: Record<AdminError, number> = {
  forbidden: 403,
  not_found: 404,
  name_required: 422,
  email_invalid: 422,
  roles_required: 422,
  roles_rejected: 422,
  pin_format: 422,
  pin_same: 422,
  pin_mismatch: 422,
  pin_wrong: 403,
  pin_locked: 423,
};

/** The Thai sentence for an `AdminError` (plus the rejected values, e.g. role names) with the matching status. */
export function adminFailure(error: AdminError, rejected?: string[]): Response {
  return apiError(adminErrorStatus[error], adminErrors[error] + (rejected?.length ? ` (${rejected.join(", ")})` : ""));
}

export type AdminContext = {
  deps: AdminDeps;
  actor: { id: string; employeeCode: string };
  /** IP and device for the audit row. */
  trail: AuditContext;
};

/**
 * Everything a `/api/admin/users…` route needs: the signed-in actor allowed on the "users" page
 * and the user store with the PIN pepper. Which actions that actor may take is decided by
 * `local-admin` (Admin does all; a QC Head only unlocks QC inspectors), answered as 403.
 */
export async function adminContext(request: Request): Promise<AdminContext | { response: Response }> {
  const guard = await guardApi(request, { page: "users", returnTo: "/admin/users" });
  if ("response" in guard) return guard;
  const pepper = pinPepper();
  if (!pepper) return { response: apiError(503, "ยังไม่ได้ตั้งค่า PIN_PEPPER บนเซิร์ฟเวอร์ — สร้างผู้ใช้หน้างานไม่ได้") };
  const { user } = guard;
  return {
    deps: { store: getLocalStore(), guard: getPinGuard(), pepper, actor: { id: user.id, roles: user.roles, programRole: user.programRole } },
    actor: { id: user.id, employeeCode: user.employeeCode },
    trail: auditContext(request.headers),
  };
}

/** The profile + roles fields of the create and edit forms. */
export const profileFields = (fields: Fields) => ({
  fullName: fields.text("fullName"),
  nickname: fields.text("nickname"),
  email: fields.text("email"),
  department: fields.text("department"),
  roles: fields.all("roles"),
});

const USER_ID = /^[\w-]{1,40}$/;

/** The `[id]` of the path, or null when it can't be a user id (answered as "not found"). */
export async function userIdOf(context: { params: Promise<{ id: string }> }): Promise<string | null> {
  const { id } = await context.params;
  return USER_ID.test(id) ? id : null;
}
