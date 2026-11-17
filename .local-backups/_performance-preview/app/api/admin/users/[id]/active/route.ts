import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { apiError, apiJson } from "@/lib/api/response";
import { adminContext, adminFailure, userIdOf } from "@/lib/auth/admin-api";
import { adminErrors } from "@/lib/auth/admin-copy";
import { audit } from "@/lib/auth/audit";
import { setLocalActive } from "@/lib/auth/local-admin";

/** Turn a field user on or off (Admin only): `active` is "1"/"true" to enable, anything else disables. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await adminContext(request);
  if ("response" in ctx) return ctx.response;
  const id = await userIdOf(context);
  if (!id) return apiError(404, adminErrors.not_found);
  const fields = await readFields(request);
  const active = ["1", "true"].includes(fields.text("active"));
  try {
    const result = await setLocalActive(ctx.deps, id, active);
    if (!result.ok) return adminFailure(result.error);
    audit({ action: active ? "user.activate" : "user.deactivate", employeeCode: ctx.actor.employeeCode, userId: ctx.actor.id, target: { id, employeeCode: result.employeeCode } }, ctx.trail);
    revalidatePath("/admin/users");
    return apiJson({
      status: "done",
      message: active ? `เปิดใช้งาน ${result.employeeCode} แล้ว` : `ปิดการใช้งาน ${result.employeeCode} แล้ว — เข้าระบบไม่ได้ทันที`,
    });
  } catch (error) {
    return dbFailure(error, "user admin");
  }
}
