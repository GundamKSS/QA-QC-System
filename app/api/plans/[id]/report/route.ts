import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiError } from "@/lib/api/response";
import { PLAN_NOT_FOUND, planIdOf } from "@/lib/plans/api";
import { loadInspectionReport } from "@/lib/reports/inspection-report";

/**
 * Official QC/QA Inspection Report data for a plan (Screen S15 / docs/02 FR-RPT-01..08).
 * Provides certificate data, QC/QA summaries, defect statistics, photos, and digital sign-offs.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const planId = planIdOf((await context.params).id);
  const guard = await guardApi(request, {
    page: "reports",
    returnTo: planId ? `/plans/${planId}/report` : "/reports",
  });
  if ("response" in guard) return guard.response;
  if (planId === null) return apiError(404, PLAN_NOT_FOUND);

  try {
    const report = await loadInspectionReport(planId);
    if (!report) return apiError(404, PLAN_NOT_FOUND);

    return apiData(report);
  } catch (error) {
    return dbFailure(error, "inspection report data");
  }
}
