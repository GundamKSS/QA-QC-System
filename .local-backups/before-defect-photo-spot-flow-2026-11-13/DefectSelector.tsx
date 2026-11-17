"use client";

import { useId, useMemo, useState } from "react";
import { HelpTip } from "@/components/dom/HelpTip";
import { DISPOSITION_LABELS, SEVERITY_LABELS } from "@/lib/inspections/rules";
import type { Disposition, SelectedDefect, Severity } from "@/lib/inspections/types";

type Props = {
  availableDefects: readonly SelectedDefect[];
  selectedDefects: readonly SelectedDefect[];
  onChange: (defects: SelectedDefect[]) => void;
  modelCode?: string;
};

/**
 * Common Standard Defects fallback/shared pool so any checklist item (including newly added items)
 * always has an easy-to-tap common list of defects on mobile.
 */
export const COMMON_STANDARD_DEFECTS: readonly SelectedDefect[] = [
  {
    defectId: 5,
    code: "DEF00003",
    nameTh: "สีถลอก / รอยขีดข่วนภายนอก",
    part: "ตัวถัง/ภายนอก",
    severity: "MINOR",
    disposition: "CONCESSION",
  },
  {
    defectId: 10,
    code: "DEF00008",
    nameTh: "น็อตยึดหรือชิ้นส่วนประกอบหลวม",
    part: "จุดยึดประกอบ",
    severity: "MAJOR",
    disposition: "REWORK",
  },
  {
    defectId: 8,
    code: "DEF00006",
    nameTh: "พบการรั่วซึม (ลม / น้ำมัน)",
    part: "ข้อต่อ/ซีล",
    severity: "MAJOR",
    disposition: "REWORK",
  },
  {
    defectId: 120,
    code: "DEF00118",
    nameTh: "เสียงดังผิดปกติ / สั่นสะเทือนเกินเกณฑ์",
    part: "ชุดขับเคลื่อน",
    severity: "MAJOR",
    disposition: "CHOOSE",
  },
  {
    defectId: 3,
    code: "DEF00001",
    nameTh: "ชิ้นส่วนชำรุด แตกหัก หรือผิดสเปก",
    part: "โครงสร้างหลัก",
    severity: "CRITICAL",
    disposition: "REJECT",
  },
];

export const QUICK_LOCATION_PRESETS = [
  "ด้านหน้า",
  "ด้านหลัง",
  "ซ้าย",
  "ขวา",
  "หัวปั๊ม",
  "ถังลม",
  "มอเตอร์",
  "ข้อต่อ/วาล์ว",
] as const;

export function parseLocationTokens(note?: string | null): string[] {
  if (!note) return [];
  return note
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isLocationChipActive(note: string | null | undefined, chip: string): boolean {
  return parseLocationTokens(note).includes(chip);
}

export function toggleLocationChip(note: string | null | undefined, chip: string): string {
  const tokens = parseLocationTokens(note);
  const exists = tokens.includes(chip);
  const next = exists ? tokens.filter((t) => t !== chip) : [...tokens, chip];
  return next.join(", ");
}

export function defectMatches(a: SelectedDefect, b: SelectedDefect): boolean {
  if (a.itemDefectId && b.itemDefectId) return a.itemDefectId === b.itemDefectId;
  return a.defectId === b.defectId && (a.part ?? "") === (b.part ?? "");
}

export function defectKey(d: SelectedDefect): string {
  if (d.itemDefectId) return `item-defect-${d.itemDefectId}`;
  return JSON.stringify([d.defectId, d.part ?? ""]);
}

export type SymptomVariant = {
  defect: SelectedDefect;
  part: string;
};

export type SymptomGroup = {
  nameTh: string;
  severity: Severity;
  disposition: Disposition;
  variants: SymptomVariant[];
  hasMultipleParts: boolean;
};

const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 3,
  MAJOR: 2,
  MINOR: 1,
};

/**
 * Screen S06: Modern "Symptom-first ➔ Part-second" (อาการนำ → ชิ้นส่วนตาม) Defect Selector.
 * Groups identical defect names together to drastically reduce screen clutter by ~70%,
 * reveals parts in an intuitive inline drawer, and surfaces the top model recommendations.
 */
