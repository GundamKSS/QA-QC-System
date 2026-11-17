import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { apiError, apiJson } from "@/lib/api/response";
import { audit } from "@/lib/auth/audit";
import { resolveActorId } from "@/lib/db/actor";
import { masterContext, masterWriteFailure, rowIdOf } from "@/lib/master/api";
import { getMaster, poolDb, setMasterActive } from "@/lib/master/repo";

/** Disable / enable instead of delete (FR-MD-13): `active` is "1"/"true" to enable, anything else disables. */
export async function POST(request: Request, context: { params: Promise<{ table: string; id: string }> }) {
  const ctx = await masterContext(request, context);
  if ("response" in ctx) return ctx.response;
  const { def, actor, trail } = ctx;
  const id = rowIdOf((await context.params).id);
  if (id === null) return apiError(404, "ไม่พบรายการนี้");
  const active = ["1", "true"].includes((await readFields(request)).text("active"));

  try {
    const db = poolDb();
    const row = await getMaster(db, def, id);
    if (!row) return apiError(404, "ไม่พบรายการนี้");
    await setMasterActive(db, def, id, active, await resolveActorId(actor.id));
    audit(
      { action: active ? "master.enable" : "master.disable", employeeCode: actor.employeeCode, userId: actor.id, entity: { type: def.table, id: String(id) }, before: { is_active: row.isActive }, after: { is_active: active } },
      trail,
    );
  } catch (error) {
    return masterWriteFailure(error);
  }
  revalidatePath("/master");
  revalidatePath(`/master/${def.slug}`);
  return apiJson({ status: "done" });
}
