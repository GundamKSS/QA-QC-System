import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiError } from "@/lib/api/response";
import { getInspectionStore } from "@/lib/inspections/runtime";
import { loadWorkOrderQuota } from "@/lib/inspections/service";

/**
 * Live quota and active claims for a work order (Pool-based claiming).
 * Query parameters:
 * - workOrderId: string (required)
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "jobs", returnTo: "/jobs" });
  if ("response" in guard) return guard.response;

  const url = new URL(request.url);
  const workOrderId = url.searchParams.get("workOrderId")?.trim();
  if (!workOrderId) {
    return apiError(422, "กรุณาระบุ workOrderId");
  }

  try {
    const store = getInspectionStore();
    const quota = await loadWorkOrderQuota(store, workOrderId);
    if (!quota) {
      return apiError(404, "ไม่พบข้อมูลโควตาของใบงานนี้");
    }
    return apiData(quota);
  } catch (error) {
    return dbFailure(error, "load work order quota");
  }
}
