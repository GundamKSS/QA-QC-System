import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiMessages } from "@/lib/api/messages";
import { apiError, apiJson } from "@/lib/api/response";
import { userIdOf } from "@/lib/auth/admin-api";
import { audit, auditContext } from "@/lib/auth/audit";
import { canManageLocalUsers } from "@/lib/auth/local-admin";
import { knownProgramRole } from "@/lib/auth/roles";
import { ROLES, type ProgramRole, type Role } from "@/lib/auth/types";
import { dbConfigured } from "@/lib/db/config";
import { updateCentralUserRoles } from "@/lib/db/central-users";

const KNOWN = new Set<string>(ROLES);

/**
 * Updates a CENTRAL user's QCheck sub-roles (`dbo.user_roles`) and optionally their
 * ProgramPermission level (`USER` | `ADMIN` | `DEV`, synced to `DATA_CENTER.dbo.ProgramPermission`).
 * Restricted to Admin (ProgramPermission ADMIN or ADMIN sub-role) and Dev.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, { page: "users", returnTo: "/admin/users" });
  if ("response" in guard) return guard.response;
  if (!canManageLocalUsers(guard.user.roles, guard.user.programRole)) {
    return apiError(403, apiMessages.forbidden);
  }
  if (!dbConfigured()) {
    return apiError(503, "ยังไม่ได้ตั้งค่าฐานข้อมูล (DB_SERVER) — ไม่สามารถบันทึกสิทธิ์ผู้ใช้ระบบกลางได้");
  }

  const id = await userIdOf(context);
  if (!id) return apiError(404, "ไม่พบผู้ใช้ที่ระบุ");

  const fields = await readFields(request);
  const rawRoles = fields
    .all("roles")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  const rejected = rawRoles.filter((role) => !KNOWN.has(role));
  if (rejected.length > 0) {
    return apiError(422, `พบบทบาทที่ไม่รองรับ (${rejected.join(", ")})`);
  }
  const validRoles = ROLES.filter((role) => rawRoles.includes(role)) as Role[];

  const rawProgramRole = fields.text("programRole").trim();
  let nextProgramRole: ProgramRole | undefined;
  if (rawProgramRole) {
    const parsed = knownProgramRole(rawProgramRole);
    if (!parsed) {
      return apiError(422, "ระดับสิทธิ์ ProgramPermission ต้องเป็น User, Admin หรือ Dev เท่านั้น");
    }
    nextProgramRole = parsed;
  }

  const actorCanGrantDev = guard.user.programRole === "DEV";
  if (nextProgramRole === "DEV" && !actorCanGrantDev) {
    return apiError(403, "เฉพาะ Dev เท่านั้นที่สามารถกำหนดสิทธิ์ระดับ Dev ได้");
  }

  try {
    const result = await updateCentralUserRoles(
      id,
      validRoles,
      guard.user.id,
      nextProgramRole ? { nextProgramRole, actorCanGrantDev } : undefined,
    );
    if (!result.ok) {
      if (result.error === "forbidden_dev") {
        return apiError(403, "เฉพาะ Dev เท่านั้นที่สามารถเปลี่ยนแปลงสิทธิ์ระดับ Dev ได้");
      }
      return apiError(404, "ไม่พบผู้ใช้ระบบกลางที่ระบุ");
    }

    audit(
      {
        action: "user.roles_change",
        employeeCode: guard.user.employeeCode,
        userId: guard.user.id,
        target: { id: result.user.id, employeeCode: result.user.employeeCode },
        before: { roles: result.before, ...(nextProgramRole ? { programRole: result.beforeProgramRole } : {}) },
        after: { roles: result.after, ...(nextProgramRole ? { programRole: result.afterProgramRole } : {}) },
      },
      auditContext(request.headers),
    );

    revalidatePath("/admin/users");
    return apiJson({
      status: "done",
      message: `บันทึกสิทธิ์ของ ${result.user.employeeCode} แล้ว`,
      roles: result.after,
      programRole: result.afterProgramRole,
    });
  } catch (error) {
    return dbFailure(error, "central user roles update");
  }
}
