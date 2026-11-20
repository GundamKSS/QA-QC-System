import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { readQuery } from "@/lib/api/query";
import { apiData } from "@/lib/api/response";
import { parseAuditQuery } from "@/lib/audit/query";
import { loadAuditLogs } from "@/lib/audit/service";

/**
 * GET /api/admin/audit
 * Paginated, filterable Audit Log viewer API for Admin, Head QC, Head QA, and Management.
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "audit", returnTo: "/admin/audit" });
  if ("response" in guard) return guard.response;

  const query = parseAuditQuery(readQuery(request));
  try {
    const payload = await loadAuditLogs(query);
    return apiData(payload);
  } catch (error) {
    return dbFailure(error, "audit logs");
  }
}
