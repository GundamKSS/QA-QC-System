import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { actorIdOf, CANCEL_MESSAGES, CANCEL_STATUS, NO_ACCOUNT, planIdOf, revalidateWorkOrders, WORK_ORDER_LOCKED, WORK_ORDER_NOT_FOUND, workOrderIdOf } from "@/lib/plans/api";
import { getPlanStore } from "@/lib/plans/runtime";
import { cancelWorkOrder } from "@/lib/plans/work-orders";

/** Cancel a work order with no results yet (docs/16 W4); its quantity returns to the lot. A reason is required. Audited. */
export async function POST(request: Request, context: { params: Promise<{ id: string; woId: string }> }) {
  const at = Date.now();
  const params = await context.params;
  const planId = planIdOf(params.id);
  const guard = await guardApi(request, { page: "work-order", returnTo: planId ? `/plans/${planId}?tab=work` : "/plans" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;
  const workOrderId = workOrderIdOf(params.woId);
  if (!planId || !workOrderId) return apiError(404, WORK_ORDER_NOT_FOUND, { at });

  const reason = (await readFields(request)).get("reason");
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT, { at });
    const result = await cancelWorkOrder(getPlanStore(), { workOrderId, reason }, { actorId });
    if (result.kind === "reason_required" || result.kind === "reason_too_long") return apiError(CANCEL_STATUS[result.kind], CANCEL_MESSAGES[result.kind], { at });
    if (result.kind === "not_found") return apiError(404, WORK_ORDER_NOT_FOUND, { at });
    if (result.kind === "locked") return apiError(409, result.block === "has_results" ? "ใบงานนี้มีผลตรวจแล้ว — ยกเลิกไม่ได้" : WORK_ORDER_LOCKED, { at });
    audit(
      {
        action: "work_order.cancel",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "work_orders", id: workOrderId },
        after: { status: "CANCELLED" },
        detail: { woNo: result.woNo, calledQty: result.calledQty, reason: reason?.trim() },
      },
      auditContext(request.headers),
    );
    revalidateWorkOrders(result.planId);
  } catch (error) {
    return dbFailure(error, "cancel work order", { at });
  }
  return apiJson({ status: "done", at });
}
