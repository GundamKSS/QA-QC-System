"use client";

import { useId, useState } from "react";
import {
  DISPOSITION_LABELS,
  isItemDone,
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
  const defaultDecision = evaluation.forcedAction ?? evaluation.suggestedAction ?? "REWORK";
  const [userDecision, setUserDecision] = useState<UnitAction | null>(null);
  const decision = userDecision ?? defaultDecision;

  if (!isOpen) return null;

  const isPass = evaluation.result === "PASS";
  const isConcession = evaluation.result === "CONCESSION";
  const isNotPassed = evaluation.result === "NOT_PASSED";
  const isForcedReject = evaluation.forcedAction === "REJECT";

  const totalRequired = items.filter((i) => i.isRequired).length;
  const totalAnswered = items.filter(
    (i) => i.isRequired && isItemDone(i, answers[i.id]),
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

        {/* Checked Items Summary List (Pass checkmark + Topic name) */}
        <div className="space-y-2 border-t border-carbon-700 pt-3">
          <h3 className="text-xs font-semibold text-ti-300 uppercase">
            รายการหัวข้อที่ตรวจเช็ค ({items.length})
          </h3>
          <ul className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {items.map((it) => {
              const ans = answers[it.id];
              const isItemPass = ans?.status === "NORMAL";
              const isItemFail = ans?.status === "FAIL";
              const isCompleted = isItemDone(it, ans);
              const isDoneNonFail = isCompleted && !isItemFail;
              return (
                <li
                  key={it.id}
                  className="rounded-control border border-carbon-700 bg-carbon-900/60 px-2.5 py-2 text-xs flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      aria-hidden="true"
                      className={`shrink-0 flex items-center justify-center size-5 rounded-full text-[11px] font-bold ${
                        isItemPass || isDoneNonFail
                          ? "bg-pass/20 text-pass border border-pass/50"
                          : isItemFail
                          ? "bg-fail/20 text-fail border border-fail/50"
                          : "bg-carbon-800 text-ti-400 border border-carbon-600"
                      }`}
                    >
                      {isItemPass || isDoneNonFail ? "✓" : isItemFail ? "✕" : "•"}
                    </span>
                    <span className="font-medium text-ti-100 truncate">
                      {it.seq}. {it.title}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-[10px] font-semibold px-2 py-0.5 rounded ${
                      isItemPass
                        ? "bg-pass/15 text-pass"
                        : isItemFail
                        ? "bg-fail/15 text-fail"
                        : isDoneNonFail
                        ? "bg-pass/15 text-pass"
                        : "bg-carbon-800 text-ti-300"
                    }`}
                  >
                    {isItemPass
                      ? "ผ่าน"
                      : isItemFail
                      ? "ไม่ผ่าน"
                      : ans?.value
                      ? `${ans.value}${it.inputType === "NUMBER" ? " Bar" : ""}`
                      : isCompleted
                      ? "ตรวจแล้ว"
                      : "ยังไม่ตรวจ"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Defect Finding Breakdown (if any) */}
        {evaluation.allDefects.length > 0 && (
          <div className="space-y-2 border-t border-carbon-700 pt-3">
            <h3 className="text-xs font-semibold text-ti-300 uppercase">
              อาการที่ตรวจพบ ({evaluation.allDefects.length})
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
              การจัดการเครื่องที่ไม่ผ่าน <span className="text-fail">*</span>
            </label>

            {isForcedReject ? (
              <p className="rounded-control border border-fail/60 bg-fail/10 p-2.5 text-xs text-fail">
                พบอาการระดับวิกฤต — บังคับคัดออก (Reject)
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUserDecision("REWORK")}
                    aria-pressed={decision === "REWORK"}
                    className={`h-11 rounded-control text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                      decision === "REWORK"
                        ? "border-ember-500 bg-ember-500 text-carbon-900 font-bold ring-2 ring-ember-500/30"
                        : "border-carbon-600 bg-carbon-900 text-ti-300 hover:border-carbon-500 hover:text-ti-100"
                    }`}
                  >
                    <span className="text-sm">{decision === "REWORK" ? "●" : "○"}</span>
                    <span>{UNIT_ACTION_LABELS.REWORK} (Rework)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserDecision("REJECT")}
                    aria-pressed={decision === "REJECT"}
                    className={`h-11 rounded-control text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                      decision === "REJECT"
                        ? "border-fail bg-fail text-carbon-900 font-bold ring-2 ring-fail/30"
                        : "border-carbon-600 bg-carbon-900 text-ti-300 hover:border-carbon-500 hover:text-ti-100"
                    }`}
                  >
                    <span className="text-sm">{decision === "REJECT" ? "●" : "○"}</span>
                    <span>{UNIT_ACTION_LABELS.REJECT} (Reject)</span>
                  </button>
                </div>
                <p className="text-[11px] text-ti-400 text-center">
                  เลือกผลการจัดการด้านบน แล้วกดปุ่มยืนยันด้านล่างเพื่อบันทึก
                </p>
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
            className="h-11 rounded-control app-primary-action bg-green-500 hover:bg-emerald-600 px-5 text-sm font-semibold text-carbon-900 disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting
              ? "กำลังบันทึก…"
              : isNotPassed
              ? decision === "REWORK"
                ? "ยืนยันส่งซ่อม (Rework)"
                : "ยืนยันคัดออก (Reject)"
              : "บันทึกผลการตรวจ"}
          </button>
        </div>
      </div>
    </div>
  );
}

