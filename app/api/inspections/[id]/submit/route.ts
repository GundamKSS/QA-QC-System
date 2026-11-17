import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { actorIdOf, NO_ACCOUNT, revalidateInspections } from "@/lib/inspections/api";
import { getInspectionStore } from "@/lib/inspections/runtime";
import { submitUnitInspection } from "@/lib/inspections/service";
import type { InspectionRole, ItemAnswer, UnitAction } from "@/lib/inspections/types";

/**
 * Submit completed inspection answers, evaluate result (BR-04), and record outcomes.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi(request, { page: "scan", returnTo: "/scan" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;

  const { id: rawId } = await context.params;
  const inspectionId = rawId?.trim();
  if (!inspectionId) {
    return apiError(422, "กรุณาระบุ inspectionId");
  }

  // Support both JSON body and FormData
  const contentType = request.headers.get("content-type") ?? "";
  let payload: Record<string, unknown> = {};

  if (contentType.includes("application/json")) {
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return apiError(400, "รูปแบบข้อมูล JSON ไม่ถูกต้อง");
    }
  } else {
    const fields = await readFields(request);
    payload.planId = fields.get("planId");
    payload.workOrderId = fields.get("workOrderId");
    payload.role = fields.get("role");
    payload.decision = fields.get("decision");
    const rawAnswers = fields.get("answers");
    if (rawAnswers) {
      try {
        payload.answers = JSON.parse(rawAnswers);
      } catch {
        payload.answers = {};
      }
    }
  }

  const planId = Number(payload.planId);
  const workOrderId = String(payload.workOrderId ?? "").trim();
  if (!Number.isFinite(planId) || planId <= 0) {
    return apiError(422, "กรุณาระบุ planId ให้ถูกต้อง");
  }
  if (!workOrderId) {
    return apiError(422, "กรุณาระบุ workOrderId");
  }

  const role: InspectionRole = payload.role === "QA" ? "QA" : "QC";
  const answers = (payload.answers && typeof payload.answers === "object"
    ? payload.answers
    : {}) as Record<number, ItemAnswer>;
  const decision = (payload.decision as UnitAction) || null;

  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT);

    const store = getInspectionStore();
    const outcome = await submitUnitInspection(
      store,
      {
        inspectionId,
        workOrderId,
        planId,
        role,
        answers,
        decision,
      },
      {
        actorId,
        actorName: actor.fullName || actor.employeeCode,
      },
    );

    if (outcome.kind === "incomplete") {
      return apiError(422, outcome.message, { missingItemIds: outcome.missingItemIds });
    }
    if (outcome.kind === "decision_required") {
      return apiError(422, outcome.message);
    }
    if (outcome.kind === "forced_reject") {
      return apiError(422, outcome.message);
    }
    if (outcome.kind === "not_found") {
      return apiError(404, outcome.message);
    }
    if (outcome.kind === "not_in_progress") {
      return apiError(409, outcome.message);
    }

    audit(
      {
        action: "unit_inspection.submit",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "unit_inspections", id: inspectionId },
        after: {
          planId,
          workOrderId,
          result: outcome.evaluation.result,
          action: outcome.inspection.action,
          qtyDone: outcome.qtyDone,
          qtyNeed: outcome.qtyNeed,
        },
      },
      auditContext(request.headers),
    );

    revalidateInspections(planId);

    return apiJson({
      status: "done",
      inspection: outcome.inspection,
      evaluation: outcome.evaluation,
      qtyDone: outcome.qtyDone,
      qtyNeed: outcome.qtyNeed,
    });
  } catch (error) {
    return dbFailure(error, "submit unit inspection");
  }
}
