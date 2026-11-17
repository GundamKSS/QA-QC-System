"use client";

import { DISPOSITION_LABELS, SEVERITY_LABELS } from "@/lib/inspections/rules";
import type { Disposition, SelectedDefect } from "@/lib/inspections/types";

type Props = {
  availableDefects: readonly SelectedDefect[];
  selectedDefects: readonly SelectedDefect[];
  onChange: (defects: SelectedDefect[]) => void;
};

function defectMatches(a: SelectedDefect, b: SelectedDefect): boolean {
  if (a.itemDefectId && b.itemDefectId) return a.itemDefectId === b.itemDefectId;
  return a.defectId === b.defectId && (a.part ?? "") === (b.part ?? "");
}

function defectKey(d: SelectedDefect, idx: number): string {
  if (d.itemDefectId) return `item-defect-${d.itemDefectId}`;
  return `defect-${d.defectId}-${d.part ?? ""}-${idx}`;
}

/**
 * Screen S06 Defect Finding Selector: Select defects and assign dispositions.
 */
export function DefectSelector({
  availableDefects,
  selectedDefects,
  onChange,
}: Props) {
  function isSelected(target: SelectedDefect) {
    return selectedDefects.some((d) => defectMatches(d, target));
  }

  function handleToggleDefect(templateDefect: SelectedDefect) {
    if (isSelected(templateDefect)) {
      onChange(selectedDefects.filter((d) => !defectMatches(d, templateDefect)));
    } else {
      // Default disposition: if CHOOSE, default to REWORK
      const initialDisposition: Disposition =
        templateDefect.disposition === "CHOOSE" ? "REWORK" : templateDefect.disposition;

      onChange([
        ...selectedDefects,
        {
          ...templateDefect,
          disposition: initialDisposition,
        },
      ]);
    }
  }

  function handleDispositionChange(target: SelectedDefect, disposition: Disposition) {
    onChange(
      selectedDefects.map((d) =>
        defectMatches(d, target) ? { ...d, disposition } : d,
      ),
    );
  }

  function handleLocationNoteChange(target: SelectedDefect, note: string) {
    onChange(
      selectedDefects.map((d) =>
        defectMatches(d, target) ? { ...d, locationNote: note } : d,
      ),
    );
  }

  return (
    <div className="rounded-panel border border-fail/40 bg-fail/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-fail uppercase">
          เลือกรายการอาการเสียที่พบ <span className="text-fail">*</span>
        </h3>
        <span className="text-[11px] font-mono text-ti-400">
          เลือกแล้ว {selectedDefects.length} อาการ
        </span>
      </div>

      {availableDefects.length === 0 ? (
        <p className="text-xs text-ti-400 py-2">
          ไม่มีรายการอาการในแค็ตตาล็อกสำหรับหัวข้อนี้
        </p>
      ) : (
        <ul className="space-y-2">
          {availableDefects.map((defect, idx) => {
            const checked = isSelected(defect);
            const activeFinding = selectedDefects.find((d) => defectMatches(d, defect));
            const isSeverityCritical = defect.severity === "CRITICAL";

            return (
              <li
                key={defectKey(defect, idx)}
                className={`rounded-control border p-3 transition-colors ${
                  checked
                    ? "border-fail/60 bg-carbon-800"
                    : "border-carbon-700 bg-carbon-900/60 hover:border-carbon-600"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-start gap-2.5 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleDefect(defect)}
                      className="mt-0.5 size-4 rounded border-carbon-600 bg-carbon-800 text-ember-500 focus:ring-ember-500/40"
                    />
                    <div className="space-y-0.5">
                      <span className="block text-xs font-medium text-ti-100">
                        {defect.nameTh}
                      </span>
                      {defect.part && (
                        <span className="block text-[11px] text-ti-400">
                          ชิ้นส่วน: {defect.part}
                        </span>
                      )}
                    </div>
                  </label>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                        isSeverityCritical
                          ? "border-fail/60 text-fail bg-fail/10"
                          : defect.severity === "MAJOR"
                          ? "border-ember-500/60 text-ember-400 bg-ember-950/20"
                          : "border-carbon-600 text-ti-400"
                      }`}
                    >
                      {SEVERITY_LABELS[defect.severity]}
                    </span>
                  </div>
                </div>

                {/* Sub-options when selected */}
                {checked && activeFinding && (
                  <div className="mt-2.5 pt-2 border-t border-carbon-700/80 space-y-2 text-xs">
                    {/* Disposition selection if template specifies CHOOSE */}
                    {defect.disposition === "CHOOSE" ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-ti-400">การจัดการ:</span>
                        <div className="inline-flex rounded-control border border-carbon-600 bg-carbon-900 p-0.5">
                          <button
                            type="button"
                            onClick={() => handleDispositionChange(defect, "REWORK")}
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              activeFinding.disposition === "REWORK"
                                ? "bg-ember-500 text-carbon-900 font-semibold"
                                : "text-ti-400 hover:text-ti-200"
                            }`}
                          >
                            ส่งซ่อม
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDispositionChange(defect, "REJECT")}
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              activeFinding.disposition === "REJECT"
                                ? "bg-fail text-carbon-900 font-semibold"
                                : "text-ti-400 hover:text-ti-200"
                            }`}
                          >
                            คัดออก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-ti-400">
                        การจัดการ:{" "}
                        <span className="text-ti-200 font-medium">
                          {DISPOSITION_LABELS[activeFinding.disposition]}
                        </span>
                      </div>
                    )}

                    {/* Location note input */}
                    <input
                      type="text"
                      placeholder="ระบุจุดที่พบอาการ (เช่น ฝั่งซ้าย, ข้อต่อเกจ)"
                      value={activeFinding.locationNote ?? ""}
                      onChange={(e) => handleLocationNoteChange(defect, e.target.value)}
                      className="h-8 w-full rounded-control border border-carbon-600 bg-carbon-900 px-2.5 text-xs text-ti-100 placeholder:text-ti-500 focus:outline-none focus:ring-1 focus:ring-ember-500/40"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
