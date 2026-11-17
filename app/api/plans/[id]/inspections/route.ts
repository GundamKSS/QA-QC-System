import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiError } from "@/lib/api/response";
import { getInspectionStore } from "@/lib/inspections/runtime";
import { PLAN_NOT_FOUND, planIdOf } from "@/lib/plans/api";
import { getPlanStore } from "@/lib/plans/runtime";

/**
 * Inspected units and inspection metrics of one plan (the "ผลการตรวจ" tab of `/plans/[id]`).
 * Allows Head QC / Inspectors to inspect every machine checked under this plan, its round, findings and outcome.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const planId = planIdOf((await context.params).id);
  const guard = await guardApi(request, { page: "plans", returnTo: planId ? `/plans/${planId}?tab=inspections` : "/plans" });
  if ("response" in guard) return guard.response;
  if (planId === null) return apiError(404, PLAN_NOT_FOUND);

  try {
    const planStore = getPlanStore();
    const plan = await planStore.getPlan(planId);
    if (!plan) return apiError(404, PLAN_NOT_FOUND);

    const store = getInspectionStore();
    const [inspections, summary] = await Promise.all([
      store.getPlanInspections(planId),
      store.getPlanInspectionSummary(planId),
    ]);

    return apiData({ inspections, summary });
  } catch (error) {
    return dbFailure(error, "plan inspections list");
  }
}
