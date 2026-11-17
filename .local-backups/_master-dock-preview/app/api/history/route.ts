import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { readQuery } from "@/lib/api/query";
import { apiData } from "@/lib/api/response";
import { loadHistory } from "@/lib/plans/history";

/**
 * ประวัติ (docs/18): `?kind=done|cancelled&range=90|all&view=mine&page=2`, read by `parseHistoryQuery` like the page it
 * replaces (unknown values fall back to the defaults). QC Head and QA Head see everyone's unless `view=mine`; anyone else
 * always gets their own. Reads only, so no origin check. Answers `HistoryPayload` (`lib/plans/history.ts`).
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "history", returnTo: "/history" });
  if ("response" in guard) return guard.response;
  try {
    return apiData(await loadHistory(guard.user, readQuery(request)));
  } catch (error) {
    return dbFailure(error, "history");
  }
}
