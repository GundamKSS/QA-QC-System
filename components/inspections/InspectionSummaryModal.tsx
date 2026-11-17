"use client";

import { useId, useState } from "react";
import { triggerHaptic } from "@/lib/inspections/haptics";
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
  role,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: Props) {
  const id = useId();
  const [submittingAction, setSubmittingAction] = useState<UnitAction | null>(null);
  const [showAllItems, setShowAllItems] = useState(false);

  if (!isOpen) return null;

  const isPass = evaluation.result === "PASS";
  const isConcession = evaluation.result === "CONCESSION";
  const isNotPassed = evaluation.result === "NOT_PASSED";
  const hasCriticalDefect = evaluation.allDefects.some((d) => d.severity === "CRITICAL");
  const isQa = role === "QA";

  const totalRequired = items.filter((i) => i.isRequired).length;
  const totalAnswered = items.filter(
    (i) => i.isRequired && isItemDone(i, answers[i.id]),
  ).length;

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
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ti-300 uppercase">
              รายการหัวข้อที่ตรวจเช็ค ({items.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowAllItems(!showAllItems)}
              className="text-[11px] text-ember-400 hover:text-ember-300 underline underline-offset-2 transition-colors cursor-pointer"
            >
              {showAllItems ? "ซ่อนรายการ ▲" : "ดูทุกหัวข้อ ▼"}
            </button>
          </div>

          {/* Quick 1-line status banner when collapsed to keep screen compact */}
          {!showAllItems && (
            <div
              className={`rounded-control border px-3 py-2 text-xs flex items-center justify-between ${
                isPass
                  ? "border-pass/40 bg-pass/10 text-pass"
                  : "border-carbon-700 bg-carbon-900/60 text-ti-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex size-5 items-center justify-center rounded-full font-bold text-xs ${
                    isPass ? "bg-pass text-carbon-900" : "bg-carbon-800 text-ti-300"
                  }`}
                >
                  {isPass ? "✓" : "•"}
                </span>
                <span>
                  {isPass
                    ? `ตรวจผ่านครบทั้ง ${items.length} หัวข้อสมบูรณ์`
                    : `ตรวจครบ ${totalAnswered}/${totalRequired} หัวข้อบังคับ`}
                </span>
              </div>
            </div>
          )}

          {showAllItems && (
            <ul className="space-y-1.5 max-h-44 overflow-y-auto pr-1 animate-slide-up">
              {items.map((it) => {
                const ans = answers[it.id];
                const isItemPass = ans?.status === "NORMAL";
                const isItemFail = ans?.status === "FAIL";
                const isItemNA = ans?.status === "NA";
                const isCompleted = isItemDone(it, ans);
                const isDoneNonFail = isCompleted && !isItemFail && !isItemNA;
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
                            : isItemNA
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/50"
                            : isItemFail
                            ? "bg-fail/20 text-fail border border-fail/50"
                            : "bg-carbon-800 text-ti-400 border border-carbon-600"
                        }`}
                      >
                        {isItemPass || isDoneNonFail ? "✓" : isItemNA ? "⊘" : isItemFail ? "✕" : "•"}
                      </span>
                      <span className="font-medium text-ti-100 truncate">
                        {it.seq}. {it.title}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-[10px] font-semibold px-2 py-0.5 rounded ${
                        isItemPass
                          ? "bg-pass/15 text-pass"
                          : isItemNA
                          ? "bg-amber-500/15 text-amber-300"
                          : isItemFail
                          ? "bg-fail/15 text-fail"
                          : isDoneNonFail
                          ? "bg-pass/15 text-pass"
                          : "bg-carbon-800 text-ti-300"
                      }`}
                    >
                      {isItemPass
                        ? "Pass"
                        : isItemNA
                        ? "N/A"
                        : isItemFail
                        ? "NG"
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
          )}
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
                  className="rounded-control border border-carbon-700 bg-carbon-900/60 p-2.5 text-xs flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-ti-50 block truncate">{d.nameTh}</span>
                    {d.part && (
                      <span className="text-ti-300 text-[11px] block mt-0.5">
                        ชิ้นส่วน: <strong className="text-ti-100 font-medium">{d.part}</strong>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] font-semibold">
                    <span
                      className={`px-2 py-0.5 rounded-md border ${
                        d.severity === "CRITICAL"
                          ? "border-fail/50 bg-fail/15 text-fail"
                          : d.severity === "MAJOR"
                          ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "border-carbon-600 bg-carbon-800 text-ti-100"
                      }`}
                    >
                      {SEVERITY_LABELS[d.severity]}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border ${
                        d.disposition === "REJECT"
                          ? "border-fail/50 bg-fail/15 text-fail"
                          : d.disposition === "REWORK"
                          ? "border-ember-500/50 bg-ember-500/15 text-ember-600 dark:text-ember-400"
                          : "border-pass/50 bg-pass/15 text-pass"
                      }`}
                    >
                      {DISPOSITION_LABELS[d.disposition]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Decision note on NOT_PASSED */}
        {isNotPassed && (
          <div className="border-t border-carbon-700 pt-3">
            {isQa ? (
              <p className="rounded-control border border-fail/60 bg-fail/10 p-2.5 text-xs text-fail font-medium">
                สำหรับฝ่าย QA — หากพบข้อบกพร่องให้กดคัดออกเพื่อส่งกลับ QC
              </p>
            ) : (
              <div className="space-y-2">
                {hasCriticalDefect && (
                  <p className="rounded-control border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300 font-medium">
                    ⚠️ พบอาการระดับวิกฤต — ระบบเสนอให้คัดออก (Reject) แต่สามารถเลือกส่งซ่อม (Rework) ได้ตามดุลยพินิจ
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-ti-300 font-medium">
                  <span className="text-ti-400">การจัดการเครื่อง:</span>
                  {evaluation.suggestedAction ? (
                    <span>
                      ระบบเสนอ:{" "}
                      <strong
                        className={
                          evaluation.suggestedAction === "REWORK"
                            ? "text-ember-600 dark:text-ember-400 font-bold"
                            : "text-fail font-bold"
                        }
                      >
                        {evaluation.suggestedAction === "REWORK"
                          ? `${UNIT_ACTION_LABELS.REWORK} (Rework)`
                          : `${UNIT_ACTION_LABELS.REJECT} (Reject)`}
                      </strong>
                    </span>
                  ) : (
                    <span className="text-ti-400">
                      เลือกส่งซ่อมหรือคัดออกที่ปุ่มด้านล่าง
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-control border border-fail/60 bg-fail/10 p-2.5 text-xs text-fail font-medium"
          >
            {errorMessage}
          </div>
        )}

        {/* Footer Actions (1-Click Decision Flow) */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-carbon-700 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-11 rounded-control border border-carbon-600 bg-carbon-800 px-4 text-xs font-semibold text-ti-100 hover:border-ti-400 hover:text-ti-50 transition-colors cursor-pointer text-center"
          >
            กลับไปแก้ไข
          </button>

          {isNotPassed ? (
            isQa ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("complete");
                  setSubmittingAction("REJECT");
                  onSubmit("REJECT");
                }}
                disabled={isSubmitting}
                className="h-11 rounded-control bg-fail hover:bg-fail/90 px-5 text-sm font-bold text-white disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {isSubmitting && submittingAction === "REJECT"
                  ? "กำลังบันทึก…"
                  : `${UNIT_ACTION_LABELS.REJECT} (Reject)`}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("complete");
                    setSubmittingAction("REJECT");
                    onSubmit("REJECT");
                  }}
                  disabled={isSubmitting}
                  className={`h-11 rounded-control px-4 text-xs font-bold transition-colors cursor-pointer ${
                    evaluation.suggestedAction === "REJECT"
                      ? "bg-fail hover:bg-fail/90 text-white shadow-sm"
                      : "border border-fail/60 bg-fail/10 hover:bg-fail/20 text-fail"
                  }`}
                >
                  {isSubmitting && submittingAction === "REJECT"
                    ? "กำลังบันทึก…"
                    : `${UNIT_ACTION_LABELS.REJECT} (Reject)`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("complete");
                    setSubmittingAction("REWORK");
                    onSubmit("REWORK");
                  }}
                  disabled={isSubmitting}
                  className={`h-11 rounded-control px-5 text-sm font-bold transition-all shadow-sm cursor-pointer ${
                    evaluation.suggestedAction === "REWORK"
                      ? "app-primary-action bg-ember-500 hover:bg-ember-400 text-white ring-2 ring-ember-400/30"
                      : "border border-ember-500/60 bg-ember-500/10 hover:bg-ember-500/20 text-ember-600 dark:text-ember-400"
                  }`}
                >
                  {isSubmitting && submittingAction === "REWORK"
                    ? "กำลังบันทึก…"
                    : `${UNIT_ACTION_LABELS.REWORK} (Rework) ❯`}
                </button>
              </>
            )
          ) : (
            <button
              type="button"
              onClick={() => {
                triggerHaptic("complete");
                onSubmit(null);
              }}
              disabled={isSubmitting}
              className="h-11 rounded-control app-primary-action bg-pass hover:bg-pass/90 px-6 text-sm font-bold text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? "กำลังบันทึก…" : "เสร็จสิ้น · บันทึกผลการตรวจ ✓"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

