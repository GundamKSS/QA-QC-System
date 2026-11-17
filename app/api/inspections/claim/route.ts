import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { actorIdOf, NO_ACCOUNT, revalidateInspections } from "@/lib/inspections/api";
import { getInspectionStore } from "@/lib/inspections/runtime";
import { claimUnitInspection } from "@/lib/inspections/service";
import type { EntryMode, InspectionRole, SerialEntryMode } from "@/lib/inspections/types";

/**
 * Claim and lock a unit for inspection (Pool-based claiming).
 * Deducts 1 unit from the live work-order quota and prevents other inspectors from inspecting the same serial.
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, { page: "scan", returnTo: "/scan" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;

  const fields = await readFields(request);
  const planId = Number(fields.get("planId"));
  const workOrderId = fields.text("workOrderId").trim();
  const serialPump = fields.text("serialPump").trim();

  if (!Number.isFinite(planId) || planId <= 0) {
    return apiError(422, "กรุณาระบุ planId ให้ถูกต้อง");
  }
  if (!workOrderId) {
    return apiError(422, "กรุณาระบุ workOrderId");
  }
  if (!serialPump) {
    return apiError(422, "กรุณาระบุหมายเลขซีเรียล (Serial Pump)");
  }

  const roleParam = fields.get("role");
  const role: InspectionRole = roleParam === "QA" ? "QA" : "QC";
  const serialMotor = fields.get("serialMotor")?.trim() || null;
  const serialSupplier = fields.get("serialSupplier")?.trim() || null;
  const serialEntryMode = (fields.get("serialEntryMode") as SerialEntryMode) || "MANUAL";
  const entryMode = (fields.get("entryMode") as EntryMode) || "LIVE";
  const inspectionId = fields.get("inspectionId")?.trim() || undefined;
  const existingSerials = fields.all("existingSerials");

  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT);

    const store = getInspectionStore();
    const outcome = await claimUnitInspection(
      store,
      {
        planId,
        workOrderId,
        role,
        serialPump,
        serialMotor,
        serialSupplier,
        serialEntryMode,
        entryMode,
        inspectionId,
        existingSerials,
      },
      {
        actorId,
        actorName: actor.fullName || actor.employeeCode,
      },
    );

    if (outcome.kind === "invalid_serial") {
      return apiError(422, outcome.message);
    }
    if (outcome.kind === "already_completed") {
      return apiError(409, outcome.message);
    }
    if (outcome.kind === "claimed_by_other") {
      return apiError(409, outcome.message, { inspectorName: outcome.inspectorName });
    }
    if (outcome.kind === "quota_full") {
      return apiError(409, outcome.message, { quota: outcome.quota });
    }
    if (outcome.kind === "not_found") {
      return apiError(404, outcome.message);
    }

    if (outcome.kind === "claimed") {
      audit(
        {
          action: "unit_inspection.claim",
          employeeCode: actor.employeeCode,
          userId: actor.id,
          entity: { type: "unit_inspections", id: outcome.inspection.id },
          after: {
            planId,
            workOrderId,
            serialPump: outcome.inspection.serialPump,
            inspectionNo: outcome.inspection.inspectionNo,
          },
        },
        auditContext(request.headers),
      );
      revalidateInspections(planId);
    }

    return apiJson({
      status: "claimed",
      inspection: outcome.inspection,
      quota: outcome.quota,
      resumed: outcome.kind === "resumed",
    });
  } catch (error) {
    return dbFailure(error, "claim unit inspection");
  }
}
