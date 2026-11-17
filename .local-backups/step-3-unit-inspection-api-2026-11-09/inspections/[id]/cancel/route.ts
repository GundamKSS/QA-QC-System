import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { actorIdOf, NO_ACCOUNT, revalidateInspections } from "@/lib/inspections/api";
import { getInspectionStore } from "@/lib/inspections/runtime";
import { cancelUnitClaim } from "@/lib/inspections/service";

/**
 * Cancel and release an in-progress unit claim, returning the quota to the pool.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi(request, { page: "jobs", returnTo: "/jobs" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;

  const { id: rawId } = await context.params;
  const inspectionId = rawId?.trim();
  if (!inspectionId) {
    return apiError(422, "กรุณาระบุ inspectionId");
  }

  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT);

    const store = getInspectionStore();
    const success = await cancelUnitClaim(
      store,
      inspectionId,
      {
        actorId,
        actorName: actor.fullName || actor.employeeCode,
      },
    );

    if (!success) {
      return apiError(404, "ไม่พบรายการตรวจที่จองไว้ หรือไม่มีสิทธิ์ยกเลิก (ไม่ใช่ผู้จอง)");
    }

    audit(
      {
        action: "unit_inspection.cancel_claim",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "unit_inspections", id: inspectionId },
      },
      auditContext(request.headers),
    );

    revalidateInspections();
    return apiJson({ status: "cancelled", message: "ยกเลิกการจองสำเร็จ" });
  } catch (error) {
    return dbFailure(error, "cancel unit claim");
  }
}
