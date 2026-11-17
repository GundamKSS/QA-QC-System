"use client";

import { useApiAction } from "@/lib/api/client";
import type { PinChangeState } from "@/lib/auth/types";

const idle: PinChangeState = { status: "idle" };
const failed = (message: string): PinChangeState => ({ status: "error", message });
const inputClass = "h-12 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 font-mono text-lg tracking-[0.3em] text-ti-50 focus:border-ember-500";

export function PinChangeForm() {
  const [state, action, pending] = useApiAction("/api/auth/change-pin", idle, failed);
  const pin = (name: string, label: string, autoComplete: string) => (
    <label className="block space-y-1 text-sm text-ti-400">
      <span>{label}</span>
      <input name={name} type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete={autoComplete} className={inputClass} />
    </label>
  );
  return (
    <form action={action} className="mt-5 space-y-4">
      {pin("current", "PIN ปัจจุบัน (PIN ชั่วคราวที่ได้รับ)", "current-password")}
      {pin("next", "PIN ใหม่ 6 หลัก", "new-password")}
      {pin("confirm", "ยืนยัน PIN ใหม่", "new-password")}
      <p className="text-xs text-ti-500">ตัวเลข 6 หลัก ไม่ซ้ำกันทั้งหมด และไม่เรียงต่อกัน (เช่น 111111, 123456)</p>
      {state.status === "error" && <p role="alert" className="text-sm text-red-300">{state.message}</p>}
      <button type="submit" disabled={pending} className="h-[52px] w-full rounded-control bg-ember-500 text-base font-semibold text-carbon-900 transition-colors hover:bg-ember-400 disabled:opacity-60">
        {pending ? "กำลังบันทึก…" : "บันทึก PIN ใหม่"}
      </button>
    </form>
  );
}
