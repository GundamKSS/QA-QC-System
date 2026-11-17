import { revalidatePath } from "next/cache";
import { dbFailure } from "@/lib/api/db";
import { apiError, apiJson } from "@/lib/api/response";
import { adminContext, adminFailure, userIdOf } from "@/lib/auth/admin-api";
import { adminErrors } from "@/lib/auth/admin-copy";
import { audit } from "@/lib/auth/audit";
import { unlockLocalPin } from "@/lib/auth/local-admin";

/** Clear a PIN lock without changing the PIN. Admin, or a QC Head for QC inspectors (decided in `local-admin`). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await adminContext(request);
  if ("response" in ctx) return ctx.response;
  const id = await userIdOf(context);
  if (!id) return apiError(404, adminErrors.not_found);
  try {
    const result = await unlockLocalPin(ctx.deps, id);
    if (!result.ok) return adminFailure(result.error);
    audit({ action: "user.pin_unlock", employeeCode: ctx.actor.employeeCode, userId: ctx.actor.id, target: { id, employeeCode: result.employeeCode } }, ctx.trail);
    revalidatePath("/admin/users");
    return apiJson({ status: "done", message: `ปลดล็อก PIN ของ ${result.employeeCode} แล้ว` });
  } catch (error) {
    return dbFailure(error, "user admin");
  }
}
