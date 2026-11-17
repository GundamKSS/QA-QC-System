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
    <div className="rounded-panel border border-carbon-700 bg-carbon-800/80 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ti-300">โควตาใบงาน</span>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="text-ti-400 hover:text-ti-200 transition-colors"
        >
          {loading ? "กำลังโหลด…" : "รีเฟรช"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-control bg-carbon-900 p-2 border border-carbon-700">
          <span className="block text-[11px] text-ti-400">เป้าหมาย</span>
          <span className="font-mono text-base font-semibold text-ti-100">{quota.qtyNeed}</span>
        </div>
        <div className="rounded-control bg-carbon-900 p-2 border border-carbon-700">
          <span className="block text-[11px] text-ti-400">ตรวจแล้ว</span>
          <span className="font-mono text-base font-semibold text-pass">{quota.qtyDone}</span>
        </div>
        <div
          className={`rounded-control p-2 border ${
            isFull
              ? "bg-fail/10 border-fail/40 text-fail"
              : "bg-carbon-900 border-carbon-700 text-ti-100"
          }`}
        >
          <span className="block text-[11px] text-ti-400">คงเหลือ</span>
          <span className="font-mono text-base font-bold">
            {quota.remaining} <span className="text-xs font-normal text-ti-400">เครื่อง</span>
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-ti-400">
          <span>ความคืบหน้า ({percent}%)</span>
          {quota.inProgress > 0 && (
            <span className="text-ember-400">กำลังตรวจ {quota.inProgress} เครื่อง</span>
          )}
        </div>
        <QcBar done={quota.qtyDone} required={quota.qtyNeed} />
      </div>

      {quota.activeClaims.length > 0 && (
        <div className="pt-2 text-[11px] text-ti-400 space-y-1 border-t border-carbon-700">
          <span className="text-ti-400">กำลังตรวจขณะนี้:</span>
          <ul className="space-y-0.5">
            {quota.activeClaims.map((claim) => (
              <li key={claim.inspectionId} className="flex justify-between font-mono text-[11px]">
                <span className="text-ti-200">{claim.serialPump}</span>
                <span className="text-ti-400">{claim.inspectorName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-xs text-fail">{error}</p>}
    </div>
  );
}
