"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPolicy } from "@/config/auth";
import { adminErrors } from "@/lib/auth/admin-copy";
import { audit, auditContext } from "@/lib/auth/audit";
import { requireSignedIn } from "@/lib/auth/dal";
import { changeOwnPin } from "@/lib/auth/local-admin";
import { getLocalStore, getPinGuard, pinPepper } from "@/lib/auth/local-runtime";

export type PinChangeState = { status: "idle" } | { status: "error"; message: string };

const text = (formData: FormData, key: string) => (typeof formData.get(key) === "string" ? String(formData.get(key)) : "");

/** A field user choosing their own PIN, forced after a temporary one (docs/12). Central users never get here. */
export async function changePinAction(_: PinChangeState, formData: FormData): Promise<PinChangeState> {
  const user = await requireSignedIn(authPolicy.changePasswordPath);
  if (user.source !== "LOCAL") return { status: "error", message: adminErrors.forbidden };
  const pepper = pinPepper();
  if (!pepper) return { status: "error", message: "ระบบยังไม่พร้อม ติดต่อผู้ดูแลระบบ" };

  const result = await changeOwnPin(
    { store: getLocalStore(), guard: getPinGuard(), pepper, userId: user.id },
    { current: text(formData, "current"), next: text(formData, "next"), confirm: text(formData, "confirm") },
  );
  if (!result.ok) return { status: "error", message: adminErrors[result.error] };
  audit({ action: "user.pin_change", employeeCode: user.employeeCode, userId: user.id }, auditContext(await headers()));
  redirect(authPolicy.homePath);
}
