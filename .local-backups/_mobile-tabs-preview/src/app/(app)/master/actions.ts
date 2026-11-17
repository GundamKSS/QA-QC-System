"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit, auditContext } from "@/lib/auth/audit";
import { requirePageAccess } from "@/lib/auth/dal";
import { resolveActorId } from "@/lib/db/actor";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { parseMasterForm, type MasterValues } from "@/lib/master/form";
import { masterBySlug } from "@/lib/master/registry";
import { createMaster, getMaster, masterWriteProblem, poolDb, setMasterActive, updateMaster } from "@/lib/master/repo";

export type MasterFormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string>; values?: MasterValues; at: number };

export type ToggleState = { status: "idle" } | { status: "error"; message: string } | { status: "done" };

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};
const idOf = (raw: string) => (/^\d{1,9}$/.test(raw) ? Number(raw) : null);

/** Database failures become a sentence on the form; anything else (bugs, redirects) propagates. */
function writeError(error: unknown): string {
  const problem = masterWriteProblem(error);
  if (problem === "duplicate") return "มีรายการนี้อยู่แล้ว — ค่าที่ห้ามซ้ำ (เช่น รหัสหรือชื่อ) ซ้ำกับรายการอื่น";
  if (problem === "invalid") return "ข้อมูลไม่ผ่านเงื่อนไขของฐานข้อมูล (เช่น ค่าอ้างอิงไม่มีอยู่)";
  if (isDbError(error)) return dbProblemMessages[dbProblem(error)];
  throw error;
}

/** Create or update one master row (FR-MD-01…09). Only Master Admin; every change is audited with before → after. */
export async function saveMasterAction(_: MasterFormState, formData: FormData): Promise<MasterFormState> {
  const at = Date.now();
  const def = masterBySlug(text(formData, "slug"));
  if (!def) return { status: "error", message: "ไม่พบประเภทข้อมูลนี้", at };
  const actor = await requirePageAccess("master-edit", `/master/${def.slug}`);

  const parsed = parseMasterForm(def, (key) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) return { status: "error", message: "กรุณาแก้ช่องที่มีปัญหา", fieldErrors: parsed.errors, values: parsed.values, at };

  const id = idOf(text(formData, "id"));
  const db = poolDb();
  let savedId: number;
  try {
    const by = await resolveActorId(actor.id);
    const request = auditContext(await headers());
    if (id !== null) {
      const before = await getMaster(db, def, id);
      if (!before) return { status: "error", message: "ไม่พบรายการนี้ (อาจถูกเปลี่ยนไปแล้ว)", values: parsed.values, at };
      await updateMaster(db, def, id, parsed.values, by);
      audit({ action: "master.update", employeeCode: actor.employeeCode, userId: actor.id, entity: { type: def.table, id: String(id) }, before: before.values, after: parsed.values }, request);
      savedId = id;
    } else {
      savedId = await createMaster(db, def, parsed.values, by);
      audit({ action: "master.create", employeeCode: actor.employeeCode, userId: actor.id, entity: { type: def.table, id: String(savedId) }, after: parsed.values }, request);
    }
  } catch (error) {
    return { status: "error", message: writeError(error), values: parsed.values, at };
  }
  revalidatePath("/master");
  revalidatePath(`/master/${def.slug}`);
  redirect(`/master/${def.slug}?saved=${savedId}`);
}

/** Disable / enable instead of delete (FR-MD-13). */
export async function setMasterActiveAction(_: ToggleState, formData: FormData): Promise<ToggleState> {
  const def = masterBySlug(text(formData, "slug"));
  const id = idOf(text(formData, "id"));
  if (!def || id === null) return { status: "error", message: "ไม่พบรายการนี้" };
  const actor = await requirePageAccess("master-edit", `/master/${def.slug}`);
  const active = text(formData, "active") === "1";
  try {
    const db = poolDb();
    const row = await getMaster(db, def, id);
    if (!row) return { status: "error", message: "ไม่พบรายการนี้" };
    await setMasterActive(db, def, id, active, await resolveActorId(actor.id));
    audit(
      { action: active ? "master.enable" : "master.disable", employeeCode: actor.employeeCode, userId: actor.id, entity: { type: def.table, id: String(id) }, before: { is_active: row.isActive }, after: { is_active: active } },
      auditContext(await headers()),
    );
  } catch (error) {
    return { status: "error", message: writeError(error) };
  }
  revalidatePath("/master");
  revalidatePath(`/master/${def.slug}`);
  return { status: "done" };
}
