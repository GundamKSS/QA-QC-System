"use client";

import { useId, type ReactNode } from "react";
import { useApiAction } from "@/lib/api/client";
import type { AdminState } from "@/lib/auth/types";

const idle: AdminState = { status: "idle" };
const failed = (message: string): AdminState => ({ status: "error", message });

const inputClass = "h-11 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500";
const buttonClass = "h-10 rounded-control border border-ti-600 px-3 text-sm text-ti-200 transition-colors hover:border-ti-400 hover:text-ti-50 disabled:opacity-50";
const primaryClass = "h-11 rounded-control app-primary-action bg-ember-500 px-5 text-sm font-semibold text-carbon-900 transition-colors hover:bg-ember-400 disabled:opacity-50";

export type FieldRole = { value: string; label: string };

/** The result line (and, once, a temporary PIN) under a form. A PIN is never stored or logged. */
function Result({ state }: { state: AdminState }) {
  if (state.status === "idle") return null;
  if (state.status === "error") return <p role="alert" className="mt-3 text-sm text-red-300">{state.message}</p>;
  return (
    <div role="status" className="mt-3 space-y-2 text-sm text-ti-200">
      <p>{state.message}</p>
      {state.tempPin && (
        <p className="rounded-control border border-ember-500/60 bg-carbon-900 px-4 py-3">
          <span className="text-ti-400">{state.employeeCode} · PIN ชั่วคราว: </span>
          <span className="font-mono text-2xl tracking-[0.3em] text-ember-400" data-testid="temp-pin">{state.tempPin}</span>
          <span className="mt-1 block text-xs text-ti-500">ปิดหน้านี้แล้วจะดูอีกไม่ได้ — ถ้าลืมให้กด “ออก PIN ใหม่”</span>
        </p>
      )}
    </div>
  );
}

function RoleChecks({ roles, selected }: { roles: FieldRole[]; selected: string[] }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-ti-400">บทบาท</legend>
      <div className="flex flex-wrap gap-4">
        {roles.map((role) => (
          <label key={role.value} className="flex items-center gap-2 text-sm text-ti-200">
            <input type="checkbox" name="roles" value={role.value} defaultChecked={selected.includes(role.value)} className="size-4 accent-ember-500" />
            {role.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm text-ti-400"><span>{label}</span>{children}</label>;
}

export function CreateUserForm({ roles }: { roles: FieldRole[] }) {
  const [state, action, pending] = useApiAction("/api/admin/users", idle, failed);
  const id = useId();
  return (
    <form action={action} key={state.status === "done" ? "done" : "open"} className="space-y-4 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-5" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="text-lg font-medium text-ti-50">เพิ่มผู้ใช้หน้างาน</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ชื่อ-นามสกุล *"><input name="fullName" required maxLength={200} autoComplete="off" className={inputClass} /></Field>
        <Field label="ชื่อเล่น"><input name="nickname" maxLength={100} autoComplete="off" className={inputClass} /></Field>
        <Field label="อีเมล (แจ้งเตือนเท่านั้น)"><input name="email" type="email" maxLength={256} autoComplete="off" className={inputClass} /></Field>
        <Field label="แผนก"><input name="department" maxLength={100} autoComplete="off" className={inputClass} /></Field>
      </div>
      <RoleChecks roles={roles} selected={[]} />
      <p className="text-xs text-ti-500">ระบบออกรหัส F0001… และ PIN ชั่วคราว 6 หลักให้อัตโนมัติ — เจ้าตัวต้องตั้ง PIN ใหม่ตอนเข้าครั้งแรก</p>
      <button type="submit" disabled={pending} className={primaryClass}>{pending ? "กำลังสร้าง…" : "สร้างผู้ใช้"}</button>
      <Result state={state} />
    </form>
  );
}

/** One small POST form per row action; the result shows right under the row's buttons. */
function RowAction({ url, label, extra, confirm }: { url: string; label: string; extra?: Record<string, string>; confirm?: string }) {
  const [state, run, pending] = useApiAction(url, idle, failed);
  return (
    <>
      <form action={run} onSubmit={(event) => { if (confirm && !window.confirm(confirm)) event.preventDefault(); }}>
        {Object.entries(extra ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <button type="submit" disabled={pending} className={buttonClass}>{label}</button>
      </form>
      {state.status !== "idle" && <div className="basis-full"><Result state={state} /></div>}
    </>
  );
}

export type RowUser = {
  id: string; code: string; fullName: string; nickname: string | null; email: string | null; department: string | null;
  roles: string[]; isActive: boolean;
};

export function UserRowActions({ user, canManage, canUnlock, locked, roles }: { user: RowUser; canManage: boolean; canUnlock: boolean; locked: boolean; roles: FieldRole[] }) {
  const base = `/api/admin/users/${encodeURIComponent(user.id)}`;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {canUnlock && locked && <RowAction url={`${base}/unlock-pin`} label="ปลดล็อก PIN" />}
      {canManage && (
        <>
          <RowAction url={`${base}/reset-pin`} label="ออก PIN ใหม่" confirm={`ออก PIN ชั่วคราวใหม่ให้ ${user.code}? PIN เดิมจะใช้ไม่ได้ทันที`} />
          <RowAction
            url={`${base}/active`}
            label={user.isActive ? "ปิดการใช้งาน" : "เปิดใช้งาน"}
            extra={{ active: user.isActive ? "0" : "1" }}
            confirm={user.isActive ? `ปิดการใช้งาน ${user.code}? จะเข้าระบบไม่ได้ทันที` : undefined}
          />
          <EditUser user={user} roles={roles} />
        </>
      )}
    </div>
  );
}

function EditUser({ user, roles }: { user: RowUser; roles: FieldRole[] }) {
  const [state, action, pending] = useApiAction(`/api/admin/users/${encodeURIComponent(user.id)}`, idle, failed, "PATCH");
  return (
    <details className="basis-full rounded-control border border-carbon-700">
      <summary className="cursor-pointer px-3 py-2 text-sm text-ti-400">แก้ไขข้อมูล / บทบาท</summary>
      <form action={action} className="space-y-3 border-t border-carbon-700 p-3">
        <input type="hidden" name="code" value={user.code} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ชื่อ-นามสกุล *"><input name="fullName" required defaultValue={user.fullName} maxLength={200} className={inputClass} /></Field>
          <Field label="ชื่อเล่น"><input name="nickname" defaultValue={user.nickname ?? ""} maxLength={100} className={inputClass} /></Field>
          <Field label="อีเมล"><input name="email" type="email" defaultValue={user.email ?? ""} maxLength={256} className={inputClass} /></Field>
          <Field label="แผนก"><input name="department" defaultValue={user.department ?? ""} maxLength={100} className={inputClass} /></Field>
        </div>
        <RoleChecks roles={roles} selected={user.roles} />
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
        <Result state={state} />
      </form>
    </details>
  );
}
