import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { actorIdOf, NO_ACCOUNT, planIdOf, PLAN_NOT_FOUND, revalidateWorkOrders } from "@/lib/plans/api";
import { getPlanStore } from "@/lib/plans/runtime";
import type { WorkOrderFormValues } from "@/lib/plans/state";
import { openWorkOrder, parseAssignees, parseCount, workOrderErrorMessage, type WorkOrderField } from "@/lib/plans/work-orders";

/**
 * Open one call-in of a plan and assign 2–5 QC (FR-JOB-00/01, docs/16). QC Head + Admin (W1); audited.
 * Assignees arrive as `assignee1…assignee5`. A refusal because someone is no longer an active QC Inspector
 * says `refresh: true`, so the browser reloads the page and its list drops them.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const at = Date.now();
  const planId = planIdOf((await context.params).id);
  const guard = await guardApi(request, { page: "work-order", returnTo: planId ? `/plans/${planId}/work-orders/new` : "/plans" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;

  const fields = await readFields(request);
  const assignees = parseAssignees(fields.get);
  const values: WorkOrderFormValues = {
    calledDate: fields.text("calledDate"),
    calledQty: fields.text("calledQty"),
    remarks: fields.text("remarks"),
    assignees: assignees.map((id) => id ?? ""),
  };
  if (!planId) return apiError(404, PLAN_NOT_FOUND, { values, at });

  let woNo: string;
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT, { values, at });
    const result = await openWorkOrder(
      getPlanStore(),
      { planId, calledQty: parseCount(fields.get("calledQty")), calledDate: fields.get("calledDate"), assignees, remarks: fields.get("remarks") },
      { actorId },
    );
    if (result.kind === "plan_not_found") return apiError(404, PLAN_NOT_FOUND, { values, at });
    if (result.kind === "plan_closed") return apiError(409, "แผนนี้เสร็จ ยกเลิก หรือถูกพักล็อตแล้ว — เปิดใบงานไม่ได้", { values, at });
    if (result.kind === "invalid") {
      const fieldErrors = Object.fromEntries(
        Object.entries(result.errors).map(([field, error]) => [field, workOrderErrorMessage(field as WorkOrderField, error!, { remaining: result.remaining, minimum: result.minimum, sameDayWoNo: result.sameDayWoNo })]),
      );
      if (result.unavailable) revalidatePath(`/plans/${planId}/work-orders/new`);
      return apiError(422, "กรุณาแก้ช่องที่มีปัญหา", { fieldErrors, unavailable: result.unavailable, values, at, ...(result.unavailable ? { refresh: true } : {}) });
    }
    woNo = result.woNo;
    audit(
      {
        action: "work_order.open",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "work_orders", id: result.id },
        after: { woNo, planId, calledQty: Number(values.calledQty.replace(/,/g, "")), calledDate: values.calledDate, type: result.type, need: result.need, assignees: result.assigneeIds },
      },
      auditContext(request.headers),
    );
  } catch (error) {
    return dbFailure(error, "open work order", { values, at });
  }
  revalidateWorkOrders(planId);
  return apiJson({ status: "done", redirectTo: `/plans/${planId}?${new URLSearchParams({ tab: "work", opened: woNo })}` }, 201);
}
