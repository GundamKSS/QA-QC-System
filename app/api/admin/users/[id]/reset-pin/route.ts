import { revalidatePath } from "next/cache";
import { dbFailure } from "@/lib/api/db";
import { apiError, apiJson } from "@/lib/api/response";
import { adminContext, adminFailure, userIdOf } from "@/lib/auth/admin-api";
import { adminErrors } from "@/lib/auth/admin-copy";
import { audit } from "@/lib/auth/audit";
import { resetLocalPin } from "@/lib/auth/local-admin";

/** Issue a new temporary PIN (Admin only). It also unlocks, and the person must change it at next login. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await adminContext(request);
  if ("response" in ctx) return ctx.response;
  const id = await userIdOf(context);
  if (!id) return apiError(404, adminErrors.not_found);
  try {
    const result = await resetLocalPin(ctx.deps, id);
    if (!result.ok) return adminFailure(result.error);
    audit({ action: "user.pin_reset", employeeCode: ctx.actor.employeeCode, userId: ctx.actor.id, target: { id, employeeCode: result.employeeCode } }, ctx.trail);
    revalidatePath("/admin/users");
    return apiJson({
      status: "done",
      message: `ออก PIN ชั่วคราวใหม่ให้ ${result.employeeCode} แล้ว (แสดงครั้งเดียว) — เจ้าตัวต้องเปลี่ยนเมื่อเข้าครั้งแรก`,
      tempPin: result.tempPin,
      employeeCode: result.employeeCode,
    });
  } catch (error) {
    return dbFailure(error, "user admin");
  }
}
