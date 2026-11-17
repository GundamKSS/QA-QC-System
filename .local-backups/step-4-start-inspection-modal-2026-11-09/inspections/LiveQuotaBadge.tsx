"use client";

import { useEffect, useState } from "react";
import { QcBar } from "@/components/plans/PlanBits";
import { fetchWorkOrderQuota } from "@/lib/inspections/client";
import type { InspectionQuota } from "@/lib/inspections/store";

type Props = {
  workOrderId: string;
  initialNeed: number;
  initialDone: number;
  onQuotaChange?: (quota: InspectionQuota) => void;
};

/**
 * Live Quota and Active Claims badge (Pool-based claiming).
 * Polls the live work order quota and displays real-time remaining units and active inspectors.
 */
export function LiveQuotaBadge({
  workOrderId,
  initialNeed,
  initialDone,
  onQuotaChange,
}: Props) {
  const [quota, setQuota] = useState<InspectionQuota>({
    qtyNeed: initialNeed,
    qtyDone: initialDone,
    inProgress: 0,
    remaining: Math.max(0, initialNeed - initialDone),
    activeClaims: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const live = await fetchWorkOrderQuota(workOrderId);
      setQuota(live);
      onQuotaChange?.(live);
    } catch {
      setError("ไม่สามารถอัปเดตยอดคงเหลือได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const live = await fetchWorkOrderQuota(workOrderId);
        if (!cancelled) {
          setQuota(live);
          onQuotaChange?.(live);
        }
      } catch {
        if (!cancelled) {
          setError("ไม่สามารถอัปเดตยอดคงเหลือได้");
        }
      }
    }

    void load();
    const timer = setInterval(() => {
      void load();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [workOrderId, onQuotaChange]);

  const percent = quota.qtyNeed > 0 ? Math.round((quota.qtyDone / quota.qtyNeed) * 100) : 0;
  const isFull = quota.remaining <= 0;

  return (
    <div className="rounded-panel border border-carbon-700 bg-carbon-900/80 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ti-300">สถานะโควตาใบงาน (Live Pool)</span>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="text-ti-400 hover:text-ti-200 transition-colors flex items-center gap-1"
          title="รีเฟรชยอดคงเหลือ"
        >
          <span className={loading ? "inline-block animate-spin" : ""}>🔄</span>
          <span>{loading ? "กำลังเช็ค…" : "รีเฟรช"}</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-control bg-carbon-800 p-2 border border-carbon-700">
          <span className="block text-[11px] text-ti-400">เป้าหมาย</span>
          <span className="font-mono text-base font-semibold text-ti-100">{quota.qtyNeed}</span>
        </div>
        <div className="rounded-control bg-carbon-800 p-2 border border-carbon-700">
          <span className="block text-[11px] text-ti-400">ตรวจเสร็จแล้ว</span>
          <span className="font-mono text-base font-semibold text-emerald-400">{quota.qtyDone}</span>
        </div>
        <div
          className={`rounded-control p-2 border ${
            isFull
              ? "bg-red-950/40 border-red-800/60 text-red-300"
              : "bg-ember-950/40 border-ember-800/60 text-ember-300"
          }`}
        >
          <span className="block text-[11px] opacity-80">เหลือให้ตรวจ</span>
          <span className="font-mono text-base font-bold">
            {quota.remaining} <span className="text-xs font-normal">เครื่อง</span>
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-ti-400">
          <span>ความคืบหน้ารวม ({percent}%)</span>
          {quota.inProgress > 0 && (
            <span className="text-amber-400">กำลังตรวจอยู่ {quota.inProgress} เครื่อง</span>
          )}
        </div>
        <QcBar done={quota.qtyDone} required={quota.qtyNeed} />
      </div>

      {quota.activeClaims.length > 0 && (
        <div className="pt-1 text-[11px] text-ti-400 space-y-1 border-t border-carbon-800">
          <span className="font-medium text-ti-300">เครื่องที่กำลังตรวจอยู่ในขณะนี้:</span>
          <ul className="space-y-0.5">
            {quota.activeClaims.map((claim) => (
              <li key={claim.inspectionId} className="flex justify-between font-mono text-[11px]">
                <span className="text-amber-300">⚡ {claim.serialPump}</span>
                <span className="text-ti-400">โดย {claim.inspectorName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
