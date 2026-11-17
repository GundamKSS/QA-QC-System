"use client";

import { isItemDone, missingEvidenceForItem } from "@/lib/inspections/rules";
import type { InspectionItem, ItemAnswer } from "@/lib/inspections/types";

type Props = {
  items: readonly InspectionItem[];
  answers: Record<number, ItemAnswer | undefined>;
  currentIndex: number;
  onSelectIndex: (index: number) => void;
};

/**
 * Screen S06 Stepper: Horizontal item progression bar with completion status indicators.
 */
export function RunnerStepper({
  items,
  answers,
  currentIndex,
  onSelectIndex,
}: Props) {
  const total = items.length;
  const answeredCount = items.filter((item) => isItemDone(item, answers[item.id])).length;
  const percent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  return (
    <div className="rounded-panel border border-carbon-700 bg-carbon-800/80 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ti-300">
          หัวข้อที่ {currentIndex + 1} จาก {total}
        </span>
        <span className="font-mono text-ti-400">
          ตอบแล้ว {answeredCount}/{total} ({percent}%)
        </span>
      </div>

      {/* Horizontal Stepper Buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
        {items.map((item, idx) => {
          const answer = answers[item.id];
          const isCurrent = idx === currentIndex;
          const isDone = isItemDone(item, answer);
          const isFail = answer?.status === "FAIL";
          const isNormal = answer?.status === "NORMAL";
          const hasMissingEvidence = isFail && missingEvidenceForItem(item, answer).length > 0;

          let toneClass = "border-carbon-700 bg-carbon-900 text-ti-400 hover:border-carbon-600";
          if (isCurrent) {
            toneClass = "border-ember-500 bg-carbon-700 text-ti-50 font-bold ring-1 ring-ember-500/50";
          } else if (hasMissingEvidence) {
            toneClass = "border-amber-500/70 bg-amber-950/30 text-amber-300";
          } else if (isFail) {
            toneClass = "border-fail/70 bg-fail/10 text-fail";
          } else if (isNormal && isDone) {
            toneClass = "border-pass/70 bg-pass/10 text-pass";
          } else if (isDone) {
            toneClass = "border-carbon-600 bg-carbon-800 text-ti-200";
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectIndex(idx)}
              aria-current={isCurrent ? "step" : undefined}
              className={`relative flex h-9 min-w-9 shrink-0 items-center justify-center rounded-control border text-xs font-mono transition-all ${toneClass}`}
              title={`${item.seq}. ${item.title}`}
            >
              <span>{item.seq}</span>
              {hasMissingEvidence && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-400"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

