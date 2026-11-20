"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  cancelClaimApi,
  fetchInspectionTemplate,
  submitInspectionApi,
} from "@/lib/inspections/client";
import { getOfflineInspection, useNetworkSync } from "@/lib/inspections/offline-sync";
import { triggerHaptic } from "@/lib/inspections/haptics";
import {
  areAllItemsDone,
  canJumpToStep,
  evalUnitResult,
  isItemDone,
  maxUnlockedStepIndex,
  stepAdvanceBlockReason,
} from "@/lib/inspections/rules";
import type {
  InspectionTemplateData,
  StoredInspection,
} from "@/lib/inspections/store";
import type { ItemAnswer, UnitAction } from "@/lib/inspections/types";
import { ChecklistItemCard } from "@/components/inspections/ChecklistItemCard";
import { InspectionSummaryModal } from "@/components/inspections/InspectionSummaryModal";
import { StepPillsTrack } from "@/components/inspections/StepPillsTrack";
import { RunnerActionDock } from "@/components/inspections/RunnerActionDock";
import { useReducedMotion } from "@/lib/hooks/useBrowserState";

type Props = {
  id: string;
  initialInspection: StoredInspection | null;
  initialTemplate?: InspectionTemplateData | null;
};

function getEmptySnapshot(): string {
  return "{}";
}

function subscribeStorage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/**
 * Screen S06: Unified Mobile-First Inspection Runner & Checklist View.
 * Matches the single-card mobile layout with top `<` back / `ยกเลิกตรวจ` actions,
 * centered Serial & step progress, minimalist vector animation, and bottom sticky Pass/Fail buttons.
 */
