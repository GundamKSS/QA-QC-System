import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiError } from "@/lib/api/response";
import { canAccessPage } from "@/lib/auth/page-access";
import { PLAN_NOT_FOUND, planIdOf } from "@/lib/plans/api";
import { loadPlanDetail } from "@/lib/plans/detail";

/**
 * One plan: its header, the other plans of the same Invoice/PO and the status history (the "ข้อมูล" and "ประวัติ"
 * tabs of `/plans/[id]`), plus the vendor choices for whoever may edit the plan. Same gate as the plan list; 404 for
 * an id that can't be a plan or a plan that doesn't exist (after the gate). Reads only, so no origin check.
 * Answers `PlanDetailPayload` (`lib/plans/detail.ts`).
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const planId = planIdOf((await context.params).id);
  const guard = await guardApi(request, { page: "plans", returnTo: planId ? `/plans/${planId}` : "/plans" });
  if ("response" in guard) return guard.response;
  if (planId === null) return apiError(404, PLAN_NOT_FOUND);
  try {
    const result = await loadPlanDetail(planId, canAccessPage(guard.user.roles, "plan-open"));
    return result.kind === "loaded" ? apiData(result.payload) : apiError(404, PLAN_NOT_FOUND);
  } catch (error) {
    return dbFailure(error, "plan detail");
  }
}
