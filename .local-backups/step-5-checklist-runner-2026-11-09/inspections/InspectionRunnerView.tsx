"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchInspectionTemplate, submitInspectionApi } from "@/lib/inspections/client";
import { getOfflineInspection, useNetworkSync } from "@/lib/inspections/offline-sync";
import { evalUnitResult, leaveBlockReason } from "@/lib/inspections/rules";
import type {
  InspectionTemplateData,
  StoredInspection,
} from "@/lib/inspections/store";
import type { ItemAnswer, UnitAction } from "@/lib/inspections/types";
import { ChecklistItemCard } from "./ChecklistItemCard";
import { InspectionSummaryModal } from "./InspectionSummaryModal";
import { RunnerHeader } from "./RunnerHeader";
import { RunnerStepper } from "./RunnerStepper";

type Props = {
  id: string;
  initialInspection: StoredInspection | null;
  initialTemplate?: InspectionTemplateData | null;
};

/**
 * Screen S06: Inspection Runner & Checklist View.
 * Item-by-item runner with auto-save draft, evidence enforcement (BR-05),
 * and machine evaluation review (BR-04).
 */
export function InspectionRunnerView({
  id,
  initialInspection,
  initialTemplate,
}: Props) {
  useNetworkSync();
  const router = useRouter();

  const inspection = initialInspection ?? getOfflineInspection(id);
  const [template, setTemplate] = useState<InspectionTemplateData | null>(
    initialTemplate ?? null,
  );
  const [loadingTemplate, setLoadingTemplate] = useState(!initialTemplate);

  const draftKey = `qcheck_draft_${id}`;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, ItemAnswer>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    } catch {
      // Ignore
    }
    return {};
  });
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 1. Load template if not provided server-side
  useEffect(() => {
    if (template || !inspection) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchInspectionTemplate(
          inspection!.planId,
          inspection!.role,
        );
        if (!cancelled) {
          setTemplate(data);
        }
      } catch {
        // Fallback or error handled below
      } finally {
        if (!cancelled) setLoadingTemplate(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [inspection, template]);

  // 2. Save draft to localStorage whenever answers change
  function handleAnswerChange(itemId: number, answer: ItemAnswer) {
    const updated = {
      ...answers,
      [itemId]: answer,
    };
    setAnswers(updated);
    setBlockMessage(null);
    try {
      localStorage.setItem(draftKey, JSON.stringify(updated));
    } catch {
      // Ignore quota errors
    }
  }

  function handleClearDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Ignore
    }
  }

  if (!inspection) {
    return (
      <div className="min-w-0 w-full space-y-5 p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="rounded-panel border border-carbon-700 bg-carbon-800 p-6 space-y-3 text-center">
          <h1 className="text-base font-medium text-ti-100">ไม่พบรายการตรวจนี้</h1>
          <p className="text-xs text-ti-400">
            อาจถูกยกเลิกแล้ว หรือยังไม่ได้บันทึกลงในระบบ
          </p>
          <Link
            href="/jobs"
            className="inline-flex rounded-control border border-ti-600 bg-carbon-800 px-3 py-1.5 text-xs text-ti-200 hover:border-ti-400"
          >
            กลับหน้ารวมงาน
          </Link>
        </div>
      </div>
    );
  }

  if (loadingTemplate || !template) {
    return (
      <div className="min-w-0 w-full space-y-5 p-4 sm:p-6 max-w-4xl mx-auto">
        <RunnerHeader
          inspection={inspection}
          hasUnsavedAnswers={Object.keys(answers).length > 0}
          onClearDraft={handleClearDraft}
        />
        <div className="rounded-panel border border-carbon-700 bg-carbon-800 p-12 text-center text-ti-400 text-sm">
          กำลังโหลดแบบตรวจ…
        </div>
      </div>
    );
  }

  const items = template.items;
  const currentItem = items[currentIndex] ?? items[0];
  const currentAnswer = currentItem ? answers[currentItem.id] : undefined;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === items.length - 1;

  // Evaluate BR-04 outcome live for the summary modal
  const evaluation = evalUnitResult(items, answers, { role: inspection.role });

  function handlePrev() {
    setBlockMessage(null);
    if (!isFirst) {
      setCurrentIndex((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleNext() {
    if (!currentItem) return;

    // AC FR-QC-04/05/06: Block leaving FAIL item without defect or photo
    const reason = leaveBlockReason(currentItem, currentAnswer);
    if (reason) {
      setBlockMessage(reason);
      return;
    }

    setBlockMessage(null);
    if (!isLast) {
      setCurrentIndex((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setIsSummaryOpen(true);
    }
  }

  function handleSelectIndex(targetIndex: number) {
    if (!currentItem || targetIndex === currentIndex) return;

    // Check leave block for current item before jumping
    const reason = leaveBlockReason(currentItem, currentAnswer);
    if (reason) {
      setBlockMessage(reason);
      return;
    }

    setBlockMessage(null);
    setCurrentIndex(targetIndex);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmitInspection(decision: UnitAction | null) {
    if (!inspection) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await submitInspectionApi(inspection.id, {
        planId: inspection.planId,
        workOrderId: inspection.workOrderId ?? "",
        role: inspection.role,
        answers,
        decision,
      });

      if (res.status === "done") {
        handleClearDraft();
        setIsSummaryOpen(false);
        router.push("/jobs");
      } else {
        setSubmitError(res.message || "ไม่สามารถบันทึกผลการตรวจได้");
      }
    } catch {
      setSubmitError("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-w-0 w-full space-y-4 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header & Status */}
      <RunnerHeader
        inspection={inspection}
        hasUnsavedAnswers={Object.keys(answers).length > 0}
        onClearDraft={handleClearDraft}
      />

      {/* Stepper Bar */}
      <RunnerStepper
        items={items}
        answers={answers}
        currentIndex={currentIndex}
        onSelectIndex={handleSelectIndex}
      />

      {/* Leave Block Alert Banner */}
      {blockMessage && (
        <div
          role="alert"
          className="rounded-control border border-fail/60 bg-fail/10 p-3 text-xs text-fail"
        >
          {blockMessage}
        </div>
      )}

      {/* Current Checklist Item Card */}
      {currentItem && (
        <ChecklistItemCard
          key={currentItem.id}
          item={currentItem}
          answer={currentAnswer}
          availableDefects={template.itemDefects[currentItem.id] ?? []}
          onAnswerChange={(ans) => handleAnswerChange(currentItem.id, ans)}
        />
      )}

      {/* Navigation & Summary Footer Controls */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={handlePrev}
          disabled={isFirst}
          className="h-11 rounded-control border border-ti-600 bg-carbon-800 px-4 text-xs font-medium text-ti-200 hover:border-ti-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ก่อนหน้า
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSummaryOpen(true)}
            className="h-11 rounded-control border border-carbon-600 bg-carbon-800 px-3.5 text-xs text-ti-300 hover:border-ti-400 hover:text-ti-100 transition-colors"
          >
            ตรวจทานผล
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="h-11 rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 px-5 text-xs font-semibold text-carbon-900 transition-colors shadow-sm"
          >
            {isLast ? "สรุปผลตรวจ" : "ถัดไป"}
          </button>
        </div>
      </div>

      {/* Screen S07 Summary & Decision Modal */}
      <InspectionSummaryModal
        isOpen={isSummaryOpen}
        evaluation={evaluation}
        items={items}
        answers={answers}
        role={inspection.role}
        isSubmitting={isSubmitting}
        errorMessage={submitError}
        onClose={() => setIsSummaryOpen(false)}
        onSubmit={handleSubmitInspection}
      />
    </div>
  );
}
