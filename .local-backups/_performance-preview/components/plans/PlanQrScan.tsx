"use client";

import { useId, useState } from "react";
import { ScanIcon } from "@/components/dom/Icons";
import { CameraScanDialog } from "@/components/scan/CameraScanDialog";
import { fillFromQr, parsePumpQr, type PumpQr, type QrFill } from "@/lib/plans/qr";
import type { ModelInfo } from "@/lib/plans/store";

type Props = { models: readonly ModelInfo[]; onFill: (fill: QrFill) => void };
type Outcome = { kind: "error"; message: string } | { kind: "read"; data: PumpQr; warnings: string[] };

// Same look as the open-plan form's own inputs and sections.
const inputClass =
  "h-11 min-w-0 flex-1 rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500";
const sectionClass = "space-y-3 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4 sm:p-5";
const dateText = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * "สแกน QR สติ๊กเกอร์" box of the open-plan form (FR-PLAN-05, docs/03 BR-18). The camera is the main way in; a
 * keyboard-wedge scanner types into the box and presses Enter, and a paste works the same. What was read goes up
 * through `onFill`.
 */
export function PlanQrScan({ models, onFill }: Props) {
  const base = useId();
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [camera, setCamera] = useState(false);

  function read(raw: string) {
    if (!raw.trim()) return;
    // Always start the next scan from an empty box: a scanner keeps typing, so leftovers would glue onto it.
    setText("");
    const parsed = parsePumpQr(raw);
    if (!parsed.ok) {
      setOutcome({ kind: "error", message: parsed.message });
      return;
    }
    const fill = fillFromQr(parsed.data, models);
    onFill(fill);
    setOutcome({ kind: "read", data: parsed.data, warnings: fill.warnings });
  }

  return (
    <section aria-labelledby={`${base}-title`} className={sectionClass}>
      <h3 id={`${base}-title`} className="text-base font-medium text-ti-50">
        สแกน QR สติ๊กเกอร์ <span className="text-sm font-normal text-ti-400">(ปั๊มผลิตเอง)</span>
      </h3>
      <p className="text-xs text-ti-500">
        กดสแกนด้วยกล้องแล้วเล็ง QR ฝั่งขวาของสติ๊กเกอร์ (หรือใช้เครื่องยิง/วางข้อความในช่องด้านล่าง) — ระบบเติมเลข WO แผนก Model วันที่ และจำนวนล็อตให้ แก้ต่อได้
      </p>
      <button
        type="button"
        onClick={() => setCamera(true)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-control app-primary-action bg-ember-500 px-4 text-sm font-semibold text-carbon-900 transition-colors hover:bg-ember-400 sm:w-auto"
      >
        <ScanIcon aria-hidden="true" className="size-5" />
        สแกนด้วยกล้อง
      </button>
      <div className="flex gap-2">
        <label htmlFor={`${base}-scan`} className="sr-only">ช่องสแกน QR</label>
        {/* No `name`: the scan box is never sent with the form, and Enter must not submit it. */}
        <input
          id={`${base}-scan`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            read(text);
          }}
          onPaste={(event) => {
            event.preventDefault();
            read(event.clipboardData.getData("text"));
          }}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="เครื่องยิง: คลิกช่องนี้แล้วยิง QR ฝั่งขวา"
          aria-describedby={outcome ? `${base}-result` : undefined}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => read(text)}
          disabled={!text.trim()}
          className="h-11 shrink-0 rounded-control border border-carbon-600 px-4 text-sm text-ti-200 transition-colors hover:border-ti-400 hover:text-ti-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          อ่านข้อมูล
        </button>
      </div>
      {outcome?.kind === "error" && (
        <p id={`${base}-result`} role="alert" className="rounded-control border border-red-500/50 bg-carbon-900/60 px-3 py-2 text-sm text-red-300">
          {outcome.message}
        </p>
      )}
      {outcome?.kind === "read" && (
        <div id={`${base}-result`} role="status" className="rounded-control border border-carbon-700 bg-carbon-900/60 px-3 py-2 text-sm text-ti-200">
          <p>
            ✓ อ่าน QR แล้ว — <span className="font-mono">{outcome.data.woNo}</span> · แผนก {outcome.data.department} · Model {outcome.data.modelCode} · ล็อต {outcome.data.lotQty} เครื่อง · วันที่ผลิต {dateText(outcome.data.productionDate)}
          </p>
          {outcome.warnings.map((warning) => (
            <p key={warning} className="mt-1 text-ember-400">{warning}</p>
          ))}
        </div>
      )}
      {camera && (
        <CameraScanDialog
          title="สแกน QR สติ๊กเกอร์"
          hint="เล็ง QR ฝั่งขวาของสติ๊กเกอร์ให้อยู่ในกรอบ"
          // Both QR codes of a sticker often fit in the frame: take only the one that parses, and say why the other is skipped.
          check={(scanned) => {
            const parsed = parsePumpQr(scanned);
            return parsed.ok ? true : parsed.message;
          }}
          onClose={() => setCamera(false)}
          onRead={(scanned) => {
            setCamera(false);
            read(scanned);
          }}
        />
      )}
    </section>
  );
}
