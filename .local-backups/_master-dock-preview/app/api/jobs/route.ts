import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData } from "@/lib/api/response";
import { loadJobs } from "@/lib/plans/jobs";

/**
 * "งานของฉัน" (FR-JOB-03/04): the work orders of the signed-in QC Head / QC Inspector. `?view=mine` narrows a
 * QC Head to their own; anyone else always gets their own, whatever the query says. Reads only, so no origin
 * check. Answers `JobsPayload` (`lib/plans/jobs.ts`); other query values (the page's `notification`) are ignored.
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "jobs", returnTo: "/jobs" });
  if ("response" in guard) return guard.response;
  try {
    return apiData(await loadJobs(guard.user, new URL(request.url).searchParams.get("view")));
  } catch (error) {
    return dbFailure(error, "jobs");
  }
}
