"use client";

import { triggerHaptic } from "@/lib/inspections/haptics";
import { missingEvidenceForItem, syncDefectPhotos } from "@/lib/inspections/rules";
import type {
  InspectionItem,
  InspectionPhoto,
  InspectionVideo,
  ItemAnswer,
  SelectedDefect,
} from "@/lib/inspections/types";
import { DefectSelector } from "./DefectSelector";
import { EvidenceCapture } from "./EvidenceCapture";
import { StepMinimalAnimation } from "./StepMinimalAnimation";

type Props = {
  item: InspectionItem;
  totalSteps?: number;
  answer?: ItemAnswer;
  availableDefects: readonly SelectedDefect[];
  onAnswerChange: (answer: ItemAnswer) => void;
  onQuickPresetSelect?: (preset: string) => void;
  modelCode?: string;
};

const QUICK_NUMBER_PRESETS = ["7.5", "8.0", "8.5", "9.0", "10.0", "12.0"] as const;

/**
 * Screen S06 Checklist Step Content inside the Unified Card:
 * Minimalist vector animation, step title, Pass confirmation badge (when NORMAL),
 * or defect selector + mandatory live camera evidence capture (only when FAIL).
 */
export function ChecklistItemCard({
  item,
  totalSteps = 6,
  answer = {},
  availableDefects,
  onAnswerChange,
  onQuickPresetSelect,
  modelCode,
}: Props) {
  const status = answer.status;
  const isNormal = status === "NORMAL";
  const isFail = status === "FAIL";
  const isNA = status === "NA";

  const missingNotes = missingEvidenceForItem(item, answer);
  const requiresVideo =
    isFail &&
    (item.videoRule === "ALWAYS" ||
      item.videoRule === "ON_FAIL" ||
      (answer.defects ?? []).some((d) => d.requiresVideo));

  function handleDefectsChange(defects: SelectedDefect[]) {
    const syncedPhotos = syncDefectPhotos(defects, answer.photos ?? []);
    onAnswerChange({
      ...answer,
      defects,
      photos: syncedPhotos,
    });
  }

  function handlePhotosChange(photos: InspectionPhoto[]) {
    onAnswerChange({
      ...answer,
      photos,
    });
  }

  function handleVideoChange(video: InspectionVideo | null) {
    onAnswerChange({
      ...answer,
      video,
    });
  }

  function handleValueChange(value: string) {
    onAnswerChange({
      ...answer,
      value,
    });
  }

  return (
    <div className="space-y-3.5">
      {/* 1. Minimalist Step Animation (Viewfinder + Vector Illustration) */}
      <StepMinimalAnimation
        item={item}
        status={status}
        totalSteps={totalSteps}
      />

      {/* 2. Step Title & Help Text */}
      <div className="space-y-1 text-center px-1">
        <h2 className="text-sm sm:text-base font-bold text-ti-50 leading-snug">
          {item.title}
        </h2>
        {item.helpText && (
          <p className="text-xs text-ti-300 leading-relaxed">
            {item.helpText}
          </p>
        )}
      </div>

      {/* 3. NUMBER Input + Quick Tap Presets */}
      {item.inputType === "NUMBER" && (
        <div className="space-y-2 pt-1">
          <label htmlFor={`input-num-${item.id}`} className="text-xs font-medium text-ti-200 block">
            ค่าที่วัดได้ <span className="text-ember-400">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_NUMBER_PRESETS.map((preset) => {
              const active = answer.value === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    if (onQuickPresetSelect) {
                      onQuickPresetSelect(preset);
                    } else {
                      triggerHaptic("tap");
                      handleValueChange(preset);
                    }
                  }}
                  className={`h-9 rounded-control border px-3 font-mono text-xs transition-colors cursor-pointer ${
                    active
                      ? "border-ember-500 bg-ember-500 text-white font-bold"
                      : "border-carbon-600 bg-carbon-900 text-ti-200 hover:border-carbon-500"
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
          <input
            id={`input-num-${item.id}`}
            type="number"
            step="any"
            value={answer.value ?? ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="0.0"
            className="h-12 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3.5 font-mono text-base text-ti-50 focus:outline-none focus:ring-2 focus:ring-ember-500"
          />
        </div>
      )}

      {/* 4. TEXT Input */}
      {item.inputType === "TEXT" && (
        <div className="space-y-1.5 pt-1">
          <label htmlFor={`input-text-${item.id}`} className="text-xs font-medium text-ti-200">
            ข้อสังเกต / หมายเหตุ
          </label>
          <textarea
            id={`input-text-${item.id}`}
            rows={3}
            value={answer.value ?? ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="ระบุข้อสังเกต (ถ้ามี)..."
            className="w-full rounded-control border border-carbon-600 bg-carbon-900 p-3 text-sm text-ti-50 focus:outline-none focus:ring-2 focus:ring-ember-500"
          />
        </div>
      )}

      {/* 5. When PASS (NORMAL): Concise Pass Badge without repeating the step title */}
      {isNormal && (
        <div
          role="status"
          className="rounded-2xl border border-pass/45 bg-pass/10 px-4 py-3 flex items-center gap-3 shadow-xs"
        >
          <span
            aria-hidden="true"
            className="shrink-0 flex items-center justify-center size-9 rounded-full bg-pass text-white text-base font-black shadow-xs"
          >
            ✓
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-xs sm:text-sm font-bold text-pass tracking-wide">
              ผ่านการตรวจสอบแล้ว (PASS)
            </span>
            <span className="block text-xs text-ti-200 leading-snug">
              บันทึกผลปกติแล้ว · แตะปุ่มด้านล่างหากต้องการเปลี่ยนผลตรวจ
            </span>
          </div>
        </div>
      )}

      {/* 5.1 When N/A: Show Not Applicable badge (no photo/video/remark required) */}
      {isNA && (
        <div
          role="status"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5 flex items-center gap-3 shadow-xs"
        >
          <span
            aria-hidden="true"
            className="shrink-0 flex items-center justify-center size-10 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/50 text-lg font-extrabold shadow-xs"
          >
            ⊘
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-xs font-bold text-amber-700 dark:text-amber-400 tracking-wide">
              ไม่มีในรุ่นนี้ (N/A)
            </span>
            <span className="block text-xs sm:text-sm font-semibold text-ti-50 leading-snug">
              ข้ามหัวข้อนี้เนื่องจากไม่มีอุปกรณ์หรือชิ้นส่วนดังกล่าว
            </span>
          </div>
        </div>
      )}

      {/* 6. When FAIL: Show Defect Selector (Defect -> Part -> Spot Camera Capture) + Video Capture only if required */}
      {isFail && (
        <div className="space-y-3 pt-1">
          <DefectSelector
            availableDefects={availableDefects}
            selectedDefects={answer.defects ?? []}
            onChange={handleDefectsChange}
            modelCode={modelCode}
          />
          {(requiresVideo || Boolean(answer.video)) && (
            <EvidenceCapture
              photos={answer.photos ?? []}
              video={answer.video}
              missingNotes={missingNotes.filter((m) => m.includes("วิดีโอ"))}
              requiresPhoto={false}
              hidePhotoCapture={true}
              requiresVideo={requiresVideo}
              onPhotosChange={handlePhotosChange}
              onVideoChange={handleVideoChange}
            />
          )}
        </div>
      )}
    </div>
  );
}
