"use client";

import { useId, useState } from "react";
import {
  DISPOSITION_LABELS,
  SEVERITY_LABELS,
  UNIT_ACTION_LABELS,
  UNIT_RESULT_LABELS,
} from "@/lib/inspections/rules";
import type {
  InspectionItem,
  InspectionRole,
  ItemAnswer,
  UnitAction,
  UnitEvaluation,
} from "@/lib/inspections/types";

type Props = {
  isOpen: boolean;
  evaluation: UnitEvaluation;
  items: readonly InspectionItem[];
  answers: Record<number, ItemAnswer | undefined>;
  role?: InspectionRole;
  isSubmitting: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (decision: UnitAction | null) => void;
};

/**
 * Screen S07: Unit Inspection Summary & Decision Dialog (BR-04).
 */
export function InspectionSummaryModal({
  isOpen,
  evaluation,
  items,
  answers,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: Props) {
  const id = useId();
  const [decision, setDecision] = useState<UnitAction>(
    evaluation.forcedAction ?? evaluation.suggestedAction ?? "REWORK",
  );

  if (!isOpen) return null;

  const isPass = evaluation.result === "PASS";
  const isConcession = evaluation.result === "CONCESSION";
  const isNotPassed = evaluation.result === "NOT_PASSED";
  const isForcedReject = evaluation.forcedAction === "REJECT";

  const totalRequired = items.filter((i) => i.isRequired).length;
  const totalAnswered = items.filter(
    (i) => i.isRequired && answers[i.id]?.status,
  ).length;

  function handleSubmitClick() {
    if (isNotPassed) {
      onSubmit(isForcedReject ? "REJECT" : decision);
    } else {
      onSubmit(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-labelledby={`${id}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-panel border border-carbon-600 bg-carbon-800 p-5 space-y-4 shadow-2xl text-ti-50">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-carbon-700 pb-3">
          <div>
            <h2 id={`${id}-title`} className="text-lg font-bold text-ti-50">
              สรุปผลการตรวจรับเครื่อง
            </h2>
            <p className="text-xs text-ti-400">
              ตรวจครบ {totalAnswered} จาก {totalRequired} หัวข้อบังคับ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            disabled={isSubmitting}
            className="flex size-8 items-center justify-center rounded-control text-ti-400 hover:bg-carbon-700 hover:text-ti-50"
          >
            ✕
          </button>
        </div>

        {/* Evaluation Banner (BR-04) */}
        <div
          className={`rounded-panel border p-4 space-y-1.5 ${
            isPass
              ? "border-pass/60 bg-pass/10"
              : isConcession
              ? "border-amber-500/60 bg-amber-950/20"
              : "border-fail/60 bg-fail/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`font-mono text-base font-bold uppercase ${
                isPass
                  ? "text-pass"
                  : isConcession
                  ? "text-amber-400"
                  : "text-fail"
              }`}
            >
              ผลตรวจ: {UNIT_RESULT_LABELS[evaluation.result]}
            </span>
          </div>
          <p className="text-xs text-ti-200 leading-relaxed">
            {evaluation.reason}
          </p>
        </div>

        {/* Defect Finding Breakdown (if any) */}
        {evaluation.allDefects.length > 0 && (
          <div className="space-y-2 border-t border-carbon-700 pt-3">
            <h3 className="text-xs font-semibold text-ti-300 uppercase">
              รายการอาการเสียที่ตรวจพบ ({evaluation.allDefects.length})
            </h3>
            <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {evaluation.allDefects.map((d, idx) => (
                <li
                  key={`${d.defectId}-${idx}`}
                  className="rounded-control border border-carbon-700 bg-carbon-900/60 p-2 text-xs flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-medium text-ti-100">{d.nameTh}</span>
                    {d.part && (
                      <span className="text-ti-400 text-[11px] block">
                        ชิ้นส่วน: {d.part}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                    <span className="border border-carbon-700 px-1.5 py-0.5 rounded text-ti-300">
                      {SEVERITY_LABELS[d.severity]}
                    </span>
                    <span className="border border-carbon-700 px-1.5 py-0.5 rounded text-ti-300">
                      {DISPOSITION_LABELS[d.disposition]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Decision Selection on NOT_PASSED */}
        {isNotPassed && (
          <div className="space-y-2 border-t border-carbon-700 pt-3">
            <label className="block text-xs font-semibold text-ti-200 uppercase">
              การจัดการเครื่องที่ไม่ผ่าน (Decision) <span className="text-fail">*</span>
            </label>

            {isForcedReject ? (
              <p className="rounded-control border border-fail/60 bg-fail/10 p-2.5 text-xs text-fail">
                พบอาการระดับวิกฤต (Critical) — ระบบบังคับให้คัดออก (Reject) เท่านั้น
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDecision("REWORK")}
                  className={`h-11 rounded-control text-xs font-medium border transition-colors ${
                    decision === "REWORK"
                      ? "border-ember-500 bg-ember-500 text-carbon-900 font-semibold"
                      : "border-carbon-600 bg-carbon-900 text-ti-300 hover:border-carbon-500"
                  }`}
                >
                  {UNIT_ACTION_LABELS.REWORK} (ส่งซ่อม)
                </button>
                <button
                  type="button"
                  onClick={() => setDecision("REJECT")}
                  className={`h-11 rounded-control text-xs font-medium border transition-colors ${
                    decision === "REJECT"
                      ? "border-fail bg-fail text-carbon-900 font-semibold"
                      : "border-carbon-600 bg-carbon-900 text-ti-300 hover:border-carbon-500"
                  }`}
                >
                  {UNIT_ACTION_LABELS.REJECT} (คัดออก)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-control border border-fail/60 bg-fail/10 p-2.5 text-xs text-fail"
          >
            {errorMessage}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-carbon-700 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-11 rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400"
          >
            กลับไปแก้ไข
          </button>
          <button
            type="button"
            onClick={handleSubmitClick}
            disabled={isSubmitting}
            className="h-11 rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 px-5 text-sm font-semibold text-carbon-900 disabled:opacity-50"
          >
            {isSubmitting ? "กำลังบันทึก…" : "บันทึกผลการตรวจ"}
          </button>
        </div>
      </div>
    </div>
  );
}
