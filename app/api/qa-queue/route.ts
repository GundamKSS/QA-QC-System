import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiData } from "@/lib/api/response";
import { loadQaQueueData } from "@/lib/qa/queue";

/**
 * Screen S10 / QA Queue API (FR-NAV-02, docs/02).
 * Answers lots waiting for or currently undergoing QA sampling inspection.
 * Guarded by `page: "qa-queue"`, which permits QA_HEAD and QA_INSPECTOR (and dev/admin).
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "qa-queue", returnTo: "/qa-queue" });
  if ("response" in guard) return guard.response;

  try {
    const data = await loadQaQueueData();
    return apiData(data);
  } catch (error) {
    return dbFailure(error, "load QA queue");
  }
}
