import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { getInspectionStore } from "@/lib/inspections/runtime";
import { actorIdOf, NO_ACCOUNT, planIdOf, PLAN_NOT_FOUND, revalidatePlan } from "@/lib/plans/api";
import { getPlanStore } from "@/lib/plans/runtime";
import { submitPlanToQa } from "@/lib/plans/service";

/**
 * BR-07 / FR-RPT-06: QC Head approves QC inspection results and forwards the plan to QA.
 * Audited; advances the plan status to QA_PENDING.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const at = Date.now();
  const planId = planIdOf((await context.params).id);
  const guard = await guardApi(request, { page: "plans", returnTo: planId ? `/plans/${planId}` : "/plans" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;
  if (!planId) return apiError(404, PLAN_NOT_FOUND, { at });

  // Only QC Head or Admin may approve & submit to QA (QC Head approves and hands over to QA)
  const isHead =
    actor.roles.includes("QC_HEAD") ||
    actor.roles.includes("ADMIN");
  if (!isHead) {
    return apiError(403, "เฉพาะ QC Head หรือผู้ดูแลระบบเท่านั้นที่มีสิทธิ์ตรวจทานและส่งต่อ QA", { at });
  }

  const fields = await readFields(request);
  const remarks = fields.get("remarks")?.trim() || null;

  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT, { at });

    const outcome = await submitPlanToQa(
      getPlanStore(),
      getInspectionStore(),
      { planId, remarks },
      { actorId, actorName: actor.fullName || actor.employeeCode },
    );

    if (outcome.kind === "not_found") {
      return apiError(404, PLAN_NOT_FOUND, { at });
    }
    if (outcome.kind === "no_work_orders") {
      return apiError(422, "แผนตรวจนี้ยังไม่มีการเปิดใบงาน", { at });
    }
    if (outcome.kind === "quota_not_met") {
      return apiError(
        422,
        `ตรวจยังไม่ครบตามเป้าหมาย (ตรวจแล้ว ${outcome.qcDone}/${outcome.qcRequired} เครื่อง)`,
        { at },
      );
    }
    if (outcome.kind === "rework_pending") {
      return apiError(
        422,
        `ยังมีเครื่องรอแก้ไข (Rework) อยู่ ${outcome.reworkCount} เครื่อง กรุณาซ่อมให้เสร็จสิ้นก่อนส่งต่อ QA`,
        { at },
      );
    }
    if (outcome.kind === "work_orders_incomplete") {
      const details = outcome.incompleteWorkOrders
        .map((w) => {
          const parts = [`ตรวจแล้ว ${w.qtyDone}/${w.qtyNeed}`];
          if (w.reworkCount > 0) parts.push(`ค้างซ่อม ${w.reworkCount}`);
          if (w.status === "RETURNED") parts.push("ถูกตีกลับ");
          return `${w.woNo} (${parts.join(", ")})`;
        })
        .join(", ");
      return apiError(
        422,
        `ยังมีใบงานที่ยังไม่เสร็จสิ้นตาม Need หรือค้างซ่อม: ${details} — กรุณาตรวจให้ครบทุกใบงานก่อนส่งต่อ QA`,
        { at },
      );
    }
    if (outcome.kind === "invalid_status") {
      return apiError(409, `สถานะแผนไม่สามารถส่งต่อ QA ได้ (${outcome.status})`, { at });
    }
    if (outcome.kind === "changed") {
      return apiError(409, "สถานะของแผนถูกเปลี่ยนแปลงไปแล้ว กรุณารีเฟรชหน้าจอ", { at });
    }

    audit(
      {
        action: "plan.submit_to_qa",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "plans", id: String(planId) },
        before: { status: outcome.from },
        after: { status: "QA_PENDING" },
        detail: { planNo: outcome.planNo, remarks },
      },
      auditContext(request.headers),
    );

    revalidatePlan(planId);
    return apiJson({ status: "done", planNo: outcome.planNo, from: outcome.from, to: "QA_PENDING", at });
  } catch (error) {
    return dbFailure(error, "submit plan to qa", { at });
  }
}
