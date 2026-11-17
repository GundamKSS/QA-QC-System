"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { claimUnitApi } from "@/lib/inspections/client";
import { enqueueOfflineClaim, useNetworkSync } from "@/lib/inspections/offline-sync";
import { validateSerial } from "@/lib/inspections/rules";
import type { InspectionQuota, StoredInspection } from "@/lib/inspections/store";
import type { SerialEntryMode } from "@/lib/inspections/types";
import { LiveQuotaBadge } from "./LiveQuotaBadge";
import { SerialInputGroup } from "./SerialInputGroup";

export type WorkOrderInfo = {
  id: string;
  woNo: string;
  planId: number;
  modelCode: string;
  description?: string | null;
  qtyNeed: number;
  qtyDone: number;
  vendorName?: string | null;
};

type Props = {
  isOpen: boolean;
  workOrder: WorkOrderInfo;
  existingSerials?: string[];
  onClose: () => void;
  onStarted?: (inspection: StoredInspection) => void;
};

/**
 * Screen S05: Start / Scan Serial Modal & Claim Flow.
 * Allows inspectors to scan/enter unit serial numbers, check live work-order quotas,
 * and lock the unit for inspection before proceeding to the Checklist Runner (S06).
 * Recording mode (LIVE vs PAPER_BACKFILL) is automatically selected from network ping.
 */
export function StartInspectionModal({
  isOpen,
  workOrder,
  existingSerials = [],
  onClose,
  onStarted,
}: Props) {
  const router = useRouter();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { isOnline, entryMode } = useNetworkSync();

  const [serialPump, setSerialPump] = useState("");
  const [serialMotor, setSerialMotor] = useState("");
  const [serialEntryMode, setSerialEntryMode] = useState<SerialEntryMode>("MANUAL");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<InspectionQuota | null>(null);

  // Sync open state with native dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [isOpen]);

  const validation = validateSerial(serialPump, { existingSerials });
  const isQuotaFull = quota !== null && quota.remaining <= 0;
  const canSubmit = validation.ok && !isQuotaFull && !submitting;

  function startOffline(cleanSerial: string) {
    const currentDone = quota?.qtyDone ?? workOrder.qtyDone;
    const currentInProgress = quota?.inProgress ?? 0;
    const offlineInspection = enqueueOfflineClaim({
      planId: workOrder.planId,
      workOrderId: workOrder.id,
      woNo: workOrder.woNo,
      modelCode: workOrder.modelCode,
      serialPump: cleanSerial,
      serialMotor: serialMotor.trim() || null,
      serialEntryMode,
      inspectionNo: currentDone + currentInProgress + 1,
    });
    onStarted?.(offlineInspection);
    router.push(`/inspections/${offlineInspection.id}`);
    onClose();
  }

  async function handleClaimAndStart() {
    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }
    if (isQuotaFull) {
      setErrorMessage("ยอดตรวจครบตามใบงานแล้ว ไม่สามารถจองเพิ่มได้");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    if (!isOnline) {
      startOffline(validation.serial);
      setSubmitting(false);
      return;
    }

    try {
      const res = await claimUnitApi({
        planId: workOrder.planId,
        workOrderId: workOrder.id,
        serialPump: validation.serial,
        serialMotor: serialMotor.trim() || null,
        serialEntryMode,
        entryMode,
      });

      if (res.status === "claimed") {
        onStarted?.(res.inspection);
        router.push(`/inspections/${res.inspection.id}`);
        onClose();
      } else if (res.inspectorName) {
        setErrorMessage(`เครื่องนี้กำลังถูกตรวจโดย ${res.inspectorName} — กรุณาเลือกเครื่องอื่น`);
      } else if (res.message?.includes("ฐานข้อมูลขัดข้อง")) {
        // Fallback to offline queue if database is temporarily unreachable
        startOffline(validation.serial);
      } else {
        setErrorMessage(res.message || "ไม่สามารถจองเครื่องนี้ได้");
      }
    } catch {
      // Network drop during claim -> queue offline and continue seamlessly
      startOffline(validation.serial);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(38rem,calc(100vw-2rem))] app-panel rounded-panel border border-carbon-600 bg-carbon-800 p-0 text-ti-50 backdrop:bg-black/75"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-carbon-700 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-lg text-ti-50">
            เริ่มตรวจ <span className="font-mono">{workOrder.woNo}</span>
          </h2>
          <p className="text-xs text-ti-400">
            {workOrder.modelCode}
            {workOrder.description ? ` · ${workOrder.description}` : ""}
            {workOrder.vendorName ? ` · ${workOrder.vendorName}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="flex size-9 shrink-0 items-center justify-center rounded-control text-ti-400 hover:bg-carbon-700 hover:text-ti-50"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Live Pool Quota Indicator */}
        <LiveQuotaBadge
          workOrderId={workOrder.id}
          initialNeed={workOrder.qtyNeed}
          initialDone={workOrder.qtyDone}
          onQuotaChange={setQuota}
        />

        {/* Conflict / Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-control border border-fail/60 bg-fail/10 p-3 text-xs text-fail"
          >
            <p className="font-medium">{errorMessage}</p>
          </div>
        )}

        {/* Serial Inputs & Scanner */}
        <SerialInputGroup
          serialPump={serialPump}
          serialMotor={serialMotor}
          serialEntryMode={serialEntryMode}
          existingSerials={existingSerials}
          onSerialPumpChange={(val, mode) => {
            setSerialPump(val);
            if (mode) setSerialEntryMode(mode);
            setErrorMessage(null);
          }}
          onSerialMotorChange={setSerialMotor}
        />
      </div>

      {/* Footer / Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-carbon-700 bg-carbon-800 p-4 sm:p-5">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="h-11 rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleClaimAndStart}
          disabled={!canSubmit}
          className="h-11 rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 px-5 text-sm font-semibold text-carbon-900 disabled:opacity-50"
        >
          {submitting ? "กำลังจอง…" : "เริ่มตรวจ"}
        </button>
      </div>
    </dialog>
  );
}
