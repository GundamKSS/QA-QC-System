import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { actorIdOf, NO_ACCOUNT, planIdOf, revalidateWorkOrders, WORK_ORDER_LOCKED, WORK_ORDER_NOT_FOUND, workOrderIdOf } from "@/lib/plans/api";
import { getPlanStore } from "@/lib/plans/runtime";
import { parseAssignees, parseAssigneeTargets, setWorkOrderAssignees, workOrderErrorMessage } from "@/lib/plans/work-orders";

/**
 * Change the people of an open work order (docs/16 W4); `assignee1…assignee5` in slot order. The work order in
 * the path decides what changes; the plan in the path is where the person goes back to. Audited before → after.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string; woId: string }> }) {
  const at = Date.now();
  const params = await context.params;
  const planId = planIdOf(params.id);
  const guard = await guardApi(request, { page: "work-order", returnTo: planId ? `/plans/${planId}?tab=work` : "/plans" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;
  const workOrderId = workOrderIdOf(params.woId);
  if (!planId || !workOrderId) return apiError(404, WORK_ORDER_NOT_FOUND, { at });

  const fields = await readFields(request);
  const assignees = parseAssignees(fields.get);
  const rawTargets = parseAssigneeTargets(fields.get);
  const hasTargets = rawTargets.some((t) => t !== null);
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT, { at });
    const result = await setWorkOrderAssignees(
      getPlanStore(),
      { workOrderId, assignees, ...(hasTargets ? { assigneeTargets: rawTargets } : {}) },
      { actorId },
    );
    if (result.kind === "invalid") return apiError(422, workOrderErrorMessage("assignees", result.error), { at });
    if (result.kind === "not_found") return apiError(404, WORK_ORDER_NOT_FOUND, { at });
    if (result.kind === "locked") return apiError(409, WORK_ORDER_LOCKED, { at });
    if (result.kind === "assignees_unavailable") return apiError(422, workOrderErrorMessage("assignees", "unavailable"), { at });
    audit(
      {
        action: "work_order.assignees",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "work_orders", id: workOrderId },
        before: { assignees: result.before },
        after: { assignees: assignees.filter(Boolean) },
        detail: { woNo: result.woNo },
      },
      auditContext(request.headers),
    );
    revalidateWorkOrders(result.planId);
  } catch (error) {
    return dbFailure(error, "work order assignees", { at });
  }
  return apiJson({ status: "done", at });
}
