import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { apiError, apiJson } from "@/lib/api/response";
import { adminContext, adminFailure, profileFields, userIdOf } from "@/lib/auth/admin-api";
import { adminErrors } from "@/lib/auth/admin-copy";
import { audit } from "@/lib/auth/audit";
import { updateLocalUser } from "@/lib/auth/local-admin";

/** Edit a field user's profile and roles (Admin only). `code` is the employee code shown in the audit row. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await adminContext(request);
  if ("response" in ctx) return ctx.response;
  const id = await userIdOf(context);
  if (!id) return apiError(404, adminErrors.not_found);
  const fields = await readFields(request);
  try {
    const result = await updateLocalUser(ctx.deps, id, profileFields(fields));
    if (!result.ok) return adminFailure(result.error, result.rejected);
    audit({ action: "user.roles_change", employeeCode: ctx.actor.employeeCode, userId: ctx.actor.id, target: { id, employeeCode: fields.text("code") }, detail: { before: result.before, after: result.after } }, ctx.trail);
    revalidatePath("/admin/users");
    return apiJson({ status: "done", message: "บันทึกแล้ว" });
  } catch (error) {
    return dbFailure(error, "user admin");
  }
}
