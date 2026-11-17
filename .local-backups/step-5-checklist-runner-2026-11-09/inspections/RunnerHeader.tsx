"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelClaimApi } from "@/lib/inspections/client";
import type { StoredInspection } from "@/lib/inspections/store";
import { NetworkSyncBadge } from "./NetworkSyncBadge";

type Props = {
  inspection: StoredInspection;
  hasUnsavedAnswers: boolean;
  onClearDraft?: () => void;
};

/**
 * Screen S06 Header: Navigation, unit serial details, offline badge, and release claim action.
 */
export function RunnerHeader({ inspection, hasUnsavedAnswers, onClearDraft }: Props) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function handleReleaseClaim() {
    setCancelling(true);
    try {
      await cancelClaimApi(inspection.id);
      onClearDraft?.();
      router.push("/jobs");
    } catch {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  function handleExitClick(e: React.MouseEvent) {
    if (hasUnsavedAnswers) {
      if (!window.confirm("ผลการตรวจถูกบันทึกไว้ในเครื่องแล้ว คุณต้องการกลับหน้ารวมงานใช่หรือไม่?")) {
        e.preventDefault();
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between gap-3 border-b border-carbon-700 pb-3">
        <Link
          href="/jobs"
          onClick={handleExitClick}
          className="rounded-control border border-ti-600 bg-carbon-800 px-3 py-1.5 text-xs text-ti-200 hover:border-ti-400 hover:text-ti-100 transition-colors"
        >
          กลับหน้ารวมงาน
        </Link>
        <div className="flex items-center gap-2">
          <NetworkSyncBadge />
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="rounded-control border border-ti-700 bg-carbon-800/80 px-2.5 py-1 text-xs text-ti-400 hover:border-fail/50 hover:text-fail transition-colors"
            title="ยกเลิกการจองเครื่องนี้และคืนโควตาสู่ใบงาน"
          >
            ยกเลิกการตรวจ
          </button>
          <span className="font-mono text-xs rounded-full border border-ember-500/60 text-ember-400 px-2.5 py-0.5">
            กำลังตรวจ
          </span>
        </div>
      </div>

      {/* Inspection Header Summary Banner */}
      <header className="rounded-panel border border-carbon-700 bg-carbon-800 p-4 sm:p-5 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="font-mono text-xs font-semibold text-ember-400">
              {inspection.workOrderId ? `ใบงาน ${inspection.workOrderId}` : "แผนการตรวจ"}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-ti-50">
              Serial {inspection.serialPump}
            </h1>
            {inspection.serialMotor && (
              <p className="text-xs font-mono text-ti-300">
                มอเตอร์: {inspection.serialMotor}
              </p>
            )}
          </div>
          <div className="text-right text-xs font-mono text-ti-400">
            <div>ลำดับ #{inspection.inspectionNo ?? 1}</div>
            <div>เริ่ม {new Date(inspection.startedAt).toLocaleTimeString("th-TH")}</div>
          </div>
        </div>
      </header>

      {/* Confirmation Dialog for Releasing Claim */}
      {confirmCancel && (
        <div
          role="alertdialog"
          aria-labelledby="cancel-claim-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="w-full max-w-sm rounded-panel border border-carbon-600 bg-carbon-800 p-5 space-y-4 shadow-xl">
            <h2 id="cancel-claim-title" className="text-base font-semibold text-ti-100">
              ยืนยันยกเลิกการตรวจนี้?
            </h2>
            <p className="text-xs text-ti-300 leading-relaxed">
              การยกเลิกจะคืนโควตาเครื่อง <span className="font-mono font-medium text-ember-400">{inspection.serialPump}</span> กลับเข้าสู่ใบงานเพื่อให้ผู้ตรวจท่านอื่นสามารถตรวจได้
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                disabled={cancelling}
                className="h-9 rounded-control border border-ti-600 px-3 text-xs text-ti-200 hover:border-ti-400"
              >
                ไม่ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleReleaseClaim}
                disabled={cancelling}
                className="h-9 rounded-control bg-fail px-3 text-xs font-semibold text-carbon-900 hover:opacity-90 disabled:opacity-50"
              >
                {cancelling ? "กำลังคืนโควตา…" : "ยืนยันยกเลิก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
