import "server-only";
import { revalidatePath } from "next/cache";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { MAX_CANCEL_REASON } from "./rules";

export const NO_ACCOUNT = "ไม่พบบัญชีของคุณในฐานข้อมูล QCheck — กรุณาออกจากระบบแล้วเข้าใหม่";
export const PLAN_NOT_FOUND = "ไม่พบแผนนี้";

/** The sentence for each way cancelling a plan can be refused (docs/15 §3). */
export const CANCEL_MESSAGES = {
  not_found: PLAN_NOT_FOUND,
  reason_required: "กรุณาใส่เหตุผลที่ยกเลิก",
  reason_too_long: `เหตุผลยาวเกิน ${MAX_CANCEL_REASON} ตัวอักษร`,
  changed: "สถานะแผนเพิ่งเปลี่ยน — โหลดหน้าใหม่แล้วลองอีกครั้ง",
  status: "แผนในสถานะนี้ยกเลิกไม่ได้",
  head_only: "แผนนี้มีผลตรวจแล้ว — ต้องให้ QC Head หรือ QA Head ยกเลิก",
} as const;

/** HTTP status of each refusal in `CANCEL_MESSAGES`: typing again fixes 422, a changed state is 409. */
export const CANCEL_STATUS: Record<keyof typeof CANCEL_MESSAGES, number> = {
  not_found: 404,
  reason_required: 422,
  reason_too_long: 422,
  changed: 409,
  status: 409,
  head_only: 403,
};

/** The `[id]` of a plan path, or null when it can't be a plan id (answered as "not found"). */
export const planIdOf = (raw: string) => (/^\d{1,12}$/.test(raw) ? Number(raw) : null);

/** Signed-in user's users.id for created_by-style columns (office users are looked up by employee code). */
export async function actorIdOf(actor: { id: string }) {
  return dbConfigured() ? await resolveActorId(actor.id) : actor.id;
}

export const WORK_ORDER_NOT_FOUND = "ไม่พบใบงานนี้";
export const WORK_ORDER_LOCKED = "ใบงานนี้ส่งแล้ว ปิดแล้ว หรือยกเลิกแล้ว — แก้ไม่ได้";

const WORK_ORDER_ID = /^[\w-]{1,40}$/;
/** The `[woId]` of a work-order path, or null when it can't be one (answered as "not found"). */
export const workOrderIdOf = (raw: string) => (WORK_ORDER_ID.test(raw) ? raw : null);

/** Refresh every list and page that shows this plan. */
export function revalidatePlan(planId: number) {
  revalidatePath("/plans");
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/home");
}

/** A work-order change also moves the plan's lot counts and the inspectors' "my jobs". */
export function revalidateWorkOrders(planId: number) {
  revalidatePlan(planId);
  revalidatePath("/jobs");
}
