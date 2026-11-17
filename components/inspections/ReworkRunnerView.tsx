"use client";

import { AppBack } from "@/components/ui/AppBack";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DefectSelector, COMMON_STANDARD_DEFECTS } from "@/components/inspections/DefectSelector";
import { EvidenceCapture } from "@/components/inspections/EvidenceCapture";
import { triggerHaptic } from "@/lib/inspections/haptics";
import type {
  InspectionItem,
  InspectionPhoto,
  InspectionVideo,
  ReworkDetails,
  ReworkItemAnswer,
  SelectedDefect,
  UnitAction,
} from "@/lib/inspections/types";

const FIX_METHODS = ["ซ่อม / ปรับแต่ง", "เปลี่ยนอะไหล่", "พ่นสี", "อื่นๆ"] as const;

type FilterTab = "ALL" | "REWORK" | "PASSED" | "NEW_FAIL";

type Props = {
  details: ReworkDetails;
};

/**
 * Screen S08: Full Checklist Rework Runner View (docs/02 §M06, docs/03 §BR-06).
 * Displays all checklist items from the template with rework focus:
 * 1. Primary Failed Items (ต้องซ่อม): Highlighted with previous defect history + photos,
 *    fix method selector, after-repair live photo evidence, and re-evaluation.
 * 2. Previously Passed Items (ผ่านรอบ 1): Pre-filled as NORMAL for 0 extra clicks,
 *    with a toggle to record secondary damage if damaged during the repair process.
 * 3. Step Pills Track & Quick Jump: Interactive horizontal strip to view all items and scroll directly.
 * 4. Filter Chips: Switch between All, Needs Repair, Passed, and New Issues.
 */
