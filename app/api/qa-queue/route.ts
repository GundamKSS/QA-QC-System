import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { isValidAqlLevel } from "@/lib/qa/aql";
import {
  acceptQaPlan,
  assignQaInspectors,
  confirmQaPlan,
  loadQaQueueData,
  returnQaUnitToQc,
  updatePlanAndModelAql,
} from "@/lib/qa/queue";

/**
 * Screen S10 / QA Queue API (FR-NAV-02, docs/02).
 * Answers lots waiting for or currently undergoing QA sampling inspection,
 * along with QA inspectors list and the signed-in user's identity.
 * Guarded by `page: "qa-queue"`, which permits QA_HEAD and QA_INSPECTOR.
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "qa-queue", returnTo: "/qa-queue" });
  if ("response" in guard) return guard.response;
  const { user } = guard;

  try {
    const me = dbConfigured() ? await resolveActorId(user.id) : user.id;
    const isHead = user.roles.includes("QA_HEAD") || user.roles.includes("ADMIN");
    const data = await loadQaQueueData({ me, isHead });
    return apiData(data);
  } catch (error) {
    return dbFailure(error, "load QA queue");
  }
}

/**
 * Handles QA workflow actions:
 * - `action = "set_aql"` (or default when `aqlLevel` is present): sets/updates AQL level for plan & model
 * - `action = "accept"`: Head QA accepts the handed-over plan from QC (`QA_PENDING` -> `QA_IN_PROGRESS`)
 * - `action = "assign"`: Head QA assigns QA inspectors + target quantities to `<plan_no>-QA`
 * - `action = "confirm"`: Head QA confirms/signs off QA inspection results (`QA_IN_PROGRESS` -> `COMPLETED`)
 * - `action = "return_to_qc"`: Marks a failed unit for QC rework (`action = 'REWORK'`)
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, { page: "qa-queue", returnTo: "/qa-queue" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;
  const isHead = actor.roles.includes("QA_HEAD") || actor.roles.includes("ADMIN");
  const actorName = actor.fullName || actor.employeeCode;

  const fields = await readFields(request);
  const action = fields.text("action").trim() || "set_aql";

  try {
    const actorId = dbConfigured() ? await resolveActorId(actor.id) : actor.id;

    // 1. Accept Plan from QC
    if (action === "accept") {
      if (!isHead) {
        return apiError(403, "เฉพาะหัวหน้า QA (Head QA) เท่านั้นที่มีสิทธิ์กดรับงาน");
      }
      const planId = Number(fields.get("planId"));
      if (!Number.isFinite(planId) || planId <= 0) {
        return apiError(422, "กรุณาระบุรหัสแผนตรวจ (planId)");
      }
      const outcome = await acceptQaPlan({ planId, actorId, actorName });
      if (outcome.kind === "not_found") return apiError(404, "ไม่พบแผนตรวจที่ระบุ");
      if (outcome.kind === "invalid_status") {
        return apiError(409, `สถานะแผนไม่สามารถกดรับงานได้ (${outcome.status})`);
      }

      audit(
        {
          action: "qa.accept_plan",
          employeeCode: actor.employeeCode,
          userId: actor.id,
          entity: { type: "plans", id: String(planId) },
          after: { status: "QA_IN_PROGRESS" },
          detail: { planNo: outcome.planNo, qaWorkOrderNo: outcome.qaWorkOrderNo },
        },
        auditContext(request.headers),
      );

      revalidatePath("/qa-queue");
      revalidatePath(`/plans/${planId}`);
      return apiJson({
        status: "done",
        planId: outcome.planId,
        planNo: outcome.planNo,
        qaWorkOrderId: outcome.qaWorkOrderId,
        qaWorkOrderNo: outcome.qaWorkOrderNo,
      });
    }

    // 2. Assign QA Inspectors
    if (action === "assign") {
      if (!isHead) {
        return apiError(403, "เฉพาะหัวหน้า QA (Head QA) เท่านั้นที่มีสิทธิ์จ่ายงาน");
      }
      const planId = Number(fields.get("planId"));
      if (!Number.isFinite(planId) || planId <= 0) {
        return apiError(422, "กรุณาระบุรหัสแผนตรวจ (planId)");
      }

      let assignees: { userId: string; targetQty: number | null }[] = [];
      const rawJson = fields.get("assigneesJson");
      const listIds = fields.all("assigneeIds");
      if (rawJson) {
        try {
          const parsed = JSON.parse(rawJson);
          if (Array.isArray(parsed)) {
            assignees = parsed.map((item) => ({
              userId: String(item.userId ?? "").trim(),
              targetQty:
                item.targetQty !== null && item.targetQty !== undefined && item.targetQty !== ""
                  ? Number(item.targetQty)
                  : null,
            }));
          }
        } catch {
          return apiError(422, "รูปแบบข้อมูลผู้ตรวจไม่ถูกต้อง");
        }
      } else if (listIds.length > 0) {
        assignees = listIds.map((id) => ({
          userId: id.trim(),
          targetQty: null,
        }));
      } else {
        for (let i = 1; i <= 5; i++) {
          const uid = fields.get(`assignee${i}`)?.trim();
          const qtyRaw = fields.get(`assigneeQty${i}`)?.trim();
          if (uid) {
            assignees.push({
              userId: uid,
              targetQty: qtyRaw ? Number(qtyRaw) : null,
            });
          }
        }
      }

      const outcome = await assignQaInspectors({
        planId,
        assignees,
        actorId,
        actorName,
      });

      if (outcome.kind === "not_found") return apiError(404, "ไม่พบแผนตรวจที่ระบุ");
      if (outcome.kind === "missing_aql") {
        return apiError(422, "กรุณาตั้งค่าระดับ AQL ให้โมเดลนี้ก่อนจ่ายงาน");
      }
      if (outcome.kind === "invalid_assignees") {
        return apiError(422, outcome.message);
      }

      audit(
        {
          action: "qa.assign_inspectors",
          employeeCode: actor.employeeCode,
          userId: actor.id,
          entity: { type: "work_orders", id: outcome.qaWorkOrderId },
          after: { assignees: outcome.assigneeIds },
          detail: { planNo: outcome.planNo, woNo: outcome.qaWorkOrderNo },
        },
        auditContext(request.headers),
      );

      revalidatePath("/qa-queue");
      revalidatePath(`/plans/${planId}`);
      return apiJson({
        status: "done",
        planId: outcome.planId,
        planNo: outcome.planNo,
        qaWorkOrderId: outcome.qaWorkOrderId,
        qaWorkOrderNo: outcome.qaWorkOrderNo,
        assigneeIds: outcome.assigneeIds,
      });
    }

    // 3. Confirm QA Plan Completion (Sign-off)
    if (action === "confirm") {
      if (!isHead) {
        return apiError(403, "เฉพาะหัวหน้า QA (Head QA) เท่านั้นที่มีสิทธิ์ยืนยันผลการตรวจและปิดแผน");
      }
      const planId = Number(fields.get("planId"));
      const remarks = fields.get("remarks")?.trim() || null;
      if (!Number.isFinite(planId) || planId <= 0) {
        return apiError(422, "กรุณาระบุรหัสแผนตรวจ (planId)");
      }

      const outcome = await confirmQaPlan({ planId, remarks, actorId, actorName });
      if (outcome.kind === "not_found") return apiError(404, "ไม่พบแผนตรวจที่ระบุ");
      if (outcome.kind === "quota_not_met") {
        return apiError(
          422,
          `ยังสุ่มตรวจไม่ครบตามเกณฑ์ AQL (ตรวจแล้ว ${outcome.qaDone}/${outcome.qaRequired} เครื่อง)`,
        );
      }
      if (outcome.kind === "rework_pending") {
        return apiError(
          422,
          `ยังมีเครื่องรอแก้ไข (Rework) ค้างอยู่ ${outcome.reworkCount} เครื่อง กรุณาตรวจซ้ำให้ผ่านก่อนยืนยันปิดแผน`,
        );
      }
      if (outcome.kind === "invalid_status") {
        return apiError(409, `สถานะแผนไม่สามารถยืนยันปิดงานได้ (${outcome.status})`);
      }

      audit(
        {
          action: "qa.confirm_plan",
          employeeCode: actor.employeeCode,
          userId: actor.id,
          entity: { type: "plans", id: String(planId) },
          after: { status: "COMPLETED" },
          detail: {
            planNo: outcome.planNo,
            qaDoneTotal: outcome.qaDoneTotal,
            qaRequired: outcome.qaRequired,
            remarks,
          },
        },
        auditContext(request.headers),
      );

      revalidatePath("/qa-queue");
      revalidatePath(`/plans/${planId}`);
      revalidatePath("/plans");
      return apiJson({
        status: "done",
        planId: outcome.planId,
        planNo: outcome.planNo,
        qaDoneTotal: outcome.qaDoneTotal,
        qaRequired: outcome.qaRequired,
      });
    }

    // 4. Return Failed Unit to QC for Targeted Rework
    if (action === "return_to_qc") {
      const inspectionId = fields.text("inspectionId").trim();
      const qcInspectorId = fields.get("qcInspectorId")?.trim() || null;
      if (!inspectionId) {
        return apiError(422, "กรุณาระบุรหัสการตรวจของเครื่อง (inspectionId)");
      }
      const outcome = await returnQaUnitToQc({
        inspectionId,
        qcInspectorId,
        actorId,
        actorName,
      });
      if (outcome.kind === "not_found") {
        return apiError(404, "ไม่พบรายการตรวจของเครื่องที่ระบุ");
      }

      audit(
        {
          action: "qa.return_unit_to_qc",
          employeeCode: actor.employeeCode,
          userId: actor.id,
          entity: { type: "unit_inspections", id: outcome.inspectionId },
          after: { action: "REWORK", qcInspectorId },
          detail: { planNo: outcome.planNo, serialPump: outcome.serialPump },
        },
        auditContext(request.headers),
      );

      revalidatePath("/qa-queue");
      revalidatePath(`/plans/${outcome.planId}`);
      revalidatePath("/jobs");
      return apiJson({
        status: "done",
        inspectionId: outcome.inspectionId,
        serialPump: outcome.serialPump,
        planId: outcome.planId,
      });
    }

    // 5. Default: Set / Update AQL Level
    const planId = Number(fields.get("planId"));
    const aqlLevel = fields.text("aqlLevel").trim().toUpperCase();
    const saveAsModelDefault =
      fields.get("saveAsModelDefault") !== "false" && fields.get("saveAsModelDefault") !== "0";

    if (!Number.isFinite(planId) || planId <= 0) {
      return apiError(422, "กรุณาระบุรหัสแผนตรวจ (planId)");
    }
    if (!isValidAqlLevel(aqlLevel)) {
      return apiError(422, "กรุณาเลือกระดับ AQL ที่ถูกต้อง (REDUCED, NORMAL, หรือ TIGHTENED)");
    }

    const outcome = await updatePlanAndModelAql({
      planId,
      aqlLevel,
      saveAsModelDefault,
      actorId,
    });

    if (outcome.kind === "not_found") {
      return apiError(404, "ไม่พบแผนตรวจที่ระบุ");
    }
    if (outcome.kind === "invalid_level") {
      return apiError(422, "ไม่สามารถคำนวณจำนวนสุ่มตรวจจากระดับ AQL นี้ได้");
    }

    audit(
      {
        action: "qa.set_aql_level",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "plans", id: String(planId) },
        after: {
          aqlLevel: outcome.aqlLevel,
          qaRequired: outcome.qaRequired,
          qaWorkOrderNo: outcome.qaWorkOrderNo,
          saveAsModelDefault,
        },
        detail: {
          planNo: outcome.planNo,
          modelCode: outcome.modelCode,
          codeLetter: outcome.codeLetter,
        },
      },
      auditContext(request.headers),
    );

    revalidatePath("/qa-queue");
    revalidatePath(`/plans/${planId}`);
    revalidatePath("/master/models");

    return apiJson({
      status: "done",
      planId: outcome.planId,
      planNo: outcome.planNo,
      modelId: outcome.modelId,
      modelCode: outcome.modelCode,
      aqlLevel: outcome.aqlLevel,
      aqlLevelLabel: outcome.aqlLevelLabel,
      codeLetter: outcome.codeLetter,
      qaRequired: outcome.qaRequired,
      qaWorkOrderId: outcome.qaWorkOrderId,
      qaWorkOrderNo: outcome.qaWorkOrderNo,
    });
  } catch (error) {
    return dbFailure(error, "QA queue action");
  }
}
