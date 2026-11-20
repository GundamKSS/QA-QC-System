"use client";

import { triggerHaptic } from "@/lib/inspections/haptics";
import {
  formatStepMeasurements,
  getStepMeasurementConfig,
  missingEvidenceForItem,
  parseStepMeasurements,
  syncDefectPhotos,
} from "@/lib/inspections/rules";
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

export type PressureSpecs = {
  start?: number | null;
  stop?: number | null;
  isConcession?: boolean;
};

type Props = {
  item: InspectionItem;
  totalSteps?: number;
  answer?: ItemAnswer;
  availableDefects: readonly SelectedDefect[];
  onAnswerChange: (answer: ItemAnswer) => void;
  onQuickPresetSelect?: (preset: string) => void;
  modelCode?: string;
  pressureSpecs?: PressureSpecs;
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
  pressureSpecs,
}: Props) {
  const status = answer.status;
  const isNormal = status === "NORMAL";
  const isFail = status === "FAIL";
  const isNA = status === "NA";

  const isPressureStep =
    item.topicCode === "16" ||
    item.seq === 16 ||
    item.title.includes("ตัด-ต่อ") ||
    item.title.includes("ตัดต่อ") ||
    item.title.includes("แรงดัน");

  const measurementConfig = getStepMeasurementConfig(item);
  const measurementValues = parseStepMeasurements(measurementConfig, answer.value);

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

  function handleMeasurementFieldChange(fieldKey: string, fieldValue: string) {
    if (!measurementConfig) return;
    const nextMap = { ...measurementValues, [fieldKey]: fieldValue };
    const formatted = formatStepMeasurements(measurementConfig, nextMap);
    onAnswerChange({
      ...answer,
      value: formatted,
    });
  }

  return (
    <div className="min-w-0 space-y-3.5 [overflow-wrap:anywhere]">
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

      {/* Target Pressure Benchmark Pill (เมื่อเป็นขั้นตอนตรวจแรงดัน และมีสเปกของรุ่นนั้น) */}
      {isPressureStep && (pressureSpecs?.start != null || pressureSpecs?.stop != null) && (
        <div className="flex items-center justify-center gap-2 pt-0.5 animate-fade-in">
          <div className="inline-flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 rounded-2xl border border-ember-500/40 bg-ember-500/10 px-3.5 py-1.5 text-xs font-mono text-ember-300 shadow-xs">
            <span className="font-semibold text-ti-200">🎯 สเปก {modelCode ? `(${modelCode})` : ""}:</span>
            <span>Start <strong className="text-ti-50">{pressureSpecs.start ?? "—"}</strong> bar</span>
            <span className="text-ti-500">/</span>
            <span>Stop <strong className="text-ti-50">{pressureSpecs.stop ?? "—"}</strong> bar</span>
            {pressureSpecs.isConcession && (
              <span className="rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                อนุโลม
              </span>
            )}
          </div>
        </div>
      )}

      {/* 2.5 Embedded Numeric Measurement Inputs for PASS_FAIL steps (New Piston Checklist V.1 parity) */}
      {measurementConfig && (
        <div className="rounded-2xl border border-carbon-600/80 bg-carbon-900/70 p-3.5 space-y-3 shadow-xs">
          <div
            className={
              measurementConfig.fields.length > 1
                ? "grid grid-cols-1 sm:grid-cols-2 gap-3"
                : "space-y-2"
            }
          >
            {measurementConfig.fields.map((field) => {
              const currentVal = measurementValues[field.key] ?? "";
              const specPreset =
                measurementConfig.kind === "PRESSURE_START_STOP"
                  ? field.key === "stop" && pressureSpecs?.stop != null
                    ? String(pressureSpecs.stop)
                    : field.key === "start" && pressureSpecs?.start != null
                      ? String(pressureSpecs.start)
                      : null
                  : null;
              const allPresets = field.presets
                ? specPreset && !field.presets.includes(specPreset)
                  ? [specPreset, ...field.presets]
                  : field.presets
                : specPreset
                  ? [specPreset]
                  : [];

              return (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`input-measure-${item.id}-${field.key}`}
                      className="text-xs font-semibold text-ti-100"
                    >
                      {field.label}{" "}
                      <span className="font-mono text-ti-400">({field.unit})</span>
                    </label>
                    {specPreset && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("tap");
                          handleMeasurementFieldChange(field.key, specPreset);
                        }}
                        className="text-[11px] font-mono font-semibold text-ember-400 hover:text-ember-300 cursor-pointer"
                      >
                        ใช้ค่าสเปก ({specPreset} {field.unit})
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id={`input-measure-${item.id}-${field.key}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={currentVal}
                      onChange={(e) => handleMeasurementFieldChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="h-12 w-full min-w-0 rounded-xl border border-carbon-600 bg-carbon-800 pl-3.5 pr-12 font-mono text-base text-ti-50 placeholder:text-ti-500 focus:outline-none focus:ring-2 focus:ring-ember-500"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-ti-400">
                      {field.unit}
                    </span>
                  </div>
                  {allPresets.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {allPresets.map((preset) => {
                        const isActive = currentVal === preset;
                        const isSpec = preset === specPreset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              triggerHaptic("tap");
                              handleMeasurementFieldChange(
                                field.key,
                                isActive ? "" : preset,
                              );
                            }}
                            className={`min-h-11 rounded-lg border px-3 font-mono text-sm transition-colors cursor-pointer ${
                              isActive
                                ? "border-ember-500 bg-ember-500 text-white font-bold"
                                : isSpec
                                  ? "border-ember-500/60 bg-ember-500/15 text-ember-300 hover:bg-ember-500/25 font-semibold"
                                  : "border-carbon-600 bg-carbon-800 text-ti-300 hover:border-carbon-500"
                            }`}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                  className={`min-h-11 rounded-control border px-3 font-mono text-sm transition-colors cursor-pointer ${
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
            className="w-full min-w-0 rounded-control border border-carbon-600 bg-carbon-900 p-3 text-base sm:text-sm text-ti-50 focus:outline-none focus:ring-2 focus:ring-ember-500"
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
