import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { actorIdOf, NO_ACCOUNT, planIdOf, PLAN_NOT_FOUND, revalidatePlan } from "@/lib/plans/api";
import { getPlanStore } from "@/lib/plans/runtime";
import { setWaitingGoods } from "@/lib/plans/service";

/** Tick / untick "รอของ" (FR-PLAN-17) — saved at once and audited. `value` is "1"/"true" to tick, anything else unticks. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const at = Date.now();
  const planId = planIdOf((await context.params).id);
  const guard = await guardApi(request, { page: "plan-open", returnTo: planId ? `/plans/${planId}` : "/plans" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;
  if (!planId) return apiError(404, PLAN_NOT_FOUND, { at });

  const value = ["1", "true"].includes((await readFields(request)).text("value"));
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT, { at });
    const result = await setWaitingGoods(getPlanStore(), { planId, value }, { actorId });
    if (result.kind === "not_found") return apiError(404, PLAN_NOT_FOUND, { at });
    if (result.kind === "blocked") return apiError(409, "แผนที่ยกเลิกหรือเสร็จแล้วติ๊ก “รอของ” ไม่ได้", { at });
    audit(
      {
        action: "plan.waiting_goods",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "plans", id: String(planId) },
        before: { waitingGoods: result.before },
        after: { waitingGoods: value },
        detail: { planNo: result.planNo },
      },
      auditContext(request.headers),
    );
  } catch (error) {
    return dbFailure(error, "waiting goods", { at });
  }
  revalidatePlan(planId);
  return apiJson({ status: "done", at });
}
