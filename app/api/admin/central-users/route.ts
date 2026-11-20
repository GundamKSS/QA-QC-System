import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiMessages } from "@/lib/api/messages";
import { apiData, apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { canManageLocalUsers } from "@/lib/auth/local-admin";
import { knownProgramRole } from "@/lib/auth/roles";
import { ROLES, type Role } from "@/lib/auth/types";
import { dbConfigured } from "@/lib/db/config";
import { grantCentralUserAccess, listCentralUsers } from "@/lib/db/central-users";

const KNOWN_ROLES = new Set<string>(ROLES);

/**
 * Lists CENTRAL users along with their Datacenter ProgramPermission level (`USER` | `ADMIN` | `DEV`)
 * and their QCheck sub-roles (`dbo.user_roles`). Restricted to Admin / Dev.
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "users", returnTo: "/admin/users" });
  if ("response" in guard) return guard.response;
  if (!canManageLocalUsers(guard.user.roles, guard.user.programRole)) {
    return apiError(403, apiMessages.forbidden);
  }
  if (!dbConfigured()) {
    return apiData({ users: [] });
  }
  try {
    return apiData(await listCentralUsers());
  } catch (error) {
    return dbFailure(error, "central users list");
  }
}

/**
 * Grants a DATA_CENTER employee access to QCheck (`ProgramID = 3` in `DATA_CENTER.dbo.ProgramPermission`)
 * and assigns their QCheck sub-roles in `QCheck.dbo.user_roles`.
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, { page: "users", returnTo: "/admin/users" });
  if ("response" in guard) return guard.response;
  if (!canManageLocalUsers(guard.user.roles, guard.user.programRole)) {
    return apiError(403, apiMessages.forbidden);
  }
  if (!dbConfigured()) {
    return apiError(503, "ยังไม่ได้ตั้งค่าฐานข้อมูล (DB_SERVER) — ไม่สามารถเพิ่มสิทธิ์ผู้ใช้ระบบกลางได้");
  }

  const fields = await readFields(request);
  const employeeCode = fields.text("employeeCode").trim();
  if (!employeeCode) {
    return apiError(422, "กรุณาเลือกหรือกรอกรหัสพนักงานจาก DATA_CENTER");
  }

  const programRole = knownProgramRole(fields.text("programRole") || "USER");
  if (!programRole) {
    return apiError(422, "ระดับสิทธิ์ ProgramPermission ต้องเป็น User, Admin หรือ Dev เท่านั้น");
  }

  // Only DEV may grant DEV level in ProgramPermission.
  if (programRole === "DEV" && guard.user.programRole !== "DEV") {
    return apiError(403, "เฉพาะ Dev เท่านั้นที่สามารถกำหนดสิทธิ์ระดับ Dev ได้");
  }

  const rawRoles = fields
    .all("roles")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const rejected = rawRoles.filter((role) => !KNOWN_ROLES.has(role));
  if (rejected.length > 0) {
    return apiError(422, `พบบทบาทที่ไม่รองรับ (${rejected.join(", ")})`);
  }
  const validRoles = ROLES.filter((role) => rawRoles.includes(role)) as Role[];

  try {
    const result = await grantCentralUserAccess({
      employeeCode,
      programRole,
      roles: validRoles,
      actorId: guard.user.id,
    });

    if (!result.ok) {
      if (result.error === "code_too_long") {
        return apiError(422, "รหัสพนักงานยาวเกิน 32 ตัวอักษร");
      }
      return apiError(404, `ไม่พบรหัสพนักงาน ${employeeCode} ในตาราง DATA_CENTER.dbo.Employee`);
    }

    audit(
      {
        action: result.created ? "user.create" : "user.roles_change",
        employeeCode: guard.user.employeeCode,
        userId: guard.user.id,
        target: { id: result.user.id, employeeCode: result.user.employeeCode },
        before: result.before,
        after: result.after,
      },
      auditContext(request.headers),
    );

    revalidatePath("/admin/users");
    return apiJson(
      {
        status: "done",
        message: `${result.created ? "เพิ่มสิทธิ์" : "อัปเดตสิทธิ์"} ${result.user.employeeCode} (${result.user.fullName}) เรียบร้อยแล้ว`,
        user: result.user,
      },
      result.created ? 201 : 200,
    );
  } catch (error) {
    return dbFailure(error, "central user grant");
  }
}
