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
    if (result.kind !== "loaded") return apiError(404, PLAN_NOT_FOUND);

    // ฝั่ง QA จะเห็นแผนได้เฉพาะเมื่อ Head QC ได้กดส่งต่องานมาให้ QA แล้วเท่านั้น (QA_PENDING, QA_IN_PROGRESS, COMPLETED)
    const isQaOnly =
      guard.user.roles.includes("QA_HEAD") &&
      !guard.user.roles.includes("QC_HEAD") &&
      !guard.user.roles.includes("ADMIN");
    if (isQaOnly && result.payload?.plan?.status) {
      const status = result.payload.plan.status;
      const isSubmittedToQa = ["QA_PENDING", "QA_IN_PROGRESS", "COMPLETED", "ON_HOLD", "QA_LOT_REJECTED"].includes(status);
      if (!isSubmittedToQa) {
        return apiError(403, "แผนตรวจนี้ยังอยู่ในขั้นตอนของฝ่าย QC (ยังไม่ได้กดส่งต่องานมาให้ฝ่าย QA)");
      }
    }

    return apiData(result.payload);
  } catch (error) {
    return dbFailure(error, "plan detail");
  }
}
