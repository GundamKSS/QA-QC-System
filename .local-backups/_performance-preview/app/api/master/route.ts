import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData, apiError } from "@/lib/api/response";
import { loadMasterCounts, MASTER_NO_DATABASE } from "@/lib/master/counts";

/**
 * ข้อมูลหลัก: how many rows each master table has (`{ counts: { <slug>: { total, active } } }`) for the cards of
 * `/master`. Anyone who may open the page may read it. Without a database (demo mode) the answer is a 503 with
 * the sentence the page used to show. Reads only, so no origin check.
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "master", returnTo: "/master" });
  if ("response" in guard) return guard.response;
  try {
    const result = await loadMasterCounts();
    return result.kind === "counted" ? apiData(result.payload) : apiError(503, MASTER_NO_DATABASE);
  } catch (error) {
    return dbFailure(error, "master counts");
  }
}
