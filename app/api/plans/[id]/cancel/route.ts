import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { actorIdOf, CANCEL_MESSAGES, CANCEL_STATUS, NO_ACCOUNT, planIdOf, PLAN_NOT_FOUND, revalidatePlan } from "@/lib/plans/api";
import { getPlanStore } from "@/lib/plans/runtime";
import { cancelPlan } from "@/lib/plans/service";

/** Cancel a plan with a reason (BR-13, docs/15 §3). Audited; the same Invoice + Model can then be opened again. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const at = Date.now();
  const planId = planIdOf((await context.params).id);
  const guard = await guardApi(request, { page: "plan-open", returnTo: planId ? `/plans/${planId}` : "/plans" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;
  if (!planId) return apiError(404, PLAN_NOT_FOUND, { at });

  const reason = (await readFields(request)).get("reason");
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT, { at });
    const isHead = actor.roles.includes("QC_HEAD");
    const result = await cancelPlan(getPlanStore(), { planId, reason, isHead }, { actorId });
    if (result.kind === "blocked") return apiError(CANCEL_STATUS[result.block], CANCEL_MESSAGES[result.block], { at });
    if (result.kind !== "cancelled") return apiError(CANCEL_STATUS[result.kind], CANCEL_MESSAGES[result.kind], { at });
    audit(
      {
        action: "plan.cancel",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "plans", id: String(planId) },
        before: { status: result.from },
        after: { status: "CANCELLED" },
        detail: { planNo: result.planNo, reason: String(reason).trim() },
      },
      auditContext(request.headers),
    );
  } catch (error) {
    return dbFailure(error, "cancel plan", { at });
  }
  revalidatePlan(planId);
  return apiJson({ status: "done", at });
}
