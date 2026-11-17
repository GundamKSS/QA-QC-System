"use client";

import { useEffect, useRef, useState } from "react";
import { CameraScanDialog } from "@/components/scan/CameraScanDialog";
import { extractSerial, normalizeSerial, validateSerial } from "@/lib/inspections/rules";
import type { EntryMode, SerialEntryMode } from "@/lib/inspections/types";

type Props = {
  serialPump: string;
  serialMotor: string;
  serialEntryMode: SerialEntryMode;
  entryMode: EntryMode;
  existingSerials?: string[];
  onSerialPumpChange: (serial: string, mode?: SerialEntryMode) => void;
  onSerialMotorChange: (serial: string) => void;
  onEntryModeChange: (mode: EntryMode) => void;
};

export function SerialInputGroup({
  serialPump,
  serialMotor,
  serialEntryMode,
  entryMode,
  existingSerials = [],
  onSerialPumpChange,
  onSerialMotorChange,
  onEntryModeChange,
}: Props) {
  const [cameraTarget, setCameraTarget] = useState<"pump" | "motor" | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const pumpInputRef = useRef<HTMLInputElement>(null);

  // Validate serial realtime
  const validation = serialPump.trim()
    ? validateSerial(serialPump, { existingSerials })
    : null;

  // Handle camera scan result
  function handleCameraScan(rawText: string) {
    if (cameraTarget === "pump") {
      const extracted = extractSerial(rawText);
      onSerialPumpChange(extracted, "SCAN_CAMERA");
      setScanNote(`สแกนสำเร็จ: ${extracted}`);
    } else if (cameraTarget === "motor") {
      const cleaned = normalizeSerial(rawText);
      onSerialMotorChange(cleaned);
      setScanNote(`สแกนมอเตอร์สำเร็จ: ${cleaned}`);
    }
    setCameraTarget(null);
  }

  // Handle manual input with auto-formatting
  function handlePumpInputChange(value: string) {
    const cleaned = value.toUpperCase().replace(/\s+/g, "");
    onSerialPumpChange(cleaned, "MANUAL");
    setScanNote(null);
  }

  // Handle keyboard wedge scanner (rapid inputs ending in Enter)
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const raw = event.currentTarget.value;
      const extracted = extractSerial(raw);
      onSerialPumpChange(extracted, "SCAN_WEDGE");
      setScanNote(`ยิงสแกนเนอร์สำเร็จ: ${extracted}`);
    }
  }

  // Clear note after 4 seconds
  useEffect(() => {
    if (!scanNote) return;
    const t = setTimeout(() => setScanNote(null), 4000);
    return () => clearTimeout(t);
  }, [scanNote]);

  return (
    <div className="space-y-4">
      {/* Pump Serial Field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="serial-pump-input" className="text-xs font-medium text-ti-200">
            Serial ปั๊ม <span className="text-ember-400">*</span>
          </label>
          <span className="text-[11px] font-mono text-ti-400">
            {serialEntryMode === "SCAN_CAMERA" ? "กล้อง" : serialEntryMode === "SCAN_WEDGE" ? "สแกนเนอร์" : "พิมพ์"}
          </span>
        </div>

        <div className="relative flex gap-2">
          <input
            id="serial-pump-input"
            ref={pumpInputRef}
            type="text"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="SN-2611-001 หรือสแกน QR"
            value={serialPump}
            onChange={(e) => handlePumpInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`h-11 flex-1 rounded-control border bg-carbon-800 px-3.5 font-mono text-sm uppercase text-ti-50 placeholder:text-ti-500 focus:outline-none focus:ring-2 ${
              validation && !validation.ok
                ? "border-fail focus:ring-fail/40"
                : validation?.ok
                ? "border-pass focus:ring-pass/40"
                : "border-carbon-600 focus:ring-ember-500/40"
            }`}
          />

          <button
            type="button"
            onClick={() => setCameraTarget("pump")}
            className="h-11 shrink-0 rounded-control border border-ti-600 bg-carbon-700 px-4 text-xs font-semibold text-ti-100 hover:border-ti-400 hover:bg-carbon-600 transition-colors"
          >
            สแกน QR
          </button>
        </div>

        {/* Validation or note status message */}
        {validation && !validation.ok ? (
          <p className="text-xs text-fail">{validation.message}</p>
        ) : validation?.ok ? (
          <p className="text-xs text-pass">Serial ถูกต้อง</p>
        ) : (
          <p className="text-[11px] text-ti-400">สแกน QR สติ๊กเกอร์ หรือพิมพ์เลขซีเรียล</p>
        )}

        {scanNote && (
          <p className="text-xs text-ti-200 font-mono bg-carbon-700/60 border border-carbon-600 rounded-control p-1.5 px-2">
            {scanNote}
          </p>
        )}
      </div>

      {/* Optional Motor Serial Field */}
      <div className="space-y-1.5">
        <label htmlFor="serial-motor-input" className="text-xs font-medium text-ti-300">
          Serial มอเตอร์ <span className="text-ti-500">(ถ้ามี)</span>
        </label>
        <div className="flex gap-2">
          <input
            id="serial-motor-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Serial มอเตอร์"
            value={serialMotor}
            onChange={(e) => onSerialMotorChange(e.target.value.toUpperCase().replace(/\s+/g, ""))}
            className="h-11 flex-1 rounded-control border border-carbon-600 bg-carbon-800 px-3.5 font-mono text-sm uppercase text-ti-50 placeholder:text-ti-500 focus:outline-none focus:ring-2 focus:ring-ember-500/40"
          />
          <button
            type="button"
            onClick={() => setCameraTarget("motor")}
            className="h-11 shrink-0 rounded-control border border-ti-600 bg-carbon-700 px-3 text-xs text-ti-200 hover:border-ti-400 hover:bg-carbon-600 transition-colors"
          >
            สแกน
          </button>
        </div>
      </div>

      {/* Entry Mode Switch */}
      <div className="pt-2 border-t border-carbon-800 space-y-1.5">
        <label className="block text-xs font-medium text-ti-300">โหมดบันทึก</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onEntryModeChange("LIVE")}
            className={`h-10 rounded-control text-xs font-medium border transition-colors ${
              entryMode === "LIVE"
                ? "border-ember-500/80 bg-ember-950/40 text-ember-300 font-semibold"
                : "border-carbon-700 bg-carbon-800 text-ti-400 hover:text-ti-200"
            }`}
          >
            ตรวจสด
          </button>
          <button
            type="button"
            onClick={() => onEntryModeChange("PAPER_BACKFILL")}
            className={`h-10 rounded-control text-xs font-medium border transition-colors ${
              entryMode === "PAPER_BACKFILL"
                ? "border-ember-500/80 bg-ember-950/40 text-ember-300 font-semibold"
                : "border-carbon-700 bg-carbon-800 text-ti-400 hover:text-ti-200"
            }`}
          >
            บันทึกย้อนหลัง
          </button>
        </div>
      </div>

      {/* Full-screen Camera Dialog */}
      {cameraTarget && (
        <CameraScanDialog
          title={cameraTarget === "pump" ? "สแกน Serial ปั๊ม (QR ขวา)" : "สแกน Serial มอเตอร์"}
          hint="นำกล้องส่องไปที่ QR หรือบาร์โค้ดบนสติ๊กเกอร์เครื่อง"
          onRead={handleCameraScan}
          onClose={() => setCameraTarget(null)}
        />
      )}
    </div>
  );
}
