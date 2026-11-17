import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData } from "@/lib/api/response";
import { loadReportsList } from "@/lib/reports/inspection-report";

/**
 * Global quality inspection reports index (Screen S15 list / docs/02 FR-RPT-08).
 * Provides searchable and filterable list of plans with inspection metrics.
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "reports", returnTo: "/reports" });
  if ("response" in guard) return guard.response;

  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const vendorIdStr = url.searchParams.get("vendorId");
    const modelIdStr = url.searchParams.get("modelId");

    const vendorId = vendorIdStr ? Number(vendorIdStr) : undefined;
    const modelId = modelIdStr ? Number(modelIdStr) : undefined;

    const data = await loadReportsList({
      q,
      status,
      vendorId: Number.isFinite(vendorId) ? vendorId : undefined,
      modelId: Number.isFinite(modelId) ? modelId : undefined,
    });

    return apiData(data);
  } catch (error) {
    return dbFailure(error, "reports list");
  }
}
