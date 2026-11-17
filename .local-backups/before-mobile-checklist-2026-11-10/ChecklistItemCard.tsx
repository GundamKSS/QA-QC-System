"use client";

import { missingEvidenceForItem } from "@/lib/inspections/rules";
import type {
  InspectionItem,
  InspectionPhoto,
  InspectionVideo,
  ItemAnswer,
  SelectedDefect,
} from "@/lib/inspections/types";
import { DefectSelector } from "./DefectSelector";
import { EvidenceCapture } from "./EvidenceCapture";

type Props = {
  item: InspectionItem;
  answer?: ItemAnswer;
  availableDefects: readonly SelectedDefect[];
  onAnswerChange: (answer: ItemAnswer) => void;
};

/**
 * Screen S06 Checklist Item Card: Question display, PASS/FAIL or value inputs,
 * defect selection, and evidence capture.
 */
export function ChecklistItemCard({
  item,
  answer = {},
  availableDefects,
  onAnswerChange,
}: Props) {
  const status = answer.status;
  const isFail = status === "FAIL";
  const isNormal = status === "NORMAL";

  const missingNotes = missingEvidenceForItem(item, answer);
  const requiresVideo =
    item.videoRule === "ALWAYS" ||
    (isFail && item.videoRule === "ON_FAIL") ||
    (answer.defects ?? []).some((d) => d.requiresVideo);

  function handleSelectStatus(newStatus: "NORMAL" | "FAIL") {
    if (newStatus === "NORMAL") {
      onAnswerChange({
        ...answer,
        status: "NORMAL",
        defects: [],
      });
    } else {
      onAnswerChange({
        ...answer,
        status: "FAIL",
      });
    }
  }

  function handleDefectsChange(defects: SelectedDefect[]) {
    onAnswerChange({
      ...answer,
      defects,
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

  function handleRemarkChange(remark: string) {
    onAnswerChange({
      ...answer,
      remark,
    });
  }

  return (
    <article className="rounded-panel border border-carbon-700 bg-carbon-800 p-5 space-y-4">
      {/* Item Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-mono text-ti-400">
          <span>
            ข้อ {item.seq}
            {item.topicCode ? ` · ${item.topicCode}` : ""}
          </span>
          <span>{item.isRequired ? "หัวข้อบังคับ" : "ไม่บังคับ"}</span>
        </div>
        <h2 className="text-base sm:text-lg font-bold text-ti-50 leading-snug">
          {item.title}
        </h2>
        {item.helpText && (
          <p className="text-xs text-ti-300 leading-relaxed pt-0.5">
            {item.helpText}
          </p>
        )}
      </div>

      {/* Answer Controls: PASS / FAIL Dual Buttons */}
      {item.inputType === "PASS_FAIL" && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => handleSelectStatus("NORMAL")}
            aria-pressed={isNormal}
            className={`h-14 rounded-control text-sm font-semibold border transition-all ${
              isNormal
                ? "border-pass bg-pass/20 text-pass ring-1 ring-pass/40 shadow-sm"
                : "border-carbon-600 bg-carbon-900 text-ti-300 hover:border-carbon-500 hover:text-ti-100"
            }`}
          >
            ปกติ (Pass)
          </button>
          <button
            type="button"
            onClick={() => handleSelectStatus("FAIL")}
            aria-pressed={isFail}
            className={`h-14 rounded-control text-sm font-semibold border transition-all ${
              isFail
                ? "border-fail bg-fail/20 text-fail ring-1 ring-fail/40 shadow-sm"
                : "border-carbon-600 bg-carbon-900 text-ti-300 hover:border-carbon-500 hover:text-ti-100"
            }`}
          >
            ไม่ปกติ (Fail)
          </button>
        </div>
      )}

      {/* Answer Controls: NUMBER Input */}
      {item.inputType === "NUMBER" && (
        <div className="space-y-1.5 pt-1">
          <label htmlFor={`input-num-${item.id}`} className="text-xs text-ti-300">
            ค่าที่วัดได้
          </label>
          <input
            id={`input-num-${item.id}`}
            type="number"
            step="any"
            value={answer.value ?? ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="กรอกตัวเลขค่าที่วัดได้"
            className="h-11 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3.5 font-mono text-sm text-ti-50 focus:outline-none focus:ring-1 focus:ring-ember-500"
          />
        </div>
      )}

      {/* Answer Controls: TEXT Input */}
      {item.inputType === "TEXT" && (
        <div className="space-y-1.5 pt-1">
          <label htmlFor={`input-text-${item.id}`} className="text-xs text-ti-300">
            ข้อสังเกต / หมายเหตุ
          </label>
          <textarea
            id={`input-text-${item.id}`}
            rows={3}
            value={answer.value ?? ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="บันทึกข้อสังเกตเพิ่มเติม"
            className="w-full rounded-control border border-carbon-600 bg-carbon-900 p-3 text-xs text-ti-50 focus:outline-none focus:ring-1 focus:ring-ember-500"
          />
        </div>
      )}

      {/* Defect Finding Selector when marked as FAIL */}
      {isFail && (
        <DefectSelector
          availableDefects={availableDefects}
          selectedDefects={answer.defects ?? []}
          onChange={handleDefectsChange}
        />
      )}

      {/* Evidence Capture: Photos and Videos */}
      {(isFail || requiresVideo) && (
        <EvidenceCapture
          photos={answer.photos ?? []}
          video={answer.video}
          missingNotes={missingNotes}
          requiresVideo={requiresVideo}
          onPhotosChange={handlePhotosChange}
          onVideoChange={handleVideoChange}
        />
      )}

      {/* Optional Note / Remarks for this item */}
      <div className="pt-2 border-t border-carbon-700/60">
        <input
          type="text"
          value={answer.remark ?? ""}
          onChange={(e) => handleRemarkChange(e.target.value)}
          placeholder="บันทึกช่วยจำสำหรับข้อนี้ (ถ้ามี)"
          className="h-9 w-full rounded-control border border-carbon-700 bg-carbon-900/60 px-3 text-xs text-ti-200 placeholder:text-ti-500 focus:outline-none focus:ring-1 focus:ring-ember-500/40"
        />
      </div>
    </article>
  );
}

