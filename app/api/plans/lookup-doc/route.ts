import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiJson } from "@/lib/api/response";
import { getPlanStore } from "@/lib/plans/runtime";
import { lookupReceiptDoc } from "@/lib/plans/service";

/**
 * Does this Invoice/PO already exist (BR-01)? `?docType=INVOICE|PO&docNo=…`; the open-plan form asks when the
 * number field loses focus (K3). Answers `{ status: "done", result: DocLookup }`; reads only, so no origin check.
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "plan-open", returnTo: "/plans/new" });
  if ("response" in guard) return guard.response;
  const query = new URL(request.url).searchParams;
  try {
    const result = await lookupReceiptDoc(getPlanStore(), { docType: query.get("docType") ?? "", docNo: (query.get("docNo") ?? "").slice(0, 200) });
    return apiJson({ status: "done", result });
  } catch (error) {
    return dbFailure(error, "lookup receipt doc");
  }
}
