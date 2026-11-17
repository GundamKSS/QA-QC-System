"use client";

import { useEffect, useState } from "react";

type ImpersonateUser = {
  id: string;
  employeeCode: string;
  fullName: string;
  role: string;
};

export function DevPersonaSection() {
  const [enabled, setEnabled] = useState(false);
  const [users, setUsers] = useState<ImpersonateUser[]>([]);
  const [currentCode, setCurrentCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/dev/impersonate");
        if (!res.ok) {
          setEnabled(false);
          return;
        }
        const data = await res.json();
        if (!cancelled && data.users) {
          setEnabled(true);
          setUsers(data.users);
          setCurrentCode(data.currentEmployeeCode || "");
        }
      } catch {
        setEnabled(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-panel border border-carbon-700 bg-carbon-800/80 p-5 text-sm text-ti-400 animate-pulse">
        กำลังโหลดรายชื่อผู้ใช้สำหรับสวมบทบาท…
      </div>
    );
  }

  if (!enabled || users.length === 0) return null;

  async function handleSwitch(employeeCode: string) {
    if (!employeeCode || employeeCode === currentCode) return;
    setSwitching(employeeCode);
    try {
      const res = await fetch("/api/dev/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeCode }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (e) {
      console.error("Failed to switch persona", e);
    } finally {
      setSwitching(null);
    }
  }

  const isImpersonating = currentCode && currentCode.toLowerCase() !== "dev";
  const currentUser = users.find((u) => u.employeeCode.toLowerCase() === currentCode.toLowerCase());

  return (
    <section aria-labelledby="dev-persona-heading" className="space-y-4 rounded-panel border-2 border-amber-500/40 bg-carbon-800/90 p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="dev-persona-heading" className="text-lg font-semibold text-ti-50">
                Dev สวมบทบาท
              </h2>
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                โหมดพัฒนา (Dev Only)
              </span>
            </div>
            <p className="text-xs text-ti-400">
              สลับบทบาทเป็นผู้ตรวจท่านอื่นเพื่อดูหน้าจอ งานที่ได้รับมอบหมาย และทดสอบสิทธิ์จริง
            </p>
          </div>
        </div>

        {isImpersonating && (
          <button
            type="button"
            disabled={Boolean(switching)}
            onClick={() => handleSwitch("dev")}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-carbon-950 hover:bg-amber-400 active:scale-95 transition-all shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            <span>กลับเป็นบัญชี dev gundam</span>
          </button>
        )}
      </div>

      {/* Active User Callout */}
      <div className={`rounded-xl border p-3.5 ${
        isImpersonating
          ? "border-amber-500/60 bg-amber-950/30 text-amber-200"
          : "border-carbon-700 bg-carbon-900/60 text-ti-200"
      }`}>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-ti-400">บัญชีปัจจุบันขณะนี้:</span>
          <span className="font-mono text-[11px] text-ti-400">รหัสพนักงาน: {currentUser?.employeeCode ?? currentCode}</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-base font-semibold text-ti-50">
            {currentUser?.fullName ?? currentCode}
          </span>
          <span className="text-xs text-ti-300">({currentUser?.role ?? "ไม่ระบุบทบาท"})</span>
        </div>
      </div>

      {/* User Selection Grid */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ti-400">
          เลือกสวมบทบาทเป็นผู้ใช้อื่น:
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {users.map((u) => {
            const isCurrent = u.employeeCode.toLowerCase() === currentCode.toLowerCase();
            const isSwitchingThis = switching === u.employeeCode;

            return (
              <div
                key={u.id}
                className={`relative flex items-center justify-between rounded-xl border p-3 transition-all ${
                  isCurrent
                    ? "border-amber-400/80 bg-amber-500/15 ring-1 ring-amber-400/50"
                    : "border-carbon-700 bg-carbon-900/50 hover:border-carbon-600 hover:bg-carbon-900"
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ti-50">{u.fullName}</span>
                    <span className="shrink-0 rounded bg-carbon-800 px-1.5 py-0.5 font-mono text-[10px] text-ti-300">
                      {u.employeeCode}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ti-400">{u.role}</p>
                </div>

                <div className="shrink-0">
                  {isCurrent ? (
                    <span className="flex items-center gap-1 rounded-md bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-300">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      กำลังใช้
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(switching)}
                      onClick={() => handleSwitch(u.employeeCode)}
                      className="rounded-md border border-carbon-600 bg-carbon-800 hover:bg-carbon-700 hover:border-amber-500/50 px-2.5 py-1 text-xs font-medium text-ti-200 hover:text-white transition-all disabled:opacity-50"
                    >
                      {isSwitchingThis ? "กำลังสลับ…" : "สวมบทบาท"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