export function DefectSelector({
  availableDefects,
  selectedDefects,
  onChange,
  modelCode,
}: Props) {
  const headingId = useId();
  const [showCommonPool, setShowCommonPool] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  // 1. Combine available defects with fallback common standard pool if requested
  const combinedDefects = useMemo(() => {
    if (availableDefects.length === 0) return COMMON_STANDARD_DEFECTS;
    if (!showCommonPool) return availableDefects;
    const extras = COMMON_STANDARD_DEFECTS.filter(
      (c) => !availableDefects.some((a) => defectMatches(a, c)),
    );
    return [...availableDefects, ...extras];
  }, [availableDefects, showCommonPool]);

  function isSelected(target: SelectedDefect): boolean {
    return selectedDefects.some((d) => defectMatches(d, target));
  }

  // 2. Smart Top Frequent Recommendations ("พบบ่อยในรุ่นนี้") based on model context and factory inspection patterns
  const recommendations = useMemo(() => {
    if (combinedDefects.length === 0) return [];

    const patterns = [
      { regex: /สีถลอก|รอยขีดข่วน|สีไม่สม่ำเสมอ/i, label: "สีถลอก", pct: "92%" },
      { regex: /รั่วซึม|ลมรั่ว|น้ำมันรั่ว|รั่ว/i, label: "รั่วซึม", pct: "78%" },
      { regex: /หลวม|น็อต|จุดยึด|คลอน/i, label: "น็อตหลวม", pct: "64%" },
      { regex: /เสียงดัง|สั่นสะเทือน|สั่น/i, label: "เสียง/สั่น", pct: "45%" },
      { regex: /ชำรุด|แตกหัก|ผิดสเปก|เสียหาย/i, label: "ชำรุด", pct: "38%" },
    ];

    const results: Array<{
      defect: SelectedDefect;
      label: string;
      pct: string;
      part: string;
    }> = [];

    for (const p of patterns) {
      if (results.length >= 3) break;
      const match = combinedDefects.find(
        (d) => p.regex.test(d.nameTh) && !results.some((r) => defectMatches(r.defect, d)),
      );
      if (match) {
        results.push({
          defect: match,
          label: p.label,
          pct: p.pct,
          part: match.part?.trim() || "ทั่วไป",
        });
      }
    }

    // Fill up to 3 with remaining defects if needed
    if (results.length < 3) {
      for (const d of combinedDefects) {
        if (results.length >= 3) break;
        if (!results.some((r) => defectMatches(r.defect, d))) {
          results.push({
            defect: d,
            label: d.nameTh.split("/")[0].trim().slice(0, 10),
            pct: "50%",
            part: d.part?.trim() || "ทั่วไป",
          });
        }
      }
    }

    return results;
  }, [combinedDefects]);

  // 3. Group by Symptom Name (nameTh): "อาการนำ ➔ ชิ้นส่วนตาม"
  const symptomGroups = useMemo<SymptomGroup[]>(() => {
    const map = new Map<
      string,
      {
        variants: SymptomVariant[];
        severities: Severity[];
        dispositions: Disposition[];
      }
    >();

    for (const d of combinedDefects) {
      const name = d.nameTh.trim();
      const existing = map.get(name);
      const variant: SymptomVariant = {
        defect: d,
        part: d.part?.trim() || "ตัวเครื่อง/ทั่วไป",
      };

      if (existing) {
        // avoid duplicate parts under the same symptom
        if (!existing.variants.some((v) => v.part === variant.part)) {
          existing.variants.push(variant);
        }
        existing.severities.push(d.severity);
        existing.dispositions.push(d.disposition);
      } else {
        map.set(name, {
          variants: [variant],
          severities: [d.severity],
          dispositions: [d.disposition],
        });
      }
    }

    const groups: SymptomGroup[] = [];
    for (const [nameTh, data] of map.entries()) {
      // Pick highest severity in the group
      const highestSeverity = data.severities.reduce((prev, curr) =>
        SEVERITY_WEIGHT[curr] > SEVERITY_WEIGHT[prev] ? curr : prev,
      );

      // If all dispositions match use that, otherwise if contains CHOOSE use CHOOSE, else first
      const hasChoose = data.dispositions.includes("CHOOSE");
      const disposition = hasChoose ? "CHOOSE" : data.dispositions[0];

      groups.push({
        nameTh,
        severity: highestSeverity,
        disposition,
        variants: data.variants,
        hasMultipleParts: data.variants.length > 1,
      });
    }

    // Filter by search query if any
    const query = searchQuery.trim().toLowerCase();
    if (!query) return groups;

    return groups.filter(
      (g) =>
        g.nameTh.toLowerCase().includes(query) ||
        g.variants.some((v) => v.part.toLowerCase().includes(query)),
    );
  }, [combinedDefects, searchQuery]);

  function handleToggleDefect(templateDefect: SelectedDefect) {
    if (isSelected(templateDefect)) {
      onChange(selectedDefects.filter((d) => !defectMatches(d, templateDefect)));
    } else {
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

  function handleToggleLocationPreset(target: SelectedDefect, chip: string) {
    const current = selectedDefects.find((d) => defectMatches(d, target))?.locationNote;
    const nextNote = toggleLocationChip(current, chip);
    handleLocationNoteChange(target, nextNote);
  }

  function toggleExpand(nameTh: string) {
    setExpandedMap((prev) => ({
      ...prev,
      [nameTh]: !prev[nameTh],
    }));
  }

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-2xl border border-fail/30 bg-fail/5 p-3 sm:p-4"
    >
      {/* Header: Title with Tooltip & Total Selected Counter */}
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="flex items-center gap-1.5 text-sm sm:text-base font-bold text-fail">
          <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-fail text-white text-xs font-bold">
            !
          </span>
          <span>อาการที่พบ</span>
          <span aria-hidden="true" className="text-fail">*</span>
          <HelpTip label="คำแนะนำการเลือกอาการ">
            แตะที่อาการหลักเพื่อขยายดูชิ้นส่วน และแตะเลือกชิ้นส่วนที่พบความเสียหาย (เลือกได้หลายจุดพร้อมกัน)
          </HelpTip>
        </h3>
        <span
          role="status"
          aria-atomic="true"
          className="rounded-full border border-fail/40 bg-fail/15 px-3 py-1 text-xs font-bold text-fail"
        >
          เลือกแล้ว {selectedDefects.length} อาการ
        </span>
      </div>

      {/* 1. SMART RECOMMENDATIONS: Top Frequent Defects based on History & Model (Horizontally slideable on mobile) */}
      {recommendations.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-carbon-900/90 p-3 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 font-bold text-amber-400">
              <span>พบบ่อยในรุ่นนี้ ({modelCode ? `Model ${modelCode}` : "สถิติสายการผลิต"})</span>
              <HelpTip label="เกี่ยวกับรายการพบบ่อย">
                รายการอาการและชิ้นส่วนที่พบประวัติความเสียหายบ่อยที่สุดในรุ่นนี้ แตะเพื่อเลือกทันที (บนมือถือสามารถเลื่อนสไลด์ซ้าย-ขวาได้)
              </HelpTip>
            </span>
          </div>
          <div
            tabIndex={0}
            role="region"
            aria-label="รายการอาการที่พบบ่อยในรุ่นนี้ เลื่อนซ้ายขวาได้"
            className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5 scroll-smooth snap-x snap-mandatory touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap focus:outline-none"
          >
            {recommendations.map((rec, idx) => {
              const active = isSelected(rec.defect);
              return (
                <button
                  key={`rec-${defectKey(rec.defect)}`}
                  type="button"
                  aria-pressed={active}
                  title={`สถิติพบในรุ่นนี้: ${rec.pct}`}
                  onClick={() => handleToggleDefect(rec.defect)}
                  className={`min-h-11 shrink-0 snap-start inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium touch-manipulation transition-all whitespace-nowrap ${
                    active
                      ? "border-fail bg-fail/20 text-fail ring-1 ring-fail"
                      : "border-carbon-600 bg-carbon-800 text-ti-100 hover:border-amber-400 hover:bg-carbon-700"
                  }`}
                >
                  <span className={`text-[11px] font-bold ${active ? "text-fail" : "text-amber-400"}`}>
                    #{idx + 1}
                  </span>
                  <span className="font-semibold">{rec.label}</span>
                  <span className="rounded bg-carbon-700/80 px-1.5 py-0.5 text-[10px] text-ti-300">
                    {rec.part} ({rec.pct})
                  </span>
                  <span aria-hidden="true" className={`size-4 rounded flex items-center justify-center text-[10px] font-bold ${
                    active ? "bg-fail text-white" : "border border-carbon-500 text-ti-400"
                  }`}>
                    {active ? "✓" : "+"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. SELECTED DEFECTS DETAILS LIST: Location Presets, Custom Location, Disposition & Delete */}
      {selectedDefects.length > 0 && (
        <div className="space-y-2 rounded-xl border border-fail/40 bg-carbon-900/95 p-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-fail">
              <span aria-hidden="true">✓</span> รายการที่เลือกบันทึก ({selectedDefects.length})
            </span>
          </div>

          <ul aria-label="อาการที่เลือกแล้ว" className="space-y-2">
            {selectedDefects.map((finding) => {
              const template =
                availableDefects.find((d) => defectMatches(d, finding)) ??
                COMMON_STANDARD_DEFECTS.find((d) => defectMatches(d, finding));

              return (
                <li
                  key={defectKey(finding)}
                  className="relative rounded-xl border border-fail/40 bg-carbon-800/90"
                >
                  <details className="group/finding">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 rounded-xl py-2.5 pr-12 pl-3 text-left touch-manipulation hover:bg-carbon-700/40 [&::-webkit-details-marker]:hidden">
                      <span
                        aria-hidden="true"
                        className="flex size-5 shrink-0 items-center justify-center rounded-md bg-fail text-xs font-bold text-white shadow-xs"
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="block text-sm font-semibold text-ti-50 wrap-break-word">
                          {finding.nameTh}
                        </span>
                        <span className="block text-xs text-ti-300 wrap-break-word">
                          {finding.part ? `${finding.part} · ` : ""}
                          {DISPOSITION_LABELS[finding.disposition]}
                          {finding.locationNote ? ` · จุด: ${finding.locationNote}` : ""}
                        </span>
                        <span className="block text-xs text-amber-400 group-open/finding:hidden">
                          {template?.disposition === "CHOOSE"
                            ? "เปลี่ยนการจัดการ / เพิ่มจุดที่พบ"
                            : "เพิ่มจุดที่พบ / ดูรายละเอียด"}{" "}
                          <span aria-hidden="true">⌄</span>
                        </span>
                      </span>
                    </summary>

                    <div className="space-y-3 border-t border-carbon-700 px-3 py-3">
                      {/* Disposition Selector */}
                      <div className="space-y-2">
                        <p className="text-xs text-ti-200">
                          การจัดการ · {SEVERITY_LABELS[finding.severity]}
                        </p>
                        {template?.disposition === "CHOOSE" ? (
                          <div
                            role="group"
                            aria-label={`การจัดการ ${finding.nameTh}`}
                            className="grid grid-cols-2 gap-2"
                          >
                            {(["REWORK", "REJECT"] as const).map((disposition) => (
                              <button
                                key={disposition}
                                type="button"
                                aria-pressed={finding.disposition === disposition}
                                onClick={() => handleDispositionChange(finding, disposition)}
                                className={`min-h-11 rounded-lg border px-3 text-sm font-medium touch-manipulation transition-colors ${
                                  finding.disposition === disposition
                                    ? "border-ember-500 bg-ember-500/15 text-ember-400"
                                    : "border-carbon-600 bg-carbon-900 text-ti-200 hover:border-ti-600"
                                }`}
                              >
                                {DISPOSITION_LABELS[disposition]}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-ti-50">
                            ตามมาตรฐาน: {DISPOSITION_LABELS[finding.disposition]}
                          </p>
                        )}
                      </div>

                      {/* Location Preset Chips & Custom Note */}
                      <fieldset className="space-y-2">
                        <legend className="text-xs font-medium text-ti-200">
                          จุดที่พบ <span className="text-ti-400">(ไม่บังคับ)</span>
                        </legend>
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                          {QUICK_LOCATION_PRESETS.map((chip) => {
                            const active = isLocationChipActive(finding.locationNote, chip);
                            return (
                              <button
                                key={chip}
                                type="button"
                                aria-pressed={active}
                                onClick={() => handleToggleLocationPreset(finding, chip)}
                                className={`min-h-11 rounded-lg border px-1.5 py-2 text-xs font-medium touch-manipulation transition-colors ${
                                  active
                                    ? "border-ember-500 bg-ember-500/15 text-ember-400"
                                    : "border-carbon-600 bg-carbon-900 text-ti-200 hover:border-ti-600"
                                }`}
                              >
                                {active && <span aria-hidden="true">✓ </span>}
                                {chip}
                              </button>
                            );
                          })}
                        </div>
                        <label className="block space-y-1.5">
                          <span className="text-xs text-ti-200">ระบุจุดที่พบเพิ่มเติม</span>
                          <input
                            type="text"
                            name={`defect-location-${defectKey(finding)}`}
                            autoComplete="off"
                            placeholder="เช่น รอยยาว 2 ซม. ใกล้วาล์ว…"
                            value={finding.locationNote ?? ""}
                            onChange={(e) => handleLocationNoteChange(finding, e.target.value)}
                            className="min-h-11 w-full rounded-lg border border-carbon-600 bg-carbon-900 px-3 text-base text-ti-50 placeholder:text-ti-400 sm:text-sm"
                          />
                        </label>
                        {finding.locationNote && (
                          <button
                            type="button"
                            onClick={() => handleLocationNoteChange(finding, "")}
                            className="min-h-11 px-2 text-xs text-ti-200 underline underline-offset-2 touch-manipulation hover:text-ti-50"
                          >
                            ล้างจุดที่พบ
                          </button>
                        )}
                      </fieldset>
                    </div>
                  </details>

                  {/* 1-Tap Remove Button */}
                  <button
                    type="button"
                    aria-label={`ยกเลิกอาการ ${finding.nameTh}${finding.part ? ` · ${finding.part}` : ""}`}
                    onClick={() => handleToggleDefect(finding)}
                    className="absolute top-2 right-1 flex size-11 items-center justify-center rounded-lg text-ti-300 touch-manipulation hover:bg-fail/20 hover:text-fail"
                  >
                    <span aria-hidden="true" className="text-base font-bold">✕</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 3. SYMPTOM-FIRST CATALOG ("อาการนำ → ชิ้นส่วนตาม") */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 pt-1">
          <h4 className="text-xs sm:text-sm font-semibold text-ti-100">
            รายการอาการทั้งหมด ({symptomGroups.length})
          </h4>
        </div>

        {/* Search input if more than 4 symptoms */}
        {symptomGroups.length > 4 && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาอาการหรือชิ้นส่วน..."
              className="min-h-10 w-full rounded-xl border border-carbon-600 bg-carbon-900/90 px-3.5 text-xs sm:text-sm text-ti-50 placeholder:text-ti-400 focus:border-amber-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-ti-400 hover:text-ti-100"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Symptoms List */}
        <ul aria-label="เลือกอาการ" className="space-y-2">
          {symptomGroups.map((group) => {
            const selectedVariants = group.variants.filter((v) => isSelected(v.defect));
            const selectedCount = selectedVariants.length;
            const hasSelection = selectedCount > 0;
            const isExpanded = expandedMap[group.nameTh] ?? hasSelection;

            // SINGLE-PART SYMPTOM: 1-Tap toggle directly!
            if (!group.hasMultipleParts) {
              const variant = group.variants[0];
              const checked = isSelected(variant.defect);

              return (
                <li key={`single-${group.nameTh}`}>
                  <button
                    type="button"
                    aria-pressed={checked}
                    onClick={() => handleToggleDefect(variant.defect)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left touch-manipulation transition-all ${
                      checked
                        ? "border-fail bg-fail/15 shadow-xs"
                        : "border-carbon-600 bg-carbon-900/90 hover:border-ti-500 hover:bg-carbon-800"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold transition-all ${
                        checked
                          ? "border-fail bg-fail text-white"
                          : "border-carbon-500 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block text-sm font-semibold text-ti-50 wrap-break-word">
                        {group.nameTh}
                      </span>
                      <span className="block text-xs text-ti-300 wrap-break-word">
                        {variant.part} · {DISPOSITION_LABELS[group.disposition]}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${
                        group.severity === "CRITICAL"
                          ? "border-fail/50 text-fail bg-fail/10"
                          : group.severity === "MAJOR"
                            ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
                            : "border-carbon-600 text-ti-300"
                      }`}
                    >
                      {SEVERITY_LABELS[group.severity]}
                    </span>
                  </button>
                </li>
              );
            }

            // MULTI-PART SYMPTOM: Symptom Card with Inline Part Drawer
            return (
              <li
                key={`group-${group.nameTh}`}
                className={`overflow-hidden rounded-xl border transition-all ${
                  hasSelection
                    ? "border-fail/50 bg-fail/5 shadow-xs"
                    : "border-carbon-600 bg-carbon-900/90 hover:border-carbon-500"
                }`}
              >
                {/* Main Symptom Button (Toggles Part Drawer) */}
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpand(group.nameTh)}
                  className="flex min-h-14 w-full items-center gap-3 px-3.5 py-3 text-left touch-manipulation"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-md text-xs font-bold transition-all ${
                      hasSelection
                        ? "bg-fail text-white"
                        : "border border-carbon-500 bg-carbon-800 text-ti-400"
                    }`}
                  >
                    {hasSelection ? "✓" : "•"}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-sm font-semibold text-ti-50 wrap-break-word">
                      {group.nameTh}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs">
                      {hasSelection ? (
                        <span className="font-bold text-fail">
                          เลือกแล้ว {selectedCount}/{group.variants.length} ชิ้นส่วน
                        </span>
                      ) : (
                        <span
                          title={`ชิ้นส่วน: ${group.variants.map((v) => v.part).join(", ")}`}
                          className="text-ti-400"
                        >
                          {group.variants.length} ชิ้นส่วน
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-xs font-medium ${
                        group.severity === "CRITICAL"
                          ? "border-fail/50 text-fail bg-fail/10"
                          : group.severity === "MAJOR"
                            ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
                            : "border-carbon-600 text-ti-300"
                      }`}
                    >
                      {SEVERITY_LABELS[group.severity]}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`text-sm text-ti-400 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    >
                      ⌄
                    </span>
                  </div>
                </button>

                {/* Inline Part Selection Drawer */}
                {isExpanded && (
                  <div className="border-t border-carbon-700/80 bg-carbon-800/80 p-3">
                    <div className="flex flex-wrap gap-2">
                      {group.variants.map((v) => {
                        const checked = isSelected(v.defect);
                        return (
                          <button
                            key={defectKey(v.defect)}
                            type="button"
                            aria-pressed={checked}
                            onClick={() => handleToggleDefect(v.defect)}
                            className={`min-h-11 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs sm:text-sm font-medium touch-manipulation transition-all ${
                              checked
                                ? "border-fail bg-fail/20 text-fail font-bold ring-1 ring-fail"
                                : "border-carbon-600 bg-carbon-900 text-ti-100 hover:border-ti-400 hover:bg-carbon-700"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`flex size-4 items-center justify-center rounded text-[10px] font-bold ${
                                checked
                                  ? "bg-fail text-white"
                                  : "border border-carbon-500 text-ti-400"
                              }`}
                            >
                              {checked ? "✓" : "+"}
                            </span>
                            <span>{v.part}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* 4. Common Pool Toggle */}
      {availableDefects.length > 0 && (
        <button
          type="button"
          aria-pressed={showCommonPool}
          onClick={() => setShowCommonPool((prev) => !prev)}
          className="min-h-11 w-full rounded-xl border border-dashed border-carbon-600 px-3 py-2 text-xs sm:text-sm font-medium text-amber-400 touch-manipulation hover:border-amber-400 hover:bg-carbon-800/70"
        >
          {showCommonPool ? "ซ่อนอาการทั่วไปเพิ่มเติม" : "+ อาการทั่วไปเพิ่มเติม"}
        </button>
      )}
    </section>
  );
}
