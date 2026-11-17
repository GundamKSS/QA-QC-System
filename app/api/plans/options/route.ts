import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { readQuery } from "@/lib/api/query";
import { apiData } from "@/lib/api/response";
import { loadOpenPlanData } from "@/lib/plans/open-data";
import { parseOpenedId } from "@/lib/plans/open-query";

/**
 * Everything the open-plan form (`/plans/new`) needs to draw: vendors, models, QC settings, today, and — for
 * `?opened=<id>` — the plan that was just opened. Same gate as opening a plan. Reads only, so no origin check.
 * Answers `OpenPlanPayload` (`lib/plans/open-data.ts`).
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "plan-open", returnTo: "/plans/new" });
  if ("response" in guard) return guard.response;
  try {
    return apiData(await loadOpenPlanData(parseOpenedId(readQuery(request))));
  } catch (error) {
    return dbFailure(error, "open plan options");
  }
}
