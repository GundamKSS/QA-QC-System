import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiMessages } from "@/lib/api/messages";
import { readQuery } from "@/lib/api/query";
import { apiData, apiError } from "@/lib/api/response";
import { authPolicy } from "@/lib/config/auth";
import { loadHomeDashboard } from "@/lib/plans/home";

/**
 * The plan dashboard of the home page: totals, the most recently opened plans (`?q=` searches them) and the
 * nearest 90-day deadlines. QC Head, QA Head and Admin get everything; Purchasing, PM and Management get the
 * totals only (`recent` and `deadlines` are null); anyone else is refused, like the page which shows them a note
 * instead. Reads only, so no origin check. Answers `HomeDashboardPayload` (`lib/plans/home.ts`).
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "home", returnTo: authPolicy.homePath });
  if ("response" in guard) return guard.response;
  try {
    const result = await loadHomeDashboard(guard.user, readQuery(request));
    return result.kind === "loaded" ? apiData(result.payload) : apiError(403, apiMessages.forbidden);
  } catch (error) {
    return dbFailure(error, "home dashboard");
  }
}
