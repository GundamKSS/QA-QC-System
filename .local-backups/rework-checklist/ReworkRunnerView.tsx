"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EvidenceCapture } from "@/components/inspections/EvidenceCapture";
import type {
  InspectionPhoto,
  InspectionVideo,
  ReworkDetails,
  ReworkItemAnswer,
  UnitAction,
} from "@/lib/inspections/types";

const FIX_METHODS = ["ซ่อม / ปรับแต่ง", "เปลี่ยนอะไหล่", "พ่นสี", "อื่นๆ"] as const;

type Props = {
  details: ReworkDetails;
};

/**
 * Screen S08: Rework Runner View (docs/02 §M06, docs/03 §BR-06).
 * Inspects and verifies only the checklist items that failed in the previous round.
 * Enforces fix method selection, after-repair live photo evidence, and re-evaluation.
 */
export function ReworkRunnerView({ details }: Props) {
  const router = useRouter();
  const { inspection, planNo, modelCode, description, failedItems } = details;
  const nextRoundNo = inspection.roundNo + 1;

  // Initialize answers for each failed item
  const [answers, setAnswers] = useState<Record<number, ReworkItemAnswer>>(() => {
    const initial: Record<number, ReworkItemAnswer> = {};
    for (const item of failedItems) {
      initial[item.itemId] = {
        status: null,
        fixes: item.defects.map((d) => ({
          defectId: d.defectId,
          fixMethod: "ซ่อม / ปรับแต่ง",
          fixNote: "",
        })),
        photos: [],
        video: null,
        remark: "",
      };
    }
    return initial;
  });

  const [decision, setDecision] = useState<UnitAction | null>("REWORK");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check blockers for submission
  const blockers: string[] = [];
  for (const item of failedItems) {
    const ans = answers[item.itemId];
    if (!ans) continue;

    // 1. Fix method required for each defect
    for (const d of item.defects) {
      const fix = ans.fixes.find((f) => f.defectId === d.defectId);
      if (!fix?.fixMethod) {
        blockers.push(`หัวข้อ ${item.seq}: กรุณาเลือกวิธีแก้ (${d.nameTh})`);
      } else if (fix.fixMethod === "อื่นๆ" && !fix.fixNote?.trim()) {
        blockers.push(`หัวข้อ ${item.seq}: กรุณาระบุวิธีแก้ในช่อง "อื่นๆ"`);
      }
    }

    // 2. After photo required (>= 1 photo)
    if (!ans.photos || ans.photos.length === 0) {
      blockers.push(`หัวข้อ ${item.seq}: ต้องมีรูปถ่ายหลังแก้ ≥ 1 รูป`);
    }

    // 3. Video required if item/defect requires video
    const needsVid = item.videoRule !== "NONE" || item.defects.some((d) => d.requiresVideo);
    if (needsVid && !ans.video) {
      blockers.push(`หัวข้อ ${item.seq}: ต้องมีวิดีโอหลังแก้ (ความยาว ≤ 20 วิ)`);
    }

    // 4. Re-evaluation status required
    if (!ans.status) {
      blockers.push(`หัวข้อ ${item.seq}: ยังไม่ได้ประเมินผลใหม่ (ปกติ หรือ ยังไม่ผ่าน)`);
    }
  }

  const hasAnyFail = Object.values(answers).some((a) => a.status === "FAIL");
  if (hasAnyFail && !decision) {
    blockers.push("ผลยังมีข้อไม่ผ่าน กรุณาเลือกว่าจะส่งซ่อมรอบถัดไป หรือคัดออก (Reject)");
  }

  function handleFixMethodChange(itemId: number, defectId: number, method: string) {
    setAnswers((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: {
          ...current,
          fixes: current.fixes.map((f) => (f.defectId === defectId ? { ...f, fixMethod: method } : f)),
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
          fixes: current.fixes.map((f) => (f.defectId === defectId ? { ...f, fixNote: note } : f)),
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
    setAnswers((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: { ...current, status },
      };
    });
  }

  async function handleSubmit() {
    if (blockers.length > 0) {
      setErrorMessage(blockers[0]);
      return;
    }

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
    <div className="min-w-0 w-full max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top App Bar */}
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-xs text-ti-400 hover:text-ti-200 transition-colors"
          >
            ← กลับไปงานของฉัน
          </Link>
          <span className="rounded-full border border-fail/60 bg-fail/10 px-2.5 py-0.5 text-xs font-semibold text-fail">
            ตัวตรวจ Rework (รอบ {nextRoundNo})
          </span>
        </div>

        <div className="rounded-panel border border-carbon-700 bg-carbon-800 p-4 space-y-1">
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
          <p className="text-xs text-ti-400 pt-1">
            ตรวจซ่อมเฉพาะ {failedItems.length} หัวข้อที่ไม่ผ่านจากรอบที่ {inspection.roundNo}
          </p>
        </div>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-control border border-fail/50 bg-fail/10 p-3 text-sm text-red-300 space-y-1"
        >
          <div className="font-medium">ยังไม่สามารถส่งผลได้:</div>
          <div>{errorMessage}</div>
        </div>
      )}

      {/* List of Failed Items */}
      <div className="space-y-6">
        {failedItems.map((item) => {
          const ans = answers[item.itemId] ?? {
            status: null,
            fixes: [],
            photos: [],
            video: null,
            remark: "",
          };
          const needsVideo = item.videoRule !== "NONE" || item.defects.some((d) => d.requiresVideo);

          return (
            <article
              key={item.itemId}
              className="rounded-panel border border-carbon-700 bg-carbon-800 p-4 sm:p-5 space-y-5"
            >
              {/* Card Title */}
              <div className="border-b border-carbon-700 pb-3">
                <span className="text-xs font-mono text-ember-400 font-semibold">
                  หัวข้อที่ {item.seq}
                </span>
                <h2 className="text-base font-semibold text-ti-50 mt-0.5">
                  {item.title}
                </h2>
              </div>

              {/* 1. Previous Round History (Read-only) */}
              <div className="rounded-control border border-carbon-700 bg-carbon-900/60 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs text-ti-400">
                  <span className="font-medium text-red-300">
                    ปัญหาที่พบในรอบที่ {inspection.roundNo} ({inspection.role})
                  </span>
                  <span className="text-[11px] text-ti-500">อ่านอย่างเดียว</span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {item.defects.map((d) => (
                    <span
                      key={d.defectId}
                      className="rounded-full border border-fail/40 bg-fail/10 px-2.5 py-0.5 text-xs text-red-200"
                    >
                      {d.nameTh}
                      {d.severity && (
                        <span className="text-[10px] opacity-75 ml-1">({d.severity})</span>
                      )}
                    </span>
                  ))}
                </div>

                {item.photos.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[11px] text-ti-400 block mb-1">
                      รูปหลักฐานรอบก่อน ({item.photos.length} รูป):
                    </span>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {item.photos.map((ph, idx) => (
                        <div
                          key={ph.uri || idx}
                          className="relative h-16 w-16 shrink-0 rounded-control overflow-hidden border border-carbon-600 bg-carbon-950"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={ph.uri}
                            alt={`หลักฐานรอบ ${inspection.roundNo} รูปที่ ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {item.remark && (
                  <p className="text-xs text-ti-400 pt-1 italic">
                    หมายเหตุเดิม: &quot;{item.remark}&quot;
                  </p>
                )}
              </div>

              {/* 2. Choose Fix Method for each defect */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-ti-200 uppercase tracking-wider">
                  วิธีแก้ไขต่ออาการ (Fix Method)
                </h3>
                {item.defects.map((defect) => {
                  const fix = ans.fixes.find((f) => f.defectId === defect.defectId) ?? {
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
                        วิธีแก้: <span className="text-ember-300">{defect.nameTh}</span>
                      </span>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {FIX_METHODS.map((method) => {
                          const isSelected = fix.fixMethod === method;
                          return (
                            <button
                              key={method}
                              type="button"
                              onClick={() => handleFixMethodChange(item.itemId, defect.defectId, method)}
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
                            handleFixNoteChange(item.itemId, defect.defectId, e.target.value)
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
                    {ans.photos.length}/1 รูปขั้นต่ำ
                  </span>
                </div>

                <EvidenceCapture
                  photos={ans.photos}
                  video={ans.video}
                  missingNotes={[]}
                  requiresPhoto={true}
                  requiresVideo={needsVideo}
                  onPhotosChange={(photos) => handlePhotosChange(item.itemId, photos)}
                  onVideoChange={(video) => handleVideoChange(item.itemId, video)}
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
                    onClick={() => handleStatusChange(item.itemId, "NORMAL")}
                    className={`h-12 rounded-control text-sm font-semibold border flex items-center justify-center gap-2 transition-all ${
                      ans.status === "NORMAL"
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-sm"
                        : "border-carbon-600 bg-carbon-900 text-ti-400 hover:border-emerald-500/50 hover:text-emerald-400"
                    }`}
                  >
                    <span>✓</span>
                    <span>ปกติ (ผ่าน)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStatusChange(item.itemId, "FAIL")}
                    className={`h-12 rounded-control text-sm font-semibold border flex items-center justify-center gap-2 transition-all ${
                      ans.status === "FAIL"
                        ? "border-fail bg-fail/20 text-red-200 shadow-sm"
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
        })}
      </div>

      {/* If any item failed -> Choose decision */}
      {hasAnyFail && (
        <section className="rounded-panel border border-fail/50 bg-carbon-800 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-fail">
            มีหัวข้อที่ยังไม่ผ่าน — กรุณาเลือกแนวทางดำเนินการ
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
      <footer className="sticky bottom-4 rounded-panel border border-carbon-700 bg-carbon-900/95 backdrop-blur p-4 space-y-2 shadow-xl">
        {blockers.length > 0 && (
          <p className="text-xs text-fail font-medium text-center">
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
      </footer>
    </div>
  );
}
