import { revalidatePath } from "next/cache";
import { readFields } from "@/lib/api/body";
import { apiError, apiJson } from "@/lib/api/response";
import { audit } from "@/lib/auth/audit";
import { resolveActorId } from "@/lib/db/actor";
import { masterContext, masterWriteFailure, rowIdOf } from "@/lib/master/api";
import { parseMasterForm } from "@/lib/master/form";
import { getMaster, poolDb, updateMaster } from "@/lib/master/repo";

/** Change one master row (FR-MD-01…09). Master Admin only; the audit row keeps before → after. */
export async function PATCH(request: Request, context: { params: Promise<{ table: string; id: string }> }) {
  const at = Date.now();
  const ctx = await masterContext(request, context);
  if ("response" in ctx) return ctx.response;
  const { def, actor, trail } = ctx;
  const id = rowIdOf((await context.params).id);
  if (id === null) return apiError(404, "ไม่พบรายการนี้", { at });

  const parsed = parseMasterForm(def, (await readFields(request)).get);
  if (!parsed.ok) return apiError(422, "กรุณาแก้ช่องที่มีปัญหา", { fieldErrors: parsed.errors, values: parsed.values, at });

  try {
    const db = poolDb();
    const before = await getMaster(db, def, id);
    if (!before) return apiError(404, "ไม่พบรายการนี้ (อาจถูกเปลี่ยนไปแล้ว)", { values: parsed.values, at });
    await updateMaster(db, def, id, parsed.values, await resolveActorId(actor.id));
    audit({ action: "master.update", employeeCode: actor.employeeCode, userId: actor.id, entity: { type: def.table, id: String(id) }, before: before.values, after: parsed.values }, trail);
  } catch (error) {
    return masterWriteFailure(error, { values: parsed.values, at });
  }
  revalidatePath("/master");
  revalidatePath(`/master/${def.slug}`);
  return apiJson({ status: "done", redirectTo: `/master/${def.slug}?saved=${id}` });
}
