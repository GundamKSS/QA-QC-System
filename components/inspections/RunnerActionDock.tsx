"use client";

import { useEffect, useRef, useState } from "react";
import { useKeyboardOpen } from "@/lib/hooks/useBrowserState";
import type { InspectionItem, ItemAnswer } from "@/lib/inspections/types";

type Props = {
  item: InspectionItem;
  answer?: ItemAnswer;
  isDone: boolean;
  allDone: boolean;
  isLast: boolean;
  onPass: () => void;
  onFail: () => void;
  onNA?: () => void;
  onConfirm: () => void;
  onSummary: () => void;
};

/** Leave room for evidence while scrolling; keep decisions within thumb reach on the way back. */
export function RunnerActionDock({
  item, answer, isDone, allDone, isLast, onPass, onFail, onNA, onConfirm, onSummary,
}: Props) {
  const [scrollingDown, setScrollingDown] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const keyboardOpen = useKeyboardOpen();

  useEffect(() => {
    let anchorY = window.scrollY;
    let frame = 0;
    function checkScroll() {
      frame = 0;
      // Clamp overscroll so iOS bounce cannot hide the controls at the page edges.
      const y = Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight));
      if (y <= 24) {
        setScrollingDown(false);
        anchorY = y;
      } else if (Math.abs(y - anchorY) >= 12) {
        const keyboardFocus = dockRef.current?.querySelector(":focus-visible");
        setScrollingDown(keyboardFocus ? false : y > anchorY);
        anchorY = y;
      }
    }
    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(checkScroll);
    }
    const observer = new IntersectionObserver(([entry]) => setAtEnd(entry.isIntersecting), {
      // Reveal before the last evidence field reaches the space occupied by the dock.
      rootMargin: "0px 0px -160px 0px",
    });
    if (endRef.current) observer.observe(endRef.current);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const hidden = keyboardOpen || (scrollingDown && !atEnd);
  const isNormal = answer?.status === "NORMAL";
  const isFail = answer?.status === "FAIL";
  const isNA = answer?.status === "NA";
  const isPassFail = item.inputType === "PASS_FAIL";

  return (
    <>
      <div ref={endRef} aria-hidden="true" className="h-px" />
      <div
        ref={dockRef}
        role="group"
        aria-label="บันทึกผลหัวข้อปัจจุบัน"
        aria-hidden={hidden}
        inert={hidden}
        className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] inset-x-3 md:left-[104px] md:right-6 md:bottom-4 z-30 max-w-[536px] mx-auto rounded-3xl border border-carbon-700 bg-carbon-800/95 p-3 shadow-xl backdrop-blur-md transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${hidden ? "translate-y-[calc(100%+1rem)] opacity-0 pointer-events-none" : "translate-y-0 opacity-100"}`}
      >
        {/* 1. Pass / NG / N/A Selection Grid (Always accessible on PASS_FAIL steps so reviewing earlier steps never wipes data blindly) */}
        {isPassFail && (
          <div className="space-y-1.5">
            <p className="text-center text-xs leading-relaxed text-ti-400">
              {allDone
                ? "ตรวจครบทุกข้อแล้ว · แตะปุ่มด้านล่างหากต้องการเปลี่ยนผลข้อนี้"
                : isDone && isFail
                  ? "ข้อมูลครบแล้ว · กดปุ่มถัดไปเพื่อไปต่อ"
                  : isDone && isNA
                    ? "ไม่มีชิ้นส่วนนี้ในรุ่นนี้ (N/A)"
                    : isNormal && !isDone
                      ? "แนบหลักฐานให้ครบก่อนไปขั้นตอนถัดไป"
                      : isFail
                        ? "เลือกอาการและถ่ายรูปหลักฐานอย่างน้อย 1 รูป"
                        : "เลือกผลตรวจ (Pass, NG หรือ N/A)"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={onPass}
                aria-pressed={isNormal}
                className={`min-h-13 rounded-2xl border-2 px-1 py-2 text-center transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pass ${
                  isNormal
                    ? "border-pass bg-pass/20 text-pass ring-2 ring-pass/20 font-bold"
                    : "border-pass/40 bg-pass/5 text-pass hover:bg-pass/10"
                }`}
              >
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span className="flex items-center gap-1 text-sm font-bold">
                    <span aria-hidden="true" className="text-base">✓</span> Pass
                  </span>
                  <span className="text-[10px] font-medium opacity-80 mt-0.5">ปกติ</span>
                </div>
              </button>
              <button
                type="button"
                onClick={onFail}
                aria-pressed={isFail}
                className={`min-h-13 rounded-2xl border-2 px-1 py-2 text-center transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fail ${
                  isFail
                    ? "border-fail bg-fail/20 text-fail ring-2 ring-fail/20 font-bold"
                    : "border-fail/40 bg-fail/5 text-fail hover:bg-fail/10"
                }`}
              >
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span className="flex items-center gap-1 text-sm font-bold">
                    <span aria-hidden="true" className="text-base">✕</span> NG
                  </span>
                  <span className="text-[10px] font-medium opacity-80 mt-0.5">พบปัญหา</span>
                </div>
              </button>
              <button
                type="button"
                onClick={onNA}
                aria-pressed={isNA}
                className={`min-h-13 rounded-2xl border-2 px-1 py-2 text-center transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                  isNA
                    ? "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-2 ring-amber-400/20 font-bold"
                    : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                }`}
              >
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span className="flex items-center gap-1 text-sm font-bold">
                    <span aria-hidden="true" className="text-base">⊘</span> N/A
                  </span>
                  <span className="text-[10px] font-medium opacity-80 mt-0.5">ไม่มีในรุ่นนี้</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* 2. Primary Progression Action (Next or Summary) - Single clear progression button */}
        {allDone ? (
          <button
            type="button"
            onClick={onSummary}
            className={`${isPassFail ? "mt-2.5" : ""} min-h-12 w-full rounded-2xl bg-pass px-3 py-2 text-sm font-bold text-white shadow-md transition-all hover:opacity-90 flex items-center justify-center gap-2 animate-slide-up cursor-pointer`}
          >
            <span>ตรวจครบทุกหัวข้อแล้ว · ดูสรุปและบันทึกผล ✓</span>
          </button>
        ) : isDone ? (
          <button
            type="button"
            onClick={isLast ? onSummary : onConfirm}
            className={`${isPassFail ? "mt-2.5" : ""} h-12 w-full rounded-2xl app-primary-action bg-ember-500 hover:bg-ember-400 text-sm font-bold text-white shadow-md transition-all animate-slide-up flex items-center justify-center gap-2 cursor-pointer`}
          >
            <span>{isLast ? "ดูสรุปผลการตรวจ ✓" : "ถัดไป ▶"}</span>
          </button>
        ) : !isPassFail ? (
          <button
            type="button"
            disabled
            className="h-12 w-full rounded-2xl border border-carbon-600 bg-carbon-700/50 text-sm font-medium text-ti-400 opacity-60 cursor-not-allowed flex items-center justify-center"
          >
            {item.inputType === "DISPLAY" ? "รับทราบหัวข้อนี้ ✓" : "กรอกข้อมูลก่อนไปต่อ"}
          </button>
        ) : null}
      </div>
    </>
  );
}
