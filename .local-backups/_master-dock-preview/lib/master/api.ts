import "server-only";
import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError } from "@/lib/api/response";
import { auditContext, type AuditContext } from "@/lib/auth/audit";
import type { SessionUser } from "@/lib/auth/types";
import { masterBySlug, type MasterDef } from "./registry";
import { masterWriteProblem } from "./repo";

export type MasterApiContext = {
  def: MasterDef;
  actor: SessionUser;
  /** IP and device for the audit row. */
  trail: AuditContext;
};

/**
 * The gate of every `/api/master/[table]…` route: the signed-in person may edit master data
 * (Master Admin only — `master-edit`), and the table in the path is one of the registry's.
 * Signed-out and forbidden answers come first, so a stranger can't probe which tables exist.
 */
export async function masterContext(request: Request, context: { params: Promise<{ table: string }> }): Promise<MasterApiContext | { response: Response }> {
  const { table } = await context.params;
  const def = masterBySlug(table);
  const guard = await guardApi(request, { page: "master-edit", returnTo: def ? `/master/${def.slug}` : "/master" });
  if ("response" in guard) return guard;
  if (!def) return { response: apiError(404, "ไม่พบประเภทข้อมูลนี้", { at: Date.now() }) };
  return { def, actor: guard.user, trail: auditContext(request.headers) };
}

/** The `[id]` of a master row path, or null when it can't be one (answered as "not found"). */
export const rowIdOf = (raw: string) => (/^\d{1,9}$/.test(raw) ? Number(raw) : null);

/**
 * For the `catch` of a master write: SQL Server's "already exists" and "breaks a rule" errors
 * become sentences the person can act on (409 / 422); other database failures are a 503, and
 * anything else is thrown again. `extra` keeps what the form needs (typed `values`, `at`).
 */
export function masterWriteFailure(error: unknown, extra: Record<string, unknown> = {}): Response {
  const problem = masterWriteProblem(error);
  if (problem === "duplicate") return apiError(409, "มีรายการนี้อยู่แล้ว — ค่าที่ห้ามซ้ำ (เช่น รหัสหรือชื่อ) ซ้ำกับรายการอื่น", extra);
  if (problem === "invalid") return apiError(422, "ข้อมูลไม่ผ่านเงื่อนไขของฐานข้อมูล (เช่น ค่าอ้างอิงไม่มีอยู่)", extra);
  return dbFailure(error, "master write", extra);
}
