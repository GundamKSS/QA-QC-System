import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { readQuery } from "@/lib/api/query";
import { apiData, apiError, apiJson } from "@/lib/api/response";
import { audit } from "@/lib/auth/audit";
import { canAccessPage } from "@/lib/auth/page-access";
import { resolveActorId } from "@/lib/db/actor";
import { masterContext, masterWriteFailure } from "@/lib/master/api";
import { MASTER_NO_DATABASE } from "@/lib/master/counts";
import { parseMasterForm } from "@/lib/master/form";
import { masterBySlug } from "@/lib/master/registry";
import { createMaster, poolDb } from "@/lib/master/repo";
import { loadMasterTable } from "@/lib/master/table";
import { parseMasterTableQuery } from "@/lib/master/table-query";

/**
 * One master table's rows (a page, filtered by `q` / `status`) for `/master/<table>`; whoever may open the page may
 * read it, but only Master Admin also gets the row of `edit` and the options of the reference fields. Signed-out and
 * forbidden answers come first, so a stranger can't probe which tables exist. Without a database (demo mode) the answer
 * is a 503 with the sentence the page used to show. Reads only, so no origin check. Answers `MasterTablePayload` (`lib/master/table.ts`).
 */
export async function GET(request: Request, context: { params: Promise<{ table: string }> }) {
  const { table } = await context.params;
  const def = masterBySlug(table);
  const guard = await guardApi(request, { page: "master", returnTo: def ? `/master/${def.slug}` : "/master" });
  if ("response" in guard) return guard.response;
  if (!def) return apiError(404, "ไม่พบประเภทข้อมูลนี้");
  try {
    const result = await loadMasterTable(def, canAccessPage(guard.user.roles, "master-edit"), parseMasterTableQuery(readQuery(request)));
    return result.kind === "loaded" ? apiData(result.payload) : apiError(503, MASTER_NO_DATABASE);
  } catch (error) {
    return dbFailure(error, "master list");
  }
}

/** Add one master row (FR-MD-01…09). Master Admin only; audited. Answers `redirectTo` the list with `?saved=<id>`. */
export async function POST(request: Request, context: { params: Promise<{ table: string }> }) {
  const at = Date.now();
  const ctx = await masterContext(request, context);
  if ("response" in ctx) return ctx.response;
  const { def, actor, trail } = ctx;

  const parsed = parseMasterForm(def, (await readFields(request)).get);
  if (!parsed.ok) return apiError(422, "กรุณาแก้ช่องที่มีปัญหา", { fieldErrors: parsed.errors, values: parsed.values, at });

  let savedId: number;
  try {
    savedId = await createMaster(poolDb(), def, parsed.values, await resolveActorId(actor.id));
    audit({ action: "master.create", employeeCode: actor.employeeCode, userId: actor.id, entity: { type: def.table, id: String(savedId) }, after: parsed.values }, trail);
  } catch (error) {
    return masterWriteFailure(error, { values: parsed.values, at });
  }
  revalidatePath("/master");
  revalidatePath(`/master/${def.slug}`);
  return apiJson({ status: "done", redirectTo: `/master/${def.slug}?saved=${savedId}` }, 201);
}
