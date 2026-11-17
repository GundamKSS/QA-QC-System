import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiError } from "@/lib/api/response";
import { getInspectionStore } from "@/lib/inspections/runtime";
import { loadInspectionTemplate } from "@/lib/inspections/service";
import type { InspectionRole } from "@/lib/inspections/types";

/**
 * Load checklist template, items, and defect catalogs for an inspection (FR-QC-03).
 * Query parameters:
 * - planId: number (required)
 * - role: "QC" | "QA" (default: "QC")
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "jobs", returnTo: "/jobs" });
  if ("response" in guard) return guard.response;

  const url = new URL(request.url);
  const rawPlanId = url.searchParams.get("planId");
  const planId = rawPlanId ? Number(rawPlanId) : NaN;
  if (!Number.isFinite(planId) || planId <= 0) {
    return apiError(422, "กรุณาระบุ planId ให้ถูกต้อง");
  }

  const roleParam = url.searchParams.get("role");
  const role: InspectionRole = roleParam === "QA" ? "QA" : "QC";

  try {
    const store = getInspectionStore();
    const template = await loadInspectionTemplate(store, planId, role);
    if (!template) {
      return apiError(404, "ไม่พบแบบตรวจสำหรับแผนนี้");
    }
    return apiData(template);
  } catch (error) {
    return dbFailure(error, "load inspection template");
  }
}
