import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { actorIdOf, NO_ACCOUNT, planIdOf, PLAN_NOT_FOUND, revalidatePlan } from "@/lib/plans/api";
import { getPlanStore } from "@/lib/plans/runtime";
import { setPlanVendor } from "@/lib/plans/service";

const VENDOR_MESSAGES = {
  not_found: PLAN_NOT_FOUND,
  plan_cancelled: "แผนนี้ถูกยกเลิกแล้ว — แก้ Vendor ไม่ได้",
  vendor_not_found: "ไม่พบ Vendor นี้ — โหลดหน้าใหม่แล้วเลือกอีกครั้ง",
  vendor_inactive: "Vendor นี้ถูกปิดใช้งานแล้ว — เลือกรายอื่น",
} as const;

const VENDOR_STATUS: Record<keyof typeof VENDOR_MESSAGES, number> = { not_found: 404, plan_cancelled: 409, vendor_not_found: 422, vendor_inactive: 422 };

/**
 * Fill in or change the Invoice/PO's vendor after the plan was opened (user 23 Oct 2026): the warehouse tells
 * the QC Head later. Every plan and work order of the document follows. An empty `vendorId` clears it.
 * Audited with before → after.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const at = Date.now();
  const planId = planIdOf((await context.params).id);
  const guard = await guardApi(request, { page: "plan-open", returnTo: planId ? `/plans/${planId}` : "/plans" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;
  if (!planId) return apiError(404, PLAN_NOT_FOUND, { at });

  const raw = (await readFields(request)).get("vendorId");
  const vendorId = raw !== null && /^\d{1,9}$/.test(raw) ? Number(raw) : null;
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT, { at });
    const result = await setPlanVendor(getPlanStore(), { planId, vendorId }, { actorId });
    if (result.kind !== "saved") return apiError(VENDOR_STATUS[result.kind], VENDOR_MESSAGES[result.kind], { at });
    audit(
      {
        action: "plan.vendor",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "receipt_docs", id: String(result.docId) },
        before: { vendorId: result.before },
        after: { vendorId: result.after },
        detail: { planId, docNo: result.docNo, plans: result.planNos },
      },
      auditContext(request.headers),
    );
  } catch (error) {
    return dbFailure(error, "plan vendor", { at });
  }
  revalidatePlan(planId);
  revalidatePath("/jobs");
  return apiJson({ status: "done", at });
}
