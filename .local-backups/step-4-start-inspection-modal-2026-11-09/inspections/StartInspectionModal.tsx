"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { claimUnitApi } from "@/lib/inspections/client";
import { validateSerial } from "@/lib/inspections/rules";
import type { InspectionQuota, StoredInspection } from "@/lib/inspections/store";
import type { EntryMode, SerialEntryMode } from "@/lib/inspections/types";
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

  const [serialPump, setSerialPump] = useState("");
  const [serialMotor, setSerialMotor] = useState("");
  const [serialEntryMode, setSerialEntryMode] = useState<SerialEntryMode>("MANUAL");
  const [entryMode, setEntryMode] = useState<EntryMode>("LIVE");
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
      } else {
        if (res.inspectorName) {
          setErrorMessage(`เครื่องนี้กำลังถูกตรวจโดย ${res.inspectorName} — กรุณาเลือกเครื่องอื่น`);
        } else {
          setErrorMessage(res.message || "ไม่สามารถจองเครื่องนี้ได้");
        }
      }
    } catch {
      setErrorMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
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
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-panel border border-carbon-700 bg-carbon-900 p-0 text-ti-50 shadow-2xl backdrop:bg-black/75"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-carbon-800 p-4 sm:p-5">
        <div>
          <span className="font-mono text-xs font-semibold uppercase text-ember-400">
            ใบงาน {workOrder.woNo}
          </span>
          <h2 id={`${id}-title`} className="text-lg font-bold text-ti-50">
            เริ่มตรวจเครื่องใหม่ (S05)
          </h2>
          <p className="text-xs text-ti-400">
            {workOrder.modelCode}
            {workOrder.description ? ` · ${workOrder.description}` : ""}
            {workOrder.vendorName ? ` (${workOrder.vendorName})` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-control border border-carbon-700 p-1.5 text-ti-400 hover:bg-carbon-800 hover:text-ti-200 transition-colors"
          title="ปิด"
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
            className="rounded-control border border-red-500/60 bg-red-950/40 p-3 text-xs text-red-200 space-y-1"
          >
            <div className="font-semibold flex items-center gap-1.5">
              <span>⚠️</span>
              <span>ไม่สามารถเริ่มตรวจเครื่องนี้ได้</span>
            </div>
            <p>{errorMessage}</p>
          </div>
        )}

        {/* Serial Inputs & Scanner */}
        <SerialInputGroup
          serialPump={serialPump}
          serialMotor={serialMotor}
          serialEntryMode={serialEntryMode}
          entryMode={entryMode}
          existingSerials={existingSerials}
          onSerialPumpChange={(val, mode) => {
            setSerialPump(val);
            if (mode) setSerialEntryMode(mode);
            setErrorMessage(null);
          }}
          onSerialMotorChange={setSerialMotor}
          onEntryModeChange={setEntryMode}
        />
      </div>

      {/* Footer / Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-carbon-800 bg-carbon-900/90 p-4 sm:p-5">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="h-11 rounded-control border border-carbon-700 bg-carbon-800 px-4 text-sm font-medium text-ti-300 hover:bg-carbon-700 hover:text-ti-100 transition-colors"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleClaimAndStart}
          disabled={!canSubmit}
          className={`h-11 rounded-control px-5 text-sm font-semibold transition-all flex items-center gap-2 ${
            canSubmit
              ? "bg-ember-600 text-white hover:bg-ember-500 shadow-md active:scale-95"
              : "bg-carbon-800 text-ti-500 border border-carbon-700 cursor-not-allowed"
          }`}
        >
          {submitting ? (
            <>
              <span className="inline-block animate-spin">⏳</span>
              <span>กำลังจองเครื่อง…</span>
            </>
          ) : (
            <>
              <span>⚡</span>
              <span>เริ่มตรวจเครื่องนี้</span>
            </>
          )}
        </button>
      </div>
    </dialog>
  );
}
