import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiError } from "@/lib/api/response";
import { canAccessPage } from "@/lib/auth/page-access";
import { PLAN_NOT_FOUND, planIdOf } from "@/lib/plans/api";
import { loadWorkOrderList } from "@/lib/plans/work-order-list";

/**
 * The work orders of one plan (the "ใบงาน" tab of `/plans/[id]`); whoever may manage work orders also gets the
 * inspectors to pick from. Same gate as the plan page; 404 for an id that can't be a plan or a plan that doesn't
 * exist (after the gate). Reads only, so no origin check. Answers `WorkOrderListPayload` (`lib/plans/work-order-list.ts`).
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const planId = planIdOf((await context.params).id);
  const guard = await guardApi(request, { page: "plans", returnTo: planId ? `/plans/${planId}?tab=work` : "/plans" });
  if ("response" in guard) return guard.response;
  if (planId === null) return apiError(404, PLAN_NOT_FOUND);
  try {
    const result = await loadWorkOrderList(planId, canAccessPage(guard.user.roles, "work-order"));
    return result.kind === "loaded" ? apiData(result.payload) : apiError(404, PLAN_NOT_FOUND);
  } catch (error) {
    return dbFailure(error, "work order list");
  }
}
