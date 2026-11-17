"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { QcBar } from "@/components/plans/PlanBits";
import { fetchWorkOrderQuota } from "@/lib/inspections/client";
import { getOfflineActiveClaims, useNetworkSync } from "@/lib/inspections/offline-sync";
import type { InspectionQuota } from "@/lib/inspections/store";

type Props = {
  workOrderId: string;
  initialNeed: number;
  initialDone: number;
  onQuotaChange?: (quota: InspectionQuota) => void;
};

function mergeOfflineClaims(base: InspectionQuota, workOrderId: string): InspectionQuota {
  const offlineClaims = getOfflineActiveClaims(workOrderId);
  if (offlineClaims.length === 0) return base;

  const existingSerials = new Set(base.activeClaims.map((c) => c.serialPump));
  const extraClaims = offlineClaims.filter((c) => !existingSerials.has(c.serialPump));
  const mergedClaims = [...base.activeClaims, ...extraClaims];
  const inProgress = mergedClaims.length;
  const remaining = Math.max(0, base.qtyNeed - base.qtyDone - inProgress);

  return {
    ...base,
    inProgress,
    remaining,
    activeClaims: mergedClaims,
  };
}

/**
 * Live Quota and Active Claims badge (Pool-based claiming).
 * Polls the live work order quota and displays real-time remaining units and active inspectors.
 * Automatically falls back to local quota + offline claims when offline.
 */
export function LiveQuotaBadge({
  workOrderId,
  initialNeed,
  initialDone,
  onQuotaChange,
}: Props) {
  const { isOnline, pendingCount } = useNetworkSync();
  const buildFallbackQuota = useCallback((): InspectionQuota => {
    const base: InspectionQuota = {
      qtyNeed: initialNeed,
      qtyDone: initialDone,
      inProgress: 0,
      remaining: Math.max(0, initialNeed - initialDone),
      activeClaims: [],
    };
    return mergeOfflineClaims(base, workOrderId);
  }, [initialNeed, initialDone, workOrderId]);

  const [quota, setQuota] = useState<InspectionQuota>(() => buildFallbackQuota());
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const live = await fetchWorkOrderQuota(workOrderId);
      const merged = mergeOfflineClaims(live, workOrderId);
      setQuota(merged);
      onQuotaChange?.(merged);
    } catch {
      const fallback = buildFallbackQuota();
      setQuota(fallback);
      onQuotaChange?.(fallback);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (!isOnline) {
          const fallback = buildFallbackQuota();
          if (!cancelled) {
            setQuota(fallback);
            onQuotaChange?.(fallback);
          }
          return;
        }
        const live = await fetchWorkOrderQuota(workOrderId);
        if (!cancelled) {
          const merged = mergeOfflineClaims(live, workOrderId);
          setQuota(merged);
          onQuotaChange?.(merged);
        }
      } catch {
        if (!cancelled) {
          const fallback = buildFallbackQuota();
          setQuota(fallback);
          onQuotaChange?.(fallback);
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
  }, [isOnline, workOrderId, buildFallbackQuota, onQuotaChange, pendingCount]);

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
        <div className="pt-2 text-[11px] text-ti-400 space-y-1.5 border-t border-carbon-700">
          <span className="font-medium text-ti-300">กำลังตรวจขณะนี้ ({quota.activeClaims.length} เครื่อง):</span>
          <ul className="space-y-1">
            {quota.activeClaims.map((claim) => (
              <li
                key={claim.inspectionId}
                className="flex items-center justify-between rounded-control bg-carbon-900/90 px-2.5 py-1.5 border border-carbon-700/80"
              >
                <div className="font-mono text-xs">
                  <span className="font-semibold text-ti-100">{claim.serialPump}</span>
                  <span className="ml-2 text-[11px] text-ti-400">({claim.inspectorName})</span>
                </div>
                <Link
                  href={`/inspections/${claim.inspectionId}`}
                  className="rounded px-2 py-0.5 text-xs font-medium text-ember-400 hover:bg-carbon-800 transition-colors"
                >
                  ตรวจต่อ →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
