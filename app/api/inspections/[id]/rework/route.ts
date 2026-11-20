import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { canInspectSide } from "@/lib/auth/roles";
import { actorIdOf, NO_ACCOUNT, revalidateInspections } from "@/lib/inspections/api";
import { getInspectionStore } from "@/lib/inspections/runtime";
import type { SubmitReworkInput } from "@/lib/inspections/types";

/**
 * Screen S08: Rework Runner API (docs/02 §M06, docs/03 §BR-06).
 * GET: Load failed checklist items, previous round photos/defects, and machine info.
 * POST: Submit rework fixes, after-photos, and re-evaluation (Round 2+).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi(request, { page: "scan", returnTo: "/scan" });
  if ("response" in guard) return guard.response;

  const { id: rawId } = await context.params;
  const id = rawId?.trim();
  if (!id) return apiError(422, "กรุณาระบุ inspectionId");

  try {
    const store = getInspectionStore();
    const details = await store.getReworkDetails(id);
    if (!details) {
      return apiError(404, "ไม่พบข้อมูลการตรวจเดิมหรือรายการไม่ได้อยู่ในสถานะส่งซ่อม (Rework)");
    }
    const side = details.inspection.role === "QA" ? "QA" : "QC";
    const actorId = await actorIdOf(guard.user);
    const isAssignedInspector = Boolean(actorId && details.inspection.inspectorId === actorId);
    if (!canInspectSide(guard.user.roles, side, guard.user.programRole) && !isAssignedInspector) {
      return apiError(403, side === "QA" ? "บัญชีนี้ไม่มีสิทธิ์เข้าถึงงานซ่อมฝั่ง QA" : "บัญชีนี้ไม่มีสิทธิ์เข้าถึงงานซ่อมฝั่ง QC");
    }
    return apiData(details);
  } catch (err) {
    return dbFailure(err, "rework inspection details");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi(request, { page: "scan", returnTo: "/scan" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;

  const { id: rawId } = await context.params;
  const id = rawId?.trim();
  if (!id) return apiError(422, "กรุณาระบุ inspectionId");

  let payload: SubmitReworkInput;
  try {
    payload = (await request.json()) as SubmitReworkInput;
  } catch {
    return apiError(400, "รูปแบบข้อมูล JSON ไม่ถูกต้อง");
  }

  if (!payload.answers || typeof payload.answers !== "object" || Object.keys(payload.answers).length === 0) {
    return apiError(422, "กรุณาระบุผลการแก้ไข (answers)");
  }

  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT);

    const store = getInspectionStore();
    const details = await store.getReworkDetails(id);
    if (details) {
      const side = details.inspection.role === "QA" ? "QA" : "QC";
      const isAssignedInspector = details.inspection.inspectorId === actorId;
      if (!canInspectSide(actor.roles, side, actor.programRole) && !isAssignedInspector) {
        return apiError(403, side === "QA" ? "บัญชีนี้ไม่มีสิทธิ์บันทึกงานซ่อมฝั่ง QA" : "บัญชีนี้ไม่มีสิทธิ์บันทึกงานซ่อมฝั่ง QC");
      }
    }
    const outcome = await store.submitRework(
      {
        parentInspectionId: id,
        answers: payload.answers,
        decision: payload.decision,
      },
      actorId,
    );

    if (outcome.kind !== "saved") {
      return apiError(400, outcome.message || "ไม่สามารถบันทึกผลการ Rework ได้");
    }

    audit(
      {
        action: "unit_inspection.rework",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "unit_inspections", id: outcome.inspection.id },
        after: {
          parentInspectionId: id,
          roundNo: outcome.inspection.roundNo,
          result: outcome.inspection.result,
          action: outcome.inspection.action,
        },
      },
      auditContext(request.headers),
    );

    revalidateInspections(outcome.inspection.planId);

    return apiJson({
      status: "done",
      inspection: outcome.inspection,
      roundNo: outcome.inspection.roundNo,
      result: outcome.inspection.result,
      action: outcome.inspection.action,
    });
  } catch (err) {
    return dbFailure(err, "submit rework inspection");
  }
}