export function InspectionRunnerView({
  id,
  initialInspection,
  initialTemplate,
}: Props) {
  useNetworkSync();
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const inspection = initialInspection ?? getOfflineInspection(id);
  const [template, setTemplate] = useState<InspectionTemplateData | null>(
    initialTemplate ?? null,
  );
  const [loadingTemplate, setLoadingTemplate] = useState(!initialTemplate);

  const draftKey = `qcheck_draft_${id}`;
  const rawDraft = useSyncExternalStore(
    subscribeStorage,
    () => (typeof window === "undefined" ? "{}" : (localStorage.getItem(draftKey) ?? "{}")),
    getEmptySnapshot,
  );
  const savedDraft = useMemo(() => {
    try {
      const parsed = JSON.parse(rawDraft);
      return parsed && typeof parsed === "object" ? (parsed as Record<number, ItemAnswer>) : {};
    } catch {
      return {};
    }
  }, [rawDraft]);
  const savedDraftRef = useRef(savedDraft);
  useEffect(() => {
    savedDraftRef.current = savedDraft;
  }, [savedDraft]);

  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [slideDir, setSlideDir] = useState<"next" | "prev">("next");
  const [userEdits, setUserEdits] = useState<Record<number, ItemAnswer>>({});
  const answers = useMemo(() => ({ ...savedDraft, ...userEdits }), [savedDraft, userEdits]);
  const activeIndex = useMemo(() => {
    if (currentIndex !== null) return currentIndex;
    if (!template || template.items.length === 0) return 0;
    return maxUnlockedStepIndex(template.items, savedDraft);
  }, [currentIndex, template, savedDraft]);
  const [maxConfirmedIndex, setMaxConfirmedIndex] = useState<number>(() => {
    if (!template || template.items.length === 0) return 0;
    let confirmed = 0;
    for (let i = 0; i < template.items.length; i++) {
      const it = template.items[i];
      const ans = savedDraft[it.id];
      if (isItemDone(it, ans)) {
        confirmed = Math.min(template.items.length - 1, i + 1);
      } else {
        break;
      }
    }
    return confirmed;
  });
  const maxUnlocked = useMemo(() => {
    if (!template?.items || template.items.length === 0) return 0;
    return Math.min(maxConfirmedIndex, maxUnlockedStepIndex(template.items, answers));
  }, [template, answers, maxConfirmedIndex]);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [blockExiting, setBlockExiting] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const dismissBlock = useCallback(() => {
    setBlockExiting(true);
    window.setTimeout(() => {
      setBlockMessage(null);
      setBlockExiting(false);
    }, 300);
  }, []);

  // Auto-dismiss step jump / leave guard alert banner after 5 seconds with smooth fade-out
  useEffect(() => {
    if (!blockMessage) return;
    const fadeTimer = window.setTimeout(() => {
      setBlockExiting(true);
    }, 4700);

    const removeTimer = window.setTimeout(() => {
      setBlockMessage(null);
      setBlockExiting(false);
    }, 5000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [blockMessage]);

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
          let confirmed = 0;
          for (let i = 0; i < data.items.length; i++) {
            const it = data.items[i];
            const ans = savedDraftRef.current[it.id];
            if (isItemDone(it, ans)) {
              confirmed = Math.min(data.items.length - 1, i + 1);
            } else {
              break;
            }
          }
          setMaxConfirmedIndex(confirmed);
        }
      } catch {
        // Fallback handled below
      } finally {
        if (!cancelled) setLoadingTemplate(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [inspection, template]);

  // 2. Listen for TopAppBar `พัก / ยกเลิกตรวจ` action
  useEffect(() => {
    function onCancel() {
      setConfirmCancel(true);
    }

    window.addEventListener("qcheck:runner-cancel", onCancel);
    return () => {
      window.removeEventListener("qcheck:runner-cancel", onCancel);
    };
  }, []);

  function handleAnswerChange(itemId: number, answer: ItemAnswer) {
    const updated = {
      ...answers,
      [itemId]: answer,
    };
    setUserEdits((prev) => ({ ...prev, [itemId]: answer }));
    setBlockMessage(null);
    try {
      localStorage.setItem(draftKey, JSON.stringify(updated));
    } catch {
      // Ignore quota errors
    }
  }

  function handleClearDraft() {
    setUserEdits({});
    setCurrentIndex(0);
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Ignore
    }
  }

  function handlePauseInspection() {
    try {
      localStorage.setItem(draftKey, JSON.stringify(answers));
    } catch {
      // Ignore
    }
    router.push(inspection?.role === "QA" ? "/qa-queue" : "/jobs");
  }

  async function handleReleaseClaim() {
    if (!inspection) return;
    setCancelling(true);
    try {
      await cancelClaimApi(inspection.id);
      handleClearDraft();
      router.push(inspection.role === "QA" ? "/qa-queue" : "/jobs");
    } catch {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  if (!inspection) {
    return (
      <div className="min-w-0 w-full space-y-5 p-4 sm:p-6 max-w-xl mx-auto">
        <div className="rounded-3xl border border-carbon-700 bg-carbon-800 p-6 space-y-3 text-center">
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
      <div className="min-w-0 w-full space-y-4 p-4 sm:p-6 max-w-xl mx-auto">
        <div className="rounded-3xl border border-carbon-700 bg-carbon-800 p-12 text-center text-ti-400 text-sm">
          กำลังโหลดแบบตรวจ…
        </div>
      </div>
    );
  }

  const items = template.items;
  const total = items.length;
  const currentItem = items[activeIndex] ?? items[0];
  const currentAnswer = currentItem ? answers[currentItem.id] : undefined;
  const isLast = activeIndex === total - 1;
  const isCurrentStepDone = currentItem ? isItemDone(currentItem, currentAnswer) : false;

  const answeredCount = items.filter((item) => isItemDone(item, answers[item.id])).length;
  const percent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const allDone = areAllItemsDone(items, answers);
  const effectiveSummaryOpen =
    isSummaryOpen || (allDone && !summaryDismissed && currentAnswer?.status !== "FAIL");

  const evaluation = evalUnitResult(items, answers, { role: inspection.role });

  function handleSelectStep(targetIndex: number) {
    if (targetIndex === activeIndex) return;
    const check = canJumpToStep(items, answers, activeIndex, targetIndex, { maxUnlocked });
    if (!check.allowed) {
      triggerHaptic("warn");
      setBlockMessage(check.reason);
      return;
    }
    triggerHaptic("tap");
    setBlockMessage(null);
    setSlideDir(targetIndex > activeIndex ? "next" : "prev");
    setCurrentIndex(targetIndex);
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  function advanceOrOpenSummary(updatedAnswers: Record<number, ItemAnswer | undefined>) {
    const nextIdx = activeIndex + 1;
    setMaxConfirmedIndex((prev) => Math.max(prev, nextIdx));
    if (isLast || areAllItemsDone(items, updatedAnswers)) {
      triggerHaptic("complete");
      setSummaryDismissed(false);
      setIsSummaryOpen(true);
    } else {
      triggerHaptic("tap");
      setSlideDir("next");
      setCurrentIndex(nextIdx);
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    }
  }

  function handleNext() {
    if (!currentItem) return;

    const reason = stepAdvanceBlockReason(currentItem, currentAnswer);
    if (reason) {
      triggerHaptic("warn");
      setBlockMessage(reason);
      return;
    }

    setBlockMessage(null);
    advanceOrOpenSummary(answers);
  }

  function handleSelectPass() {
    if (!currentItem) return;
    const nextAnswer: ItemAnswer = {
      status: "NORMAL",
      value: currentAnswer?.value ?? null,
      defects: [],
      photos: [],
      video: null,
      remark: "",
    };
    const updatedAnswers = { ...answers, [currentItem.id]: nextAnswer };
    handleAnswerChange(currentItem.id, nextAnswer);

    // If no additional evidence (e.g. mandatory video/photo) blocks this step, advance smoothly
    const blockReason = stepAdvanceBlockReason(currentItem, nextAnswer);
    if (!blockReason) {
      advanceOrOpenSummary(updatedAnswers);
    } else {
      triggerHaptic("warn");
      setBlockMessage(blockReason);
    }
  }

  function handleSelectFail() {
    if (!currentItem) return;
    // A second tap confirms a completed failure without adding a separate Next button.
    if (currentAnswer?.status === "FAIL") {
      handleNext();
      return;
    }
    triggerHaptic("warn");
    const nextAnswer: ItemAnswer = {
      ...currentAnswer,
      status: "FAIL",
    };
    handleAnswerChange(currentItem.id, nextAnswer);
  }

  function handleSelectNA() {
    if (!currentItem) return;
    const nextAnswer: ItemAnswer = {
      status: "NA",
      defects: [],
      photos: [],
      video: null,
      remark: "N/A - ไม่มีชิ้นส่วนนี้ในรุ่นนี้",
    };
    const updatedAnswers = { ...answers, [currentItem.id]: nextAnswer };
    handleAnswerChange(currentItem.id, nextAnswer);

    setBlockMessage(null);
    advanceOrOpenSummary(updatedAnswers);
  }

  function handleQuickPresetSelect(preset: string) {
    if (!currentItem) return;
    const nextAnswer: ItemAnswer = {
      ...currentAnswer,
      status: currentAnswer?.status ?? "NORMAL",
      value: preset,
    };
    const updatedAnswers = { ...answers, [currentItem.id]: nextAnswer };
    handleAnswerChange(currentItem.id, nextAnswer);

    const blockReason = stepAdvanceBlockReason(currentItem, nextAnswer);
    if (!blockReason) {
      advanceOrOpenSummary(updatedAnswers);
    } else {
      triggerHaptic("tap");
    }
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
        router.push(inspection.role === "QA" ? "/qa-queue" : "/jobs");
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
    // A transformed page entrance would anchor fixed controls to the card instead of the viewport.
    <div style={{ animation: "none" }} className="min-w-0 w-full max-w-xl mx-auto flex flex-col min-h-[calc(100dvh-8.5rem)] p-2 sm:p-5 pb-[calc(13rem+env(safe-area-inset-bottom))] sm:pb-[calc(13rem+env(safe-area-inset-bottom))] gap-3">
      {/* Main Unified Inspection Card */}
      <div className="rounded-3xl border border-carbon-700 bg-carbon-800 p-4 sm:p-6 space-y-3 shadow-sm">
        {/* 1. Unified Work Order, Progress Counter & Serial Header */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs font-mono">
            <span className="font-bold text-ember-500 truncate">
              {inspection.workOrderId
                ? `ใบงาน ${inspection.workOrderId.slice(0, 18).toUpperCase()}`
                : `แผนตรวจ #${inspection.planId}`}
            </span>
            <span className="text-ti-300 shrink-0">
              สำเร็จ {answeredCount}/{total} ({percent}%)
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-mono text-ti-50 text-center tracking-tight">
            Serial {inspection.serialPump}
          </h1>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-carbon-900">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ember-500 to-pass transition-all duration-300"
              style={{ width: `${Math.max(4, percent)}%` }}
            />
          </div>
        </div>

        {/* 2. Step Navigation Pills [ 1 ✓ ] - [ 2 ✓ ] - [ 3 ] - [ 4 ] - [ 5 ] */}
        <div className="sticky top-16 z-10 -mx-2 rounded-2xl border border-carbon-700/70 bg-carbon-800/95 px-2 py-1 backdrop-blur-md">
          <StepPillsTrack
            items={items}
            answers={answers}
            currentIndex={activeIndex}
            maxUnlockedIndex={maxUnlocked}
            onSelectStep={handleSelectStep}
            onBlockedJump={(reason) => setBlockMessage(reason)}
          />
        </div>

        {/* Step Guard / Leave Block Alert Banner */}
        {blockMessage && (
          <div
            role="alert"
            className={`sticky top-44 z-10 rounded-xl border border-fail/60 bg-carbon-800 p-3 text-xs font-medium text-fail shadow-sm flex items-center justify-between gap-2 transition-all duration-300 ease-out ${
              blockExiting
                ? "opacity-0 -translate-y-2 pointer-events-none"
                : "opacity-100 translate-y-0 animate-slide-up"
            }`}
          >
            <span>{blockMessage}</span>
            <button
              type="button"
              onClick={dismissBlock}
              className="shrink-0 text-fail/80 hover:text-fail px-1 cursor-pointer"
              aria-label="ปิดข้อความแจ้งเตือน"
            >
              ✕
            </button>
          </div>
        )}

        {/* 3. Step Animation + Question + Defect Selector / Evidence with Slide Animation */}
        {currentItem && (
          <div
            key={currentItem.id}
            id="inspection-step-panel"
            role="region"
            aria-label={`ขั้นตอนที่ ${activeIndex + 1}: ${currentItem.title}`}
            className={`motion-reduce:animate-none ${slideDir === "next" ? "animate-slide-next" : "animate-slide-prev"}`}
          >
            <ChecklistItemCard
              item={currentItem}
              totalSteps={total}
              answer={currentAnswer}
              availableDefects={template.itemDefects[currentItem.id] ?? []}
              modelCode={template.modelCode}
              pressureSpecs={{
                start: template.pressureStartBar,
                stop: template.pressureStopBar,
                isConcession: template.isPressureConcession,
              }}
              onAnswerChange={(ans) => handleAnswerChange(currentItem.id, ans)}
              onQuickPresetSelect={handleQuickPresetSelect}
            />
          </div>
        )}
      </div>

      {currentItem && (
        <RunnerActionDock
          key={currentItem.id}
          item={currentItem}
          answer={currentAnswer}
          isDone={isCurrentStepDone}
          allDone={allDone}
          isLast={isLast}
          onPass={handleSelectPass}
          onFail={handleSelectFail}
          onNA={handleSelectNA}
          onConfirm={handleNext}
          onSummary={() => {
            triggerHaptic("complete");
            setSummaryDismissed(false);
            setIsSummaryOpen(true);
          }}
        />
      )}

      {/* Confirmation Dialog for Leaving / Pausing ("ยกเลิกตรวจ") */}
      {confirmCancel && (
        <div
          role="alertdialog"
          aria-labelledby="cancel-claim-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-carbon-600 bg-carbon-800 p-5 space-y-4 shadow-xl">
            <h2 id="cancel-claim-title" className="text-base font-bold text-ti-50">
              พักการตรวจ (บันทึกร่าง)?
            </h2>
            <p className="text-xs text-ti-200 leading-relaxed">
              ระบบบันทึกข้อมูลและรูปถ่ายที่ตรวจไว้แล้ว คุณสามารถกลับมาตรวจเครื่อง{" "}
              <span className="font-mono font-medium text-ember-400">
                {inspection.serialPump}
              </span>{" "}
              ต่อได้จากหน้ารวมงาน
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="h-10 rounded-xl border border-ti-600 px-3.5 text-xs text-ti-200 hover:border-ti-400"
              >
                ตรวจต่อ
              </button>
              <button
                type="button"
                onClick={handlePauseInspection}
                className="h-10 rounded-xl bg-ember-500 hover:bg-ember-400 px-4 text-xs font-semibold text-white shadow-sm"
              >
                บันทึกร่าง & กลับหน้ารวมงาน
              </button>
            </div>
            <div className="pt-2 border-t border-carbon-700/60 text-center">
              <button
                type="button"
                onClick={handleReleaseClaim}
                disabled={cancelling}
                className="text-[11px] text-fail/80 hover:text-fail underline underline-offset-2"
              >
                {cancelling ? "กำลังคืนเครื่อง…" : "ยกเลิกและคืนเครื่องนี้เข้าใบงาน"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen S07 Summary & Decision Modal */}
      <InspectionSummaryModal
        isOpen={effectiveSummaryOpen}
        evaluation={evaluation}
        items={items}
        answers={answers}
        role={inspection.role}
        isSubmitting={isSubmitting}
        errorMessage={submitError}
        onClose={() => {
          setIsSummaryOpen(false);
          setSummaryDismissed(true);
        }}
        onSubmit={handleSubmitInspection}
      />
    </div>
  );
}
