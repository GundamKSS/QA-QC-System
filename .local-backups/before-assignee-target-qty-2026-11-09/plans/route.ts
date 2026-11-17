import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { readQuery } from "@/lib/api/query";
import { apiData, apiError, apiJson } from "@/lib/api/response";
import { audit, auditContext } from "@/lib/auth/audit";
import { actorIdOf, NO_ACCOUNT } from "@/lib/plans/api";
import { fieldErrorMessage, parseOpenPlanForm } from "@/lib/plans/form";
import { loadPlanList } from "@/lib/plans/list";
import { getPlanStore } from "@/lib/plans/runtime";
import { openPlan, type OpenPlanField } from "@/lib/plans/service";

/**
 * รายการแผนตรวจ (docs/15 §2): one page of plans. `?q=&status=&vendor=&ptype=&from=&to=&sort=&page=` is read by
 * `parsePlanListQuery` like the page it replaces (unknown values fall back to "no filter"). QC Head, QA Head and
 * Admin, like the page. Reads only, so no origin check. Answers `PlanListPayload` (`lib/plans/list.ts`).
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "plans", returnTo: "/plans" });
  if ("response" in guard) return guard.response;
  try {
    return apiData(await loadPlanList(readQuery(request)));
  } catch (error) {
    return dbFailure(error, "plan list");
  }
}

/**
 * Open an inspection plan (FR-PLAN-01…06). QC Head, QA Head and Admin only (A11); audited. A duplicate
 * Invoice/PO + Model (BR-01) is a `409` with `status: "duplicate"` and a link to the plan that exists.
 * Success answers `redirectTo` the same page with `?opened=<id>` (K4, docs/14).
 */
export async function POST(request: Request) {
  const at = Date.now();
  const guard = await guardApi(request, { page: "plan-open", returnTo: "/plans/new" });
  if ("response" in guard) return guard.response;
  const { user: actor } = guard;
  const { input, values } = parseOpenPlanForm((await readFields(request)).get);

  let planId: number;
  try {
    // Office users' session id is their employee code; plans need the users.id synced at login.
    const actorId = await actorIdOf(actor);
    if (!actorId) return apiError(403, NO_ACCOUNT, { values, at });

    const result = await openPlan(getPlanStore(), input, { actorId });
    if (result.kind === "invalid") {
      const fieldErrors = Object.fromEntries(
        Object.entries(result.errors).map(([field, error]) => [field, fieldErrorMessage(field as OpenPlanField, error!)]),
      );
      return apiError(422, "กรุณาแก้ช่องที่มีปัญหา", { fieldErrors, values, at });
    }
    if (result.kind === "duplicate") return apiJson({ status: "duplicate", planId: result.planId, planNo: result.planNo, values, at }, 409);

    planId = result.planId;
    audit(
      {
        action: "plan.open",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "plans", id: String(result.planId) },
        after: {
          planNo: result.planNo, docType: input.docType, docNo: input.docNo, productionWoNo: result.productionWoNo, vendorId: input.vendorId,
          modelId: input.modelId, lotQty: input.lotQty, qcRequired: result.qcRequired,
        },
        detail: { headerReused: result.headerReused },
      },
      auditContext(request.headers),
    );
  } catch (error) {
    return dbFailure(error, "open plan", { values, at });
  }
  revalidatePath("/plans");
  revalidatePath("/home");
  // K4 (docs/14): back to the form with a success bar and "open the next Model of this Invoice".
  return apiJson({ status: "done", redirectTo: `/plans/new?opened=${planId}` }, 201);
}
