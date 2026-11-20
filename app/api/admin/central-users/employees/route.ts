import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiMessages } from "@/lib/api/messages";
import { apiData, apiError } from "@/lib/api/response";
import { canManageLocalUsers } from "@/lib/auth/local-admin";
import { dbConfigured } from "@/lib/db/config";
import { searchDatacenterEmployees } from "@/lib/db/central-users";

/**
 * Searches `[DATA_CENTER].[dbo].[Employee]` by employee code, name, or email
 * so Admin/Dev can pick an employee and grant QCheck access (`ProgramID = 3`).
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "users", returnTo: "/admin/users" });
  if ("response" in guard) return guard.response;
  if (!canManageLocalUsers(guard.user.roles, guard.user.programRole)) {
    return apiError(403, apiMessages.forbidden);
  }
  if (!dbConfigured()) {
    return apiData({ employees: [] });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return apiData({ employees: [] });
  }

  try {
    return apiData(await searchDatacenterEmployees(q, 15));
  } catch (error) {
    return dbFailure(error, "datacenter employee search");
  }
}
