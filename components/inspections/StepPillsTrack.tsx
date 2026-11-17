"use client";

import { useEffect, useRef, useState } from "react";
import {
  canJumpToStep,
  isItemDone,
  maxUnlockedStepIndex,
} from "@/lib/inspections/rules";
import type { InspectionItem, ItemAnswer } from "@/lib/inspections/types";
import { useReducedMotion } from "@/lib/hooks/useBrowserState";

type Props = {
  items: readonly InspectionItem[];
  answers: Record<number, ItemAnswer | undefined>;
  currentIndex: number;
  maxUnlockedIndex?: number;
  onSelectStep: (targetIndex: number) => void;
  onBlockedJump?: (reason: string) => void;
};

/**
 * Screen S06 Step Navigation Pills Track:
 * Displays a horizontally scrollable sequence of step badges [ 1 ✓ ] - [ 2 ✓ ] - [ 3 ] - [ 4 ] - [ 5 ].
 * Enforces strict step progression:
 * - Completed steps [ 1 ✓ ], [ 2 ✓ ] can be freely tapped anytime to review or edit.
 * - Future unreached steps [ 4 ], [ 5 ] remain locked until preceding steps are completed.
 * - Smooth auto-scrolling centers the active step pill in view.
 */
export function StepPillsTrack({
  items,
  answers,
  currentIndex,
  maxUnlockedIndex,
  onSelectStep,
  onBlockedJump,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [shakingIndex, setShakingIndex] = useState<number | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();

  const maxUnlocked = maxUnlockedIndex ?? maxUnlockedStepIndex(items, answers);

  // Auto-scroll track to keep the current active step centered
  useEffect(() => {
    const activePill = pillRefs.current[currentIndex];
    if (activePill && containerRef.current) {
      const track = containerRef.current;
      const pillBounds = activePill.getBoundingClientRect();
      const trackBounds = track.getBoundingClientRect();
      // Scroll only the track so centering a pill never moves the inspection page.
      track.scrollTo({
        left: track.scrollLeft + pillBounds.left - trackBounds.left - track.clientWidth / 2 + pillBounds.width / 2,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    }
  }, [currentIndex, reducedMotion]);

  useEffect(() => () => {
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
  }, []);

  function handlePillClick(targetIndex: number) {
    if (targetIndex === currentIndex) return;

    const check = canJumpToStep(items, answers, currentIndex, targetIndex, { maxUnlocked });
    if (!check.allowed) {
      setShakingIndex(targetIndex);
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShakingIndex(null), 400);
      onBlockedJump?.(check.reason);
      return;
    }

    onSelectStep(targetIndex);
  }

  return (
    <nav aria-label="เลือกหัวข้อการตรวจ" className="w-full space-y-1 py-0.5">
      <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-ti-300">
        <span aria-live="polite" className="font-semibold text-ti-100">
          ขั้นตอนที่ {currentIndex + 1} / {items.length}
        </span>
        <span className="text-ti-400">แตะข้อที่ทำแล้วเพื่อดู/แก้ไข</span>
      </div>
      {/* Horizontal Scrollable Pills Track */}
      <div
        ref={containerRef}
        className="relative flex items-center gap-1.5 overflow-x-auto overscroll-x-contain px-1 pt-1 pb-2 -mx-1"
      >
        {items.map((item, idx) => {
          const stepNum = idx + 1;
          const answer = answers[item.id];
          const isDone = isItemDone(item, answer);
          const isFail = answer?.status === "FAIL";
          const isNA = answer?.status === "NA";
          const isNormalDone = isDone && !isFail && !isNA;
          const isActive = idx === currentIndex;
          const isUnlocked = idx <= maxUnlocked;
          const isShaking = shakingIndex === idx;

          return (
            <div key={item.id} className="flex items-center shrink-0">
              {/* Connector line between pills */}
              {idx > 0 && (
                <span
                  aria-hidden="true"
                  className={`mx-1 h-px w-3 select-none ${
                    idx > maxUnlocked
                      ? "bg-carbon-700"
                      : answers[items[idx - 1].id]?.status === "FAIL"
                      ? "bg-fail/50"
                      : answers[items[idx - 1].id]?.status === "NA"
                      ? "bg-amber-500/50"
                      : "bg-pass/50"
                  }`}
                />
              )}

              <button
                ref={(el) => {
                  pillRefs.current[idx] = el;
                }}
                type="button"
                aria-current={isActive ? "step" : undefined}
                aria-controls="inspection-step-panel"
                aria-disabled={!isUnlocked}
                aria-label={`ขั้นตอนที่ ${stepNum}: ${item.title}${
                  isFail ? " (ไม่ผ่าน)" : isNA ? " (N/A)" : isDone ? " (เสร็จแล้ว)" : ""
                }${!isUnlocked ? " (ยังไม่ปลดล็อก)" : ""}`}
                onClick={() => handlePillClick(idx)}
                title={
                  !isUnlocked
                    ? "ล็อกอยู่ — กรุณาทำขั้นตอนก่อนหน้าให้เสร็จก่อน"
                    : `${stepNum}. ${item.title}${isFail ? " (ไม่ผ่าน)" : isNA ? " (N/A)" : isDone ? " (เสร็จแล้ว)" : ""}`
                }
                className={`relative flex items-center justify-center min-w-12 h-12 px-2.5 rounded-2xl font-mono text-sm transition-[background-color,border-color,box-shadow,scale] motion-reduce:transition-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  isFail ? "focus-visible:outline-fail" : isNA ? "focus-visible:outline-amber-400" : "focus-visible:outline-ember-500"
                } ${
                  isShaking ? "animate-shake motion-reduce:animate-none ring-2 ring-fail" : ""
                } ${
                  isActive
                    ? isFail
                      ? "border-2 border-fail bg-fail/20 text-fail font-bold ring-2 ring-fail/40 scale-105 shadow-md"
                      : isNA
                      ? "border-2 border-amber-500 bg-amber-500/25 text-amber-700 dark:text-amber-300 font-bold ring-2 ring-amber-400/40 scale-105 shadow-md"
                      : "border-2 border-ember-500 bg-ember-500/25 text-ember-600 dark:text-ember-300 font-bold ring-2 ring-ember-500/40 scale-105 shadow-md"
                    : isFail
                    ? "border border-fail/60 bg-fail/15 text-fail font-semibold hover:bg-fail/25 cursor-pointer shadow-xs"
                    : isNA && isUnlocked
                    ? "border border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold hover:bg-amber-500/25 cursor-pointer shadow-xs"
                    : isNormalDone && isUnlocked
                    ? "border border-pass/60 bg-pass/15 text-pass font-semibold hover:bg-pass/25 cursor-pointer shadow-xs"
                    : isUnlocked
                    ? "border border-carbon-600 bg-carbon-800 text-ti-50 font-medium hover:border-carbon-500 cursor-pointer shadow-xs"
                    : "border border-carbon-600/30 bg-carbon-800/40 text-ti-400 cursor-not-allowed"
                }`}
              >
                <span>{stepNum}</span>
                {isFail ? (
                  <span
                    aria-hidden="true"
                    className="ml-1 text-[11px] font-bold text-fail leading-none"
                  >
                    ✕
                  </span>
                ) : isNA ? (
                  <span
                    aria-hidden="true"
                    className="ml-1 text-[10px] font-bold text-amber-400 leading-none"
                  >
                    ⊘
                  </span>
                ) : isNormalDone ? (
                  <span
                    aria-hidden="true"
                    className="ml-1 text-[11px] font-bold text-pass leading-none"
                  >
                    ✓
                  </span>
                ) : null}
                {!isUnlocked && (
                  <svg aria-hidden="true" width="10" height="12" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="ml-1">
                    <rect x="1.5" y="6" width="9" height="6.5" rx="1.5" />
                    <path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" />
                  </svg>
                )}

                {/* Sleek active underline bar */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className={`absolute -bottom-1 h-0.5 w-5 rounded-full ${
                      isFail ? "bg-fail" : isNA ? "bg-amber-400" : "bg-ember-500"
                    }`}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
