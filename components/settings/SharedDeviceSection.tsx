"use client";

import { useState } from "react";
import { useApiAction, useApiRead } from "@/lib/api/client";
import { invalidateApiReads } from "@/lib/api/invalidate";
import type { DeviceRecord, DevicesPayload } from "@/lib/auth/device-validation";
import { LoadError } from "@/components/feedback/LoadError";

type FormState =
  | { status: "idle" }
  | { status: "done"; message?: string }
  | { status: "error"; message: string };

const INITIAL: FormState = { status: "idle" };
const failed = (message: string): FormState => ({ status: "error", message });

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

export function SharedDeviceSection() {
  const { data, loading, error, reload } = useApiRead<DevicesPayload>("/api/admin/devices");
  const [registerState, registerAction, registerPending] = useApiAction<FormState>(
    "/api/admin/devices",
    INITIAL,
    failed,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function toggleDeviceActive(device: DeviceRecord) {
    setBusyId(device.id);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/devices/${encodeURIComponent(device.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !device.isActive }),
      });
      const json = (await res.json()) as { status?: string; message?: string };
      if (!res.ok) {
        setActionMsg({ kind: "err", text: json.message ?? "อัปเดตสถานะอุปกรณ์ไม่สำเร็จ" });
        return;
      }
      setActionMsg({
        kind: "ok",
        text: `${device.deviceCode}: ${!device.isActive ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว"}`,
      });
      invalidateApiReads();
      reload();
    } catch {
      setActionMsg({ kind: "err", text: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" });
    } finally {
      setBusyId(null);
    }
  }

  async function unbindThisBrowser() {
    setBusyId("unbind");
    setActionMsg(null);
    try {
      const res = await fetch("/api/admin/devices/unbind", {
        method: "POST",
        credentials: "same-origin",
      });
      const json = (await res.json()) as { status?: string; message?: string };
      if (!res.ok) {
        setActionMsg({ kind: "err", text: json.message ?? "ยกเลิกการผูกเครื่องไม่สำเร็จ" });
        return;
      }
      setActionMsg({ kind: "ok", text: json.message ?? "ยกเลิกการผูกเครื่องส่วนกลางแล้ว" });
      invalidateApiReads();
      reload();
    } catch {
      setActionMsg({ kind: "err", text: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" });
    } finally {
      setBusyId(null);
    }
  }

  const current = data?.currentDevice;
  const isSharedBound = current?.kind === "shared" && current.deviceCode !== null;

  return (
    <section
      aria-labelledby="shared-device-heading"
      className="space-y-4 rounded-panel border border-carbon-700 bg-carbon-800 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="shared-device-heading" className="text-base font-semibold text-ti-50">
            ทะเบียนและโหมดเครื่องส่วนกลาง (Shared Device · FR-AUTH-05)
          </h2>
          <p className="text-xs text-ti-400">
            ผูกแท็บเล็ต/เครื่องคอมหน้างานเป็นเครื่องส่วนกลาง เพื่อเปิดระบบออกจากระบบอัตโนมัติเมื่อไม่ใช้งาน
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
            isSharedBound
              ? "border-ember-500/50 bg-ember-500/15 text-ember-300"
              : "border-carbon-600 bg-carbon-900/60 text-ti-300"
          }`}
        >
          <span
            className={`size-2 rounded-full ${isSharedBound ? "bg-ember-400" : "bg-ti-500"}`}
            aria-hidden="true"
          />
          {isSharedBound
            ? `เครื่องส่วนกลาง: ${current.deviceCode} (${current.idleMinutes} นาที)`
            : "อุปกรณ์ส่วนตัว (ไม่หมดเวลา Idle)"}
        </span>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {data && !data.dbAvailable && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          ยังไม่พบตาราง <code className="font-mono">dbo.devices</code> ในฐานข้อมูล กรุณารัน{" "}
          <code className="font-mono">npm run db:migrate</code> ก่อนลงทะเบียนอุปกรณ์
        </div>
      )}

      {isSharedBound && current && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ember-500/40 bg-carbon-900/60 p-3.5 text-xs">
          <div className="space-y-0.5">
            <p className="font-medium text-ti-100">
              เบราว์เซอร์นี้ผูกกับเครื่อง{" "}
              <span className="font-mono text-ember-400">{current.deviceCode}</span> ({current.deviceName})
            </p>
            <p className="text-ti-400">
              จุดติดตั้ง: {current.location ?? "ไม่ระบุ"} · ออกจากระบบอัตโนมัติหลังไม่ใช้งาน{" "}
              <span className="font-mono text-ti-200">{current.idleMinutes}</span> นาที (เตือนล่วงหน้า{" "}
              {current.warnSeconds} วินาที)
            </p>
          </div>
          <button
            type="button"
            disabled={busyId === "unbind"}
            onClick={unbindThisBrowser}
            className="min-h-9 rounded-control border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-900/50 disabled:opacity-50 cursor-pointer"
          >
            {busyId === "unbind" ? "กำลังยกเลิก…" : "ยกเลิกการผูกเครื่องนี้"}
          </button>
        </div>
      )}

      {/* Register & bind current browser */}
      <form
        action={registerAction}
        className="space-y-3 rounded-lg border border-carbon-700/80 bg-carbon-900/50 p-4"
      >
        <p className="text-xs font-semibold text-ti-200">ลงทะเบียนและผูกเบราว์เซอร์นี้เป็นเครื่องใหม่</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="dev-code" className="mb-1 block text-xs text-ti-400">
              รหัสอุปกรณ์ *
            </label>
            <input
              id="dev-code"
              name="deviceCode"
              type="text"
              required
              maxLength={40}
              placeholder="เช่น TAB-QC-01"
              className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 font-mono text-sm uppercase text-ti-50 placeholder:text-ti-500 focus:border-ember-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="dev-name" className="mb-1 block text-xs text-ti-400">
              ชื่ออุปกรณ์ *
            </label>
            <input
              id="dev-name"
              name="deviceName"
              type="text"
              required
              maxLength={120}
              placeholder="เช่น แท็บเล็ตจุดตรวจสายพาน 1"
              className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="dev-location" className="mb-1 block text-xs text-ti-400">
              จุดติดตั้ง / แผนก
            </label>
            <input
              id="dev-location"
              name="location"
              type="text"
              maxLength={120}
              placeholder="เช่น โรงงาน PUMA แผนก 408"
              className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="dev-kind" className="mb-1 block text-xs text-ti-400">
                ประเภทเครื่อง
              </label>
              <select
                id="dev-kind"
                name="deviceKind"
                defaultValue="shared"
                className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-2.5 text-sm text-ti-50 focus:border-ember-500 focus:outline-none"
              >
                <option value="shared">เครื่องส่วนกลาง</option>
                <option value="personal">อุปกรณ์ส่วนตัว</option>
              </select>
            </div>
            <div>
              <label htmlFor="dev-idle" className="mb-1 block text-xs text-ti-400">
                Idle (นาที)
              </label>
              <input
                id="dev-idle"
                name="idleMinutes"
                type="number"
                min={5}
                max={480}
                defaultValue={30}
                className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 font-mono text-sm text-ti-50 focus:border-ember-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-xs">
            {registerState.status === "error" && <span className="text-fail">{registerState.message}</span>}
            {registerState.status === "done" && (
              <span className="text-emerald-400">{registerState.message ?? "ลงทะเบียนอุปกรณ์เรียบร้อยแล้ว"}</span>
            )}
          </div>
          <button
            type="submit"
            disabled={registerPending || (data !== null && !data.dbAvailable)}
            className="min-h-10 rounded-control bg-ember-500 px-4 py-2 text-xs font-semibold text-carbon-950 transition-colors hover:bg-ember-400 disabled:opacity-50 cursor-pointer"
          >
            {registerPending ? "กำลังลงทะเบียน…" : "ลงทะเบียนและผูกเครื่องนี้"}
          </button>
        </div>
      </form>

      {actionMsg && (
        <p className={`text-xs ${actionMsg.kind === "ok" ? "text-emerald-400" : "text-fail"}`}>
          {actionMsg.text}
        </p>
      )}

      {/* Registered devices table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-ti-300">
            อุปกรณ์ที่ลงทะเบียนทั้งหมด ({data?.devices.length ?? 0})
          </h3>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="text-xs text-ti-400 hover:text-ti-100 cursor-pointer"
          >
            {loading ? "กำลังโหลด…" : "รีเฟรชรายการ"}
          </button>
        </div>

        {loading && !data ? (
          <div className="h-16 animate-pulse rounded-lg bg-carbon-900/50" />
        ) : data && data.devices.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-carbon-700">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-carbon-700 bg-carbon-900/80 text-ti-400">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัส / ชื่อเครื่อง</th>
                  <th className="px-3 py-2 font-medium">โหมด / Idle</th>
                  <th className="px-3 py-2 font-medium">ใช้งานล่าสุด</th>
                  <th className="px-3 py-2 text-right font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-700/70">
                {data.devices.map((device) => (
                  <tr key={device.id} className="bg-carbon-900/30">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-medium text-ti-100">{device.deviceCode}</span>
                        {device.isCurrentDevice && (
                          <span className="rounded bg-ember-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-ember-300">
                            เครื่องนี้
                          </span>
                        )}
                      </div>
                      <p className="text-ti-300">{device.deviceName}</p>
                      {device.location && <p className="text-[11px] text-ti-500">{device.location}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-ti-300">
                      {device.deviceKind === "shared"
                        ? `ส่วนกลาง (${device.idleMinutes} น.)`
                        : "ส่วนตัว"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-ti-400">
                      {formatDateTime(device.lastSeenAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={busyId === device.id}
                        onClick={() => toggleDeviceActive(device)}
                        className={`rounded-control border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 cursor-pointer ${
                          device.isActive
                            ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40"
                            : "border-carbon-600 bg-carbon-800 text-ti-400 hover:text-ti-100"
                        }`}
                      >
                        {busyId === device.id ? "…" : device.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-carbon-700/70 bg-carbon-900/30 px-4 py-4 text-center text-xs text-ti-400">
            ยังไม่มีอุปกรณ์ส่วนกลางที่ลงทะเบียนไว้
          </p>
        )}
      </div>
    </section>
  );
}
