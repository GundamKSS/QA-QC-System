"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requirePageAccess } from "@/lib/auth/dal";
import { audit, auditContext } from "@/lib/auth/audit";
import { adminErrors } from "@/lib/auth/admin-copy";
import { createLocalUser, resetLocalPin, setLocalActive, unlockLocalPin, updateLocalUser, type AdminDeps } from "@/lib/auth/local-admin";
import { getLocalStore, getPinGuard, pinPepper } from "@/lib/auth/local-runtime";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";

export type AdminState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string; /** Shown once; never stored or logged. */ tempPin?: string; employeeCode?: string };

const field = (formData: FormData, key: string) => (typeof formData.get(key) === "string" ? String(formData.get(key)) : "");
const roles = (formData: FormData) => formData.getAll("roles").filter((value): value is string => typeof value === "string");

async function context(): Promise<{ deps: AdminDeps; actor: { id: string; employeeCode: string }; request: ReturnType<typeof auditContext> } | { error: AdminState }> {
  const actor = await requirePageAccess("users", "/admin/users");
  const pepper = pinPepper();
  if (!pepper) return { error: { status: "error", message: "ยังไม่ได้ตั้งค่า PIN_PEPPER บนเซิร์ฟเวอร์ — สร้างผู้ใช้หน้างานไม่ได้" } };
  return {
    deps: { store: getLocalStore(), guard: getPinGuard(), pepper, actor: { id: actor.id, roles: actor.roles } },
    actor: { id: actor.id, employeeCode: actor.employeeCode },
    request: auditContext(await headers()),
  };
}

const failed = (error: keyof typeof adminErrors, rejected?: string[]): AdminState => ({
  status: "error",
  message: adminErrors[error] + (rejected?.length ? ` (${rejected.join(", ")})` : ""),
});

type Action = (previous: AdminState, formData: FormData) => Promise<AdminState>;

/** A database outage becomes a form error instead of an uncaught crash; other errors (redirects, bugs) pass through. */
function withDb(action: Action): Action {
  return async (previous, formData) => {
    try {
      return await action(previous, formData);
    } catch (error) {
      if (!isDbError(error)) throw error;
      console.error("[db] user admin action failed", error.message);
      return { status: "error", message: dbProblemMessages[dbProblem(error)] };
    }
  };
}

async function createUser(_: AdminState, formData: FormData): Promise<AdminState> {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  const result = await createLocalUser(ctx.deps, {
    fullName: field(formData, "fullName"),
    nickname: field(formData, "nickname"),
    email: field(formData, "email"),
    department: field(formData, "department"),
    roles: roles(formData),
  });
  if (!result.ok) return failed(result.error, result.rejected);
  audit({ action: "user.create", employeeCode: ctx.actor.employeeCode, userId: ctx.actor.id, target: { id: result.user.id, employeeCode: result.user.employeeCode }, detail: { roles: result.user.roles } }, ctx.request);
  revalidatePath("/admin/users");
  return { status: "done", message: `สร้างผู้ใช้ ${result.user.employeeCode} แล้ว — จด PIN ชั่วคราวส่งให้เจ้าตัว (แสดงครั้งเดียว)`, tempPin: result.tempPin, employeeCode: result.user.employeeCode };
}

async function updateUser(_: AdminState, formData: FormData): Promise<AdminState> {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  const id = field(formData, "id");
  const result = await updateLocalUser(ctx.deps, id, {
    fullName: field(formData, "fullName"),
    nickname: field(formData, "nickname"),
    email: field(formData, "email"),
    department: field(formData, "department"),
    roles: roles(formData),
  });
  if (!result.ok) return failed(result.error, result.rejected);
  audit({ action: "user.roles_change", employeeCode: ctx.actor.employeeCode, userId: ctx.actor.id, target: { id, employeeCode: field(formData, "code") }, detail: { before: result.before, after: result.after } }, ctx.request);
  revalidatePath("/admin/users");
  return { status: "done", message: "บันทึกแล้ว" };
}

async function resetPin(_: AdminState, formData: FormData): Promise<AdminState> {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  const id = field(formData, "id");
  const result = await resetLocalPin(ctx.deps, id);
  if (!result.ok) return failed(result.error);
  audit({ action: "user.pin_reset", employeeCode: ctx.actor.employeeCode, userId: ctx.actor.id, target: { id, employeeCode: result.employeeCode } }, ctx.request);
  revalidatePath("/admin/users");
  return { status: "done", message: `ออก PIN ชั่วคราวใหม่ให้ ${result.employeeCode} แล้ว (แสดงครั้งเดียว) — เจ้าตัวต้องเปลี่ยนเมื่อเข้าครั้งแรก`, tempPin: result.tempPin, employeeCode: result.employeeCode };
}

async function unlockPin(_: AdminState, formData: FormData): Promise<AdminState> {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  const id = field(formData, "id");
  const result = await unlockLocalPin(ctx.deps, id);
  if (!result.ok) return failed(result.error);
  audit({ action: "user.pin_unlock", employeeCode: ctx.actor.employeeCode, userId: ctx.actor.id, target: { id, employeeCode: result.employeeCode } }, ctx.request);
  revalidatePath("/admin/users");
  return { status: "done", message: `ปลดล็อก PIN ของ ${result.employeeCode} แล้ว` };
}

async function setActive(_: AdminState, formData: FormData): Promise<AdminState> {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  const id = field(formData, "id");
  const active = field(formData, "active") === "1";
  const result = await setLocalActive(ctx.deps, id, active);
  if (!result.ok) return failed(result.error);
  audit({ action: active ? "user.activate" : "user.deactivate", employeeCode: ctx.actor.employeeCode, userId: ctx.actor.id, target: { id, employeeCode: result.employeeCode } }, ctx.request);
  revalidatePath("/admin/users");
  return { status: "done", message: active ? `เปิดใช้งาน ${result.employeeCode} แล้ว` : `ปิดการใช้งาน ${result.employeeCode} แล้ว — เข้าระบบไม่ได้ทันที` };
}

export const createUserAction = withDb(createUser);
export const updateUserAction = withDb(updateUser);
export const resetPinAction = withDb(resetPin);
export const unlockPinAction = withDb(unlockPin);
export const setActiveAction = withDb(setActive);