export function ReworkRunnerView({ details }: Props) {
  const router = useRouter();
  const { inspection, planNo, modelCode, description, failedItems, template, previousAnswers = {} } = details;
  const nextRoundNo = inspection.roundNo + 1;

  // Build the complete items list from template or fallback to failedItems
  const allItems: InspectionItem[] = useMemo(() => {
    if (template?.items && template.items.length > 0) {
      return template.items;
    }
    return failedItems.map((f) => ({
      id: f.itemId,
      seq: f.seq,
      topicCode: f.topicCode,
      title: f.title,
      videoRule: f.videoRule,
      inputType: "PASS_FAIL" as const,
      isRequired: true,
    }));
  }, [template, failedItems]);

  const failedItemMap = useMemo(
    () => new Map(failedItems.map((fi) => [fi.itemId, fi])),
    [failedItems],
  );

  // Initialize answers for ALL checklist items
  const [answers, setAnswers] = useState<Record<number, ReworkItemAnswer>>(() => {
    const initial: Record<number, ReworkItemAnswer> = {};
    for (const item of allItems) {
      const failedItem = failedItemMap.get(item.id);
      if (failedItem) {
        // Failed in round 1: requires fix method + after photo + re-eval
        initial[item.id] = {
          status: null,
          fixes: failedItem.defects.map((d) => ({
            defectId: d.defectId,
            fixMethod: "ซ่อม / ปรับแต่ง",
            fixNote: "",
          })),
          defects: failedItem.defects,
          photos: [],
          video: null,
          remark: "",
        };
      } else {
        // Passed in round 1: pre-fill as NORMAL so inspector doesn't need to re-click
        initial[item.id] = {
          status: "NORMAL",
          fixes: [],
          defects: [],
          photos: [],
          video: null,
          remark: previousAnswers[item.id]?.remark ?? "",
        };
      }
    }
    return initial;
  });

  const [filterTab, setFilterTab] = useState<FilterTab>(
    failedItems.length > 0 ? "REWORK" : "ALL",
  );
  const [decision, setDecision] = useState<UnitAction | null>("REWORK");
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Metrics calculation
  const totalCount = allItems.length;
  const reworkCount = failedItems.length;
  const reworkCompletedCount = failedItems.filter((fi) => answers[fi.itemId]?.status === "NORMAL").length;
  const newFailCount = allItems.filter(
    (it) => !failedItemMap.has(it.id) && answers[it.id]?.status === "FAIL",
  ).length;
  const passedCount = allItems.filter(
    (it) => !failedItemMap.has(it.id) && answers[it.id]?.status === "NORMAL",
  ).length;
  const allNormalCount = Object.values(answers).filter((a) => a.status === "NORMAL").length;

  // Filter items for display
  const displayItems = useMemo(() => {
    if (filterTab === "REWORK") {
      return allItems.filter((it) => failedItemMap.has(it.id));
    }
    if (filterTab === "PASSED") {
      return allItems.filter((it) => !failedItemMap.has(it.id) && answers[it.id]?.status === "NORMAL");
    }
    if (filterTab === "NEW_FAIL") {
      return allItems.filter((it) => !failedItemMap.has(it.id) && answers[it.id]?.status === "FAIL");
    }
    return allItems;
  }, [allItems, filterTab, failedItemMap, answers]);

  // Validation blockers
  const blockers: string[] = [];

  // 1. Primary rework items validation
  for (const item of failedItems) {
    const ans = answers[item.itemId];
    if (!ans) continue;

    // Fix method required for each defect
    for (const d of item.defects) {
      const fix = ans.fixes?.find((f) => f.defectId === d.defectId);
      if (!fix?.fixMethod) {
        blockers.push(`หัวข้อ ${item.seq}: กรุณาเลือกวิธีแก้ (${d.nameTh})`);
      } else if (fix.fixMethod === "อื่นๆ" && !fix.fixNote?.trim()) {
        blockers.push(`หัวข้อ ${item.seq}: กรุณาระบุวิธีแก้ในช่อง "อื่นๆ"`);
      }
    }

    // After photo required (>= 1 photo)
    if (!ans.photos || ans.photos.length === 0) {
      blockers.push(`หัวข้อ ${item.seq}: ต้องมีรูปถ่ายหลังแก้ ≥ 1 รูป`);
    }

    // Video required if item/defect requires video
    const needsVid = item.videoRule !== "NONE" || item.defects.some((d) => d.requiresVideo);
    if (needsVid && !ans.video) {
      blockers.push(`หัวข้อ ${item.seq}: ต้องมีวิดีโอหลังแก้ (ความยาว ≤ 20 วิ)`);
    }

    // Re-evaluation status required
    if (!ans.status) {
      blockers.push(`หัวข้อ ${item.seq}: ยังไม่ได้ประเมินผลใหม่ (ปกติ หรือ ยังไม่ผ่าน)`);
    }
  }

  // 2. Previously passed items with secondary damage
  for (const item of allItems) {
    if (failedItemMap.has(item.id)) continue;
    const ans = answers[item.id];
    if (ans?.status === "FAIL") {
      if (!ans.defects || ans.defects.length === 0) {
        blockers.push(`หัวข้อ ${item.seq}: กรุณาระบุอาการความเสียหายใหม่ที่พบ`);
      }
      if (!ans.photos || ans.photos.length === 0) {
        blockers.push(`หัวข้อ ${item.seq}: ต้องถ่ายรูปหลักฐานความเสียหายใหม่ ≥ 1 รูป`);
      }
    }
  }

  const hasAnyFail = Object.values(answers).some((a) => a.status === "FAIL");
  if (hasAnyFail && !decision) {
    blockers.push("ผลยังมีข้อไม่ผ่าน กรุณาเลือกว่าจะส่งซ่อมรอบถัดไป หรือคัดออก (Reject)");
  }

  // Change handlers
  function handleFixMethodChange(itemId: number, defectId: number, method: string) {
    triggerHaptic("tap");
    setAnswers((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: {
          ...current,
          fixes: (current.fixes ?? []).map((f) =>
            f.defectId === defectId ? { ...f, fixMethod: method } : f,
          ),
        },
      };
    });
  }

  function handleFixNoteChange(itemId: number, defectId: number, note: string) {
    setAnswers((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: {
          ...current,
          fixes: (current.fixes ?? []).map((f) =>
            f.defectId === defectId ? { ...f, fixNote: note } : f,
          ),
        },
      };
    });
  }

  function handlePhotosChange(itemId: number, photos: InspectionPhoto[]) {
    setAnswers((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: { ...current, photos },
      };
    });
  }

  function handleVideoChange(itemId: number, video: InspectionVideo | null) {
    setAnswers((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: { ...current, video },
      };
    });
  }

  function handleStatusChange(itemId: number, status: "NORMAL" | "FAIL") {
    if (status === "NORMAL") {
      triggerHaptic("tap");
    } else {
      triggerHaptic("warn");
    }
    setAnswers((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: { ...current, status },
      };
    });
  }

  function handleSecondaryDefectToggle(itemId: number, markAsFail: boolean) {
    setAnswers((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      if (markAsFail) {
        return {
          ...prev,
          [itemId]: {
            ...current,
            status: "FAIL",
            defects: current.defects ?? [],
          },
        };
      }
      return {
        ...prev,
        [itemId]: {
          ...current,
          status: "NORMAL",
          defects: [],
          photos: [],
        },
      };
    });
  }

  function handleDefectsChange(itemId: number, defects: SelectedDefect[]) {
    setAnswers((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: {
          ...current,
          defects,
          status: defects.length > 0 ? "FAIL" : "NORMAL",
        },
      };
    });
  }

  function handleRemarkChange(itemId: number, remark: string) {
    setAnswers((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: { ...current, remark },
      };
    });
  }

  function scrollToItem(itemId: number) {
    triggerHaptic("tap");
    if (filterTab !== "ALL" && !displayItems.some((d) => d.id === itemId)) {
      setFilterTab("ALL");
    }
    setTimeout(() => {
      const el = document.getElementById(`item-card-${itemId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  async function handleSubmit() {
    if (blockers.length > 0) {
      triggerHaptic("warn");
      setErrorMessage(blockers[0]);
      return;
    }

    triggerHaptic("complete");
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/inspections/${inspection.id}/rework`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          decision: hasAnyFail ? decision : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.message || "ไม่สามารถบันทึกผลการ Rework ได้");
        setIsSubmitting(false);
        return;
      }

      router.push("/jobs");
    } catch {
      setErrorMessage("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-w-0 w-full max-w-3xl mx-auto p-4 sm:p-6 space-y-6 pb-28">
      {/* Top App Bar & Context Header */}
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <AppBack href="/jobs">กลับไปงานของฉัน</AppBack>
          <span className="rounded-full border border-fail/60 bg-fail/10 px-2.5 py-0.5 text-xs font-semibold text-fail">
            ตรวจแก้ไข Rework (รอบ {nextRoundNo})
          </span>
        </div>

        <div className="rounded-panel border border-carbon-700 bg-carbon-800 p-4 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-mono text-2xl font-bold text-ti-50">
              SN: {inspection.serialPump}
            </h1>
            <span className="text-xs font-mono text-ti-400">{planNo}</span>
          </div>
          <p className="text-sm text-ti-200">
            {modelCode}
            {description && <span className="text-ti-400"> · {description}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-ti-400 pt-1 border-t border-carbon-700/60">
            <span>
              รายการตรวจทั้งหมด: <strong className="text-ti-200">{totalCount}</strong> ข้อ
            </span>
            <span>·</span>
            <span>
              ต้องซ่อมแซม: <strong className="text-ember-400">{reworkCount}</strong> ข้อ
            </span>
            <span>·</span>
            <span>
              ผ่านแล้วจากรอบ 1: <strong className="text-emerald-400">{passedCount}</strong> ข้อ
            </span>
          </div>
        </div>
      </header>

      {/* Step Pills Track & Quick Jump */}
      <nav aria-label="ผังหัวข้อการตรวจ" className="rounded-panel border border-carbon-700 bg-carbon-900/70 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-ti-400 px-1">
          <span className="font-medium text-ti-300">ผังหัวข้อการตรวจ (กดเพื่อเลื่อนไปยังหัวข้อ)</span>
          <span className="font-mono text-[11px] text-ti-400">
            ซ่อมแล้ว {reworkCompletedCount}/{reworkCount} · ปกติ {allNormalCount}/{totalCount}
          </span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
          {allItems.map((it) => {
            const isReworkPrimary = failedItemMap.has(it.id);
            const ans = answers[it.id];
            const isEvaluatedNormal = ans?.status === "NORMAL";
            const isFail = ans?.status === "FAIL";

            let pillClass = "border-carbon-700 bg-carbon-800 text-ti-400";
            let pillIcon = "";

            if (isReworkPrimary) {
              if (isEvaluatedNormal) {
                pillClass = "border-emerald-500/80 bg-emerald-500/20 text-emerald-300 font-semibold";
                pillIcon = "🔧✓";
              } else if (isFail) {
                pillClass = "border-fail bg-fail/25 text-red-300 font-semibold";
                pillIcon = "🔧✕";
              } else {
                pillClass = "border-ember-500 bg-ember-500/20 text-ember-300 font-semibold ring-1 ring-ember-500/30";
                pillIcon = "🔧";
              }
            } else {
              if (isFail) {
                pillClass = "border-fail bg-fail/30 text-red-200 font-bold animate-pulse";
                pillIcon = "⚠️";
              } else {
                pillClass = "border-emerald-700/50 bg-emerald-950/30 text-emerald-400";
                pillIcon = "✓";
              }
            }

            return (
              <button
                key={it.id}
                type="button"
                onClick={() => scrollToItem(it.id)}
                className={`h-9 px-2.5 shrink-0 rounded-control border text-xs flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 ${pillClass}`}
                title={`หัวข้อ ${it.seq}: ${it.title}`}
              >
                <span className="font-mono font-medium">{it.seq}</span>
                <span className="text-[11px]">{pillIcon}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilterTab("ALL")}
          className={`h-9 px-3.5 rounded-control text-xs font-medium transition-colors border ${
            filterTab === "ALL"
              ? "border-ember-500 bg-ember-500/20 text-ember-300 font-semibold"
              : "border-carbon-700 bg-carbon-800 text-ti-300 hover:bg-carbon-700"
          }`}
        >
          ทั้งหมด ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab("REWORK")}
          className={`h-9 px-3.5 rounded-control text-xs font-medium transition-colors border ${
            filterTab === "REWORK"
              ? "border-ember-500 bg-ember-500/20 text-ember-300 font-semibold"
              : "border-carbon-700 bg-carbon-800 text-ti-300 hover:bg-carbon-700"
          }`}
        >
          🔧 ข้อที่ต้องซ่อม ({reworkCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab("PASSED")}
          className={`h-9 px-3.5 rounded-control text-xs font-medium transition-colors border ${
            filterTab === "PASSED"
              ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 font-semibold"
              : "border-carbon-700 bg-carbon-800 text-ti-300 hover:bg-carbon-700"
          }`}
        >
          ✓ ข้อที่ตรวจผ่านแล้ว ({passedCount})
        </button>
        {newFailCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterTab("NEW_FAIL")}
            className={`h-9 px-3.5 rounded-control text-xs font-semibold transition-colors border ${
              filterTab === "NEW_FAIL"
                ? "border-fail bg-fail/30 text-red-200"
                : "border-fail/50 bg-fail/10 text-fail hover:bg-fail/20"
            }`}
          >
            ⚠️ พบปัญหาใหม่จากการซ่อม ({newFailCount})
          </button>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-control border border-fail/50 bg-fail/10 p-3.5 text-sm text-red-300 space-y-1 shadow-sm"
        >
          <div className="font-semibold flex items-center gap-1.5">
            <span>✕</span>
            <span>ยังไม่สามารถส่งผลได้:</span>
          </div>
          <div className="text-xs sm:text-sm pl-4">{errorMessage}</div>
        </div>
      )}

      {/* Checklist Items List */}
      <div className="space-y-6">
        {displayItems.map((item) => {
          const isPrimaryFailed = failedItemMap.has(item.id);
          const failedItem = failedItemMap.get(item.id);
          const ans = answers[item.id] ?? {
            status: isPrimaryFailed ? null : "NORMAL",
            fixes: [],
            defects: [],
            photos: [],
            video: null,
            remark: "",
          };

          // =========================================================================
          // CASE A: PRIMARY FAILED ITEM FROM ROUND 1 (ต้องซ่อมแซมและประเมินใหม่)
          // =========================================================================
          if (isPrimaryFailed && failedItem) {
            const needsVideo =
              failedItem.videoRule !== "NONE" || failedItem.defects.some((d) => d.requiresVideo);

            return (
              <article
                key={item.id}
                id={`item-card-${item.id}`}
                className="rounded-panel border-2 border-ember-500/70 bg-carbon-800 p-4 sm:p-5 space-y-5 shadow-lg ring-1 ring-ember-500/20"
              >
                {/* Card Title & Rework Header */}
                <div className="border-b border-carbon-700 pb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-mono text-ember-400 font-semibold block">
                      หัวข้อที่ {item.seq}
                    </span>
                    <h2 className="text-base font-semibold text-ti-50 mt-0.5">
                      {item.title}
                    </h2>
                    {item.helpText && (
                      <p className="text-xs text-ti-400 mt-0.5">{item.helpText}</p>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-ember-500/60 bg-ember-500/10 px-2.5 py-0.5 text-xs font-semibold text-ember-300">
                    🔧 ต้องแก้ไขจากการตรวจรอบ {inspection.roundNo}
                  </span>
                </div>

                {/* 1. Previous Round Defect History (Read-only) */}
                <div className="rounded-control border border-carbon-700 bg-carbon-900/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-ti-400">
                    <span className="font-semibold text-red-300">
                      ปัญหาที่พบในรอบที่ {inspection.roundNo} ({inspection.role})
                    </span>
                    <span className="text-[11px] text-ti-500">ข้อมูลเดิม (อ่านอย่างเดียว)</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {failedItem.defects.map((d) => (
                      <span
                        key={d.defectId}
                        className="rounded-full border border-fail/40 bg-fail/10 px-2.5 py-0.5 text-xs text-red-200"
                      >
                        {d.nameTh}
                        {d.severity && (
                          <span className="text-[10px] opacity-75 ml-1">({d.severity})</span>
                        )}
                        {d.part && (
                          <span className="text-[10px] text-ti-400 ml-1">• {d.part}</span>
                        )}
                      </span>
                    ))}
                  </div>

                  {failedItem.photos.length > 0 && (
                    <div className="pt-2">
                      <span className="text-[11px] text-ti-400 block mb-1">
                        รูปหลักฐานรอบก่อน ({failedItem.photos.length} รูป - กดเพื่อดูรูปขยาย):
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {failedItem.photos.map((ph, idx) => (
                          <button
                            key={ph.uri || idx}
                            type="button"
                            onClick={() => setPreviewPhotoUri(ph.uri)}
                            className="relative h-16 w-16 shrink-0 rounded-control overflow-hidden border border-carbon-600 bg-carbon-950 hover:opacity-80 transition-opacity"
                            title="คลิกเพื่อดูรูปขยาย"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={ph.uri}
                              alt={`หลักฐานรอบก่อน รูปที่ ${idx + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {failedItem.remark && (
                    <p className="text-xs text-ti-400 pt-1 italic">
                      หมายเหตุเดิม: &quot;{failedItem.remark}&quot;
                    </p>
                  )}
                </div>

                {/* 2. Choose Fix Method for each defect */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-ti-200 uppercase tracking-wider">
                    วิธีแก้ไขต่ออาการ (Fix Method)
                  </h3>
                  {failedItem.defects.map((defect) => {
                    const fix = ans.fixes?.find((f) => f.defectId === defect.defectId) ?? {
                      defectId: defect.defectId,
                      fixMethod: "ซ่อม / ปรับแต่ง",
                      fixNote: "",
                    };

                    return (
                      <div
                        key={defect.defectId}
                        className="rounded-control border border-carbon-700 bg-carbon-900/40 p-3 space-y-2"
                      >
                        <span className="text-xs font-medium text-ti-100 block">
                          วิธีแก้: <span className="text-ember-300 font-semibold">{defect.nameTh}</span>
                        </span>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {FIX_METHODS.map((method) => {
                            const isSelected = fix.fixMethod === method;
                            return (
                              <button
                                key={method}
                                type="button"
                                onClick={() => handleFixMethodChange(item.id, defect.defectId, method)}
                                className={`h-9 px-2 rounded-control text-xs font-medium transition-colors border ${
                                  isSelected
                                    ? "border-ember-500 bg-ember-500/20 text-ember-300 font-semibold"
                                    : "border-carbon-600 bg-carbon-800 text-ti-300 hover:bg-carbon-700"
                                }`}
                              >
                                {method}
                              </button>
                            );
                          })}
                        </div>

                        {fix.fixMethod === "อื่นๆ" && (
                          <input
                            type="text"
                            value={fix.fixNote ?? ""}
                            onChange={(e) =>
                              handleFixNoteChange(item.id, defect.defectId, e.target.value)
                            }
                            placeholder="ระบุวิธีแก้ไขเพิ่มเติม..."
                            className="w-full h-9 rounded-control border border-carbon-600 bg-carbon-950 px-3 text-xs text-ti-100 placeholder:text-ti-500 focus:border-ember-500 focus:outline-none"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 3. Evidence Capture (After Photo & Video) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-ti-200 uppercase tracking-wider">
                      รูปถ่ายหลังแก้ (After Photo)
                    </h3>
                    <span className="text-xs font-medium text-ember-400">
                      {(ans.photos ?? []).length}/1 รูปขั้นต่ำ
                    </span>
                  </div>

                  <EvidenceCapture
                    photos={ans.photos ?? []}
                    video={ans.video}
                    missingNotes={[]}
                    requiresPhoto={true}
                    requiresVideo={needsVideo}
                    onPhotosChange={(photos) => handlePhotosChange(item.id, photos)}
                    onVideoChange={(video) => handleVideoChange(item.id, video)}
                  />
                </div>

                {/* 4. Re-evaluation Status */}
                <div className="space-y-2 pt-2 border-t border-carbon-700">
                  <h3 className="text-xs font-semibold text-ti-200 uppercase tracking-wider">
                    ผลการประเมินหัวข้อนี้ใหม่ (Re-evaluate)
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, "NORMAL")}
                      className={`h-12 rounded-control text-sm font-semibold border flex items-center justify-center gap-2 transition-all ${
                        ans.status === "NORMAL"
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-sm ring-1 ring-emerald-500/30"
                          : "border-carbon-600 bg-carbon-900 text-ti-400 hover:border-emerald-500/50 hover:text-emerald-400"
                      }`}
                    >
                      <span>✓</span>
                      <span>ปกติ (ผ่าน)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, "FAIL")}
                      className={`h-12 rounded-control text-sm font-semibold border flex items-center justify-center gap-2 transition-all ${
                        ans.status === "FAIL"
                          ? "border-fail bg-fail/25 text-red-200 shadow-sm ring-1 ring-fail/30"
                          : "border-carbon-600 bg-carbon-900 text-ti-400 hover:border-fail/50 hover:text-fail"
                      }`}
                    >
                      <span>✕</span>
                      <span>ยังไม่ผ่าน</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          }

          // =========================================================================
          // CASE B: PREVIOUSLY PASSED ITEM (ผ่านแล้วจากรอบ 1 - Pre-filled NORMAL)
          // =========================================================================
          const isNewlyFailed = ans.status === "FAIL";
          const availableDefects = template?.itemDefects[item.id] ?? COMMON_STANDARD_DEFECTS;

          return (
            <article
              key={item.id}
              id={`item-card-${item.id}`}
              className={`rounded-panel border p-4 sm:p-5 space-y-4 transition-colors ${
                isNewlyFailed
                  ? "border-fail/80 bg-carbon-800 ring-1 ring-fail/40"
                  : "border-carbon-700 bg-carbon-800/80"
              }`}
            >
              {/* Header */}
              <div className="border-b border-carbon-700/70 pb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-mono text-ti-400 font-semibold block">
                    หัวข้อที่ {item.seq}
                  </span>
                  <h2 className="text-base font-semibold text-ti-100 mt-0.5">
                    {item.title}
                  </h2>
                  {item.helpText && (
                    <p className="text-xs text-ti-400 mt-0.5">{item.helpText}</p>
                  )}
                </div>

                {isNewlyFailed ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-fail/60 bg-fail/15 px-2.5 py-0.5 text-xs font-semibold text-red-300">
                    ⚠️ พบความเสียหายใหม่
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                    ✓ ผ่านแล้วในรอบที่ 1
                  </span>
                )}
              </div>

              {/* Status Display & Collateral Damage Toggle */}
              {!isNewlyFailed ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>สถานะปัจจุบัน: ปกติ (ไม่ต้องคลิกซ้ำ)</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSecondaryDefectToggle(item.id, true)}
                    className="h-9 px-3 rounded-control border border-carbon-600 bg-carbon-900/60 text-xs font-medium text-ti-300 hover:border-amber-500 hover:text-amber-300 hover:bg-carbon-900 transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <span>⚠️</span>
                    <span>พบความเสียหายใหม่จากการซ่อม?</span>
                  </button>
                </div>
              ) : (
                /* Secondary Damage / New Defect Expansion */
                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between bg-fail/10 border border-fail/40 rounded-control p-3 text-xs text-red-200">
                    <span className="font-semibold">
                      พบความเสียหายใหม่ระหว่างการซ่อมแซมจุดอื่น (Collateral Damage)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSecondaryDefectToggle(item.id, false)}
                      className="text-ti-300 hover:text-ti-100 underline text-[11px] font-medium"
                    >
                      ยกเลิก (กลับเป็นปกติ)
                    </button>
                  </div>

                  {/* Defect Selector */}
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-semibold text-ti-200 uppercase tracking-wider">
                      ระบุอาการความเสียหายใหม่ที่พบ
                    </h3>
                    <DefectSelector
                      availableDefects={availableDefects}
                      selectedDefects={ans.defects ?? []}
                      onChange={(defects) => handleDefectsChange(item.id, defects)}
                      modelCode={details.modelCode ?? template?.modelCode}
                    />
                  </div>

                  {/* Evidence Capture for New Defect */}
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-semibold text-ti-200 uppercase tracking-wider">
                      ถ่ายรูปหลักฐานความเสียหายใหม่ (≥ 1 รูป)
                    </h3>
                    <EvidenceCapture
                      photos={ans.photos ?? []}
                      video={ans.video}
                      missingNotes={[]}
                      requiresPhoto={true}
                      requiresVideo={false}
                      onPhotosChange={(photos) => handlePhotosChange(item.id, photos)}
                      onVideoChange={(video) => handleVideoChange(item.id, video)}
                    />
                  </div>

                  {/* Optional remark */}
                  <div className="space-y-1">
                    <label className="text-xs text-ti-300 font-medium">หมายเหตุเพิ่มเติม</label>
                    <input
                      type="text"
                      value={ans.remark ?? ""}
                      onChange={(e) => handleRemarkChange(item.id, e.target.value)}
                      placeholder="เช่น โดนประแจกระแทกระหว่างขันมอเตอร์..."
                      className="w-full h-9 rounded-control border border-carbon-600 bg-carbon-950 px-3 text-xs text-ti-100 placeholder:text-ti-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* If any item failed -> Choose decision (Rework vs Reject) */}
      {hasAnyFail && (
        <section className="rounded-panel border border-fail/50 bg-carbon-800 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-fail flex items-center gap-1.5">
            <span>⚠️</span>
            <span>มีหัวข้อที่ยังไม่ผ่าน — กรุณาเลือกแนวทางดำเนินการ</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDecision("REWORK")}
              className={`h-12 px-4 rounded-control border text-xs font-semibold flex items-center justify-between transition-colors ${
                decision === "REWORK"
                  ? "border-ember-500 bg-ember-500/15 text-ember-300"
                  : "border-carbon-600 bg-carbon-900 text-ti-300 hover:border-carbon-500"
              }`}
            >
              <span>ส่งซ่อมอีกรอบ (Rework รอบ {nextRoundNo + 1})</span>
              <span>{decision === "REWORK" ? "●" : "○"}</span>
            </button>

            <button
              type="button"
              onClick={() => setDecision("REJECT")}
              className={`h-12 px-4 rounded-control border text-xs font-semibold flex items-center justify-between transition-colors ${
                decision === "REJECT"
                  ? "border-fail bg-fail/15 text-fail"
                  : "border-carbon-600 bg-carbon-900 text-ti-300 hover:border-carbon-500"
              }`}
            >
              <span>คัดออก (Reject รายตัว)</span>
              <span>{decision === "REJECT" ? "●" : "○"}</span>
            </button>
          </div>
        </section>
      )}

      {/* Submission Dock */}
      <footer className="fixed bottom-0 inset-x-0 border-t border-carbon-700 bg-carbon-900/95 backdrop-blur-md p-4 space-y-2 z-20 shadow-2xl">
        <div className="max-w-3xl mx-auto space-y-2">
          {blockers.length > 0 && (
            <p className="text-xs text-fail font-medium text-center truncate">
              ยังส่งไม่ได้: {blockers[0]}
            </p>
          )}

          <button
            type="button"
            disabled={blockers.length > 0 || isSubmitting}
            onClick={handleSubmit}
            className={`h-12 w-full rounded-control font-semibold text-sm transition-all shadow-md ${
              blockers.length > 0
                ? "bg-carbon-800 text-ti-500 cursor-not-allowed border border-carbon-700"
                : hasAnyFail
                  ? "bg-fail hover:bg-fail/90 text-white"
                  : "bg-ember-500 hover:bg-ember-400 text-carbon-900"
            }`}
          >
            {isSubmitting
              ? "กำลังบันทึกผลการ Rework…"
              : hasAnyFail
                ? `ส่งผล Rework (${decision === "REJECT" ? "คัดออก Reject" : `ส่งซ่อมรอบ ${nextRoundNo + 1}`})`
                : `ส่งผล Rework (ผ่านรอบ ${nextRoundNo})`}
          </button>
        </div>
      </footer>

      {/* Lightbox / Modal for Photo Zoom */}
      {previewPhotoUri && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewPhotoUri(null)}
        >
          <div
            className="relative max-w-2xl max-h-[85vh] rounded-panel overflow-hidden border border-carbon-600 bg-carbon-950 p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhotoUri(null)}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-carbon-900/80 text-ti-100 flex items-center justify-center font-bold hover:bg-carbon-800 border border-carbon-600 z-10"
              title="ปิด"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewPhotoUri}
              alt="รูปหลักฐานขยาย"
              className="max-h-[80vh] w-auto object-contain rounded-control mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
