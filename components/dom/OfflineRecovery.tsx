"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function readPendingOfflineClaims(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem("qcheck_offline_claims");
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function OfflineRecovery() {
  const [online, setOnline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const syncState = () => {
      setOnline(navigator.onLine);
      setPendingCount(readPendingOfflineClaims());
    };
    syncState();
    window.addEventListener("online", syncState);
    window.addEventListener("offline", syncState);
    return () => {
      window.removeEventListener("online", syncState);
      window.removeEventListener("offline", syncState);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-control border border-carbon-700 bg-carbon-900/70 px-4 py-3 text-left text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ti-400">สถานะเครือข่าย</span>
          <span className={`inline-flex items-center gap-1.5 font-medium ${online ? "text-emerald-400" : "text-amber-400"}`}>
            <span className={`size-2 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden="true" />
            {online ? "กลับมาออนไลน์แล้ว" : "ออฟไลน์"}
          </span>
        </div>
        {pendingCount > 0 && (
          <p className="mt-2 border-t border-carbon-700/70 pt-2 text-xs text-ti-300">
            มีรายการตรวจที่บันทึกไว้บนเครื่องนี้{" "}
            <span className="font-mono font-semibold text-ember-400">{pendingCount}</span>{" "}
            รายการ — ระบบจะซิงก์ให้อัตโนมัติทันทีที่เชื่อมต่อสำเร็จ
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 flex-1 rounded-control bg-ember-500 px-4 py-2.5 text-sm font-medium text-carbon-950 transition-colors hover:bg-ember-400 cursor-pointer"
        >
          ลองเชื่อมต่ออีกครั้ง
        </button>
        <Link
          href="/home"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control border border-carbon-600 bg-carbon-800 px-4 py-2.5 text-sm text-ti-200 transition-colors hover:border-ti-400 hover:text-ti-50"
        >
          กลับหน้าหลัก
        </Link>
      </div>
    </div>
  );
}
