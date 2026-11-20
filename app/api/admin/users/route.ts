import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiJson } from "@/lib/api/response";
import { adminContext, adminFailure, profileFields } from "@/lib/auth/admin-api";
import { loadLocalUsers } from "@/lib/auth/admin-users";
import { audit } from "@/lib/auth/audit";
import { createLocalUser } from "@/lib/auth/local-admin";
import { getLocalStore } from "@/lib/auth/local-runtime";

/**
 * The field users list (Admin: everything; QC Head: the same rows, unlock only for QC inspectors). Reads only,
 * so no origin check and no PIN pepper needed. Answers `AdminUsersPayload` (`lib/auth/admin-users.ts`).
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "users", returnTo: "/admin/users" });
  if ("response" in guard) return guard.response;
  try {
    return apiData(await loadLocalUsers(getLocalStore(), guard.user.roles, guard.user.programRole));
  } catch (error) {
    return dbFailure(error, "user admin list");
  }
}

/** Create a field user (Admin only): the next F-code and a temporary PIN, shown to the Admin once. */
export async function POST(request: Request) {
  const ctx = await adminContext(request);
  if ("response" in ctx) return ctx.response;
  const fields = await readFields(request);
  try {
    const result = await createLocalUser(ctx.deps, profileFields(fields));
    if (!result.ok) return adminFailure(result.error, result.rejected);
    audit({ action: "user.create", employeeCode: ctx.actor.employeeCode, userId: ctx.actor.id, target: { id: result.user.id, employeeCode: result.user.employeeCode }, detail: { roles: result.user.roles } }, ctx.trail);
    revalidatePath("/admin/users");
    return apiJson(
      {
        status: "done",
        message: `สร้างผู้ใช้ ${result.user.employeeCode} แล้ว — จด PIN ชั่วคราวส่งให้เจ้าตัว (แสดงครั้งเดียว)`,
        tempPin: result.tempPin,
        employeeCode: result.user.employeeCode,
      },
      201,
    );
  } catch (error) {
    return dbFailure(error, "user admin");
  }
}
