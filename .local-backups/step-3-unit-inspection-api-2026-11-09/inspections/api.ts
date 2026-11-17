import "server-only";
import { revalidatePath } from "next/cache";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";

export const NO_ACCOUNT = "ไม่พบบัญชีของคุณในฐานข้อมูล QCheck — กรุณาออกจากระบบแล้วเข้าใหม่";
export const INSPECTION_NOT_FOUND = "ไม่พบรายการตรวจนี้";

/** Signed-in user's users.id for created_by-style columns (office users are looked up by employee code). */
export async function actorIdOf(actor: { id: string }) {
  return dbConfigured() ? await resolveActorId(actor.id) : actor.id;
}

/** Refresh lists and pages showing this plan's inspections and job quotas. */
export function revalidateInspections(planId?: number) {
  if (planId) {
    revalidatePath(`/plans/${planId}`);
  }
  revalidatePath("/plans");
  revalidatePath("/jobs");
  revalidatePath("/home");
}
