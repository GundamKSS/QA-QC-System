import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiMessages } from "@/lib/api/messages";
import { readQuery } from "@/lib/api/query";
import { apiData, apiError } from "@/lib/api/response";
import { authPolicy } from "@/lib/config/auth";
import { loadInspectorDashboard } from "@/lib/inspections/inspector-dashboard";

/**
 * Dedicated dashboard endpoint for QC Inspector (and QA Inspector) on /home:
 * provides monthly performance, urgent pending counts (reworks, in-progress, not started)
 * and quick-action cards for frontline floor workers.
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "home", returnTo: authPolicy.homePath });
  if ("response" in guard) return guard.response;
  try {
    const query = readQuery(request);
    const month = typeof query.month === "string" ? query.month : null;
    const result = await loadInspectorDashboard(guard.user, month);
    return result.kind === "loaded" ? apiData(result.payload) : apiError(403, apiMessages.forbidden);
  } catch (error) {
    return dbFailure(error, "inspector dashboard");
  }
}
