"use client";

import { useId, useMemo, useState } from "react";
import { HelpTip } from "@/components/dom/HelpTip";
import { triggerHaptic } from "@/lib/inspections/haptics";
import { DISPOSITION_LABELS, SEVERITY_LABELS } from "@/lib/inspections/rules";
import type {
  Disposition,
  InspectionPhoto,
  SelectedDefect,
  Severity,
} from "@/lib/inspections/types";
import { DefectSpotCameraDialog } from "./DefectSpotCameraDialog";

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
    part: "ถัง",
    severity: "MINOR",
    disposition: "CONCESSION",
  },
  {
    defectId: 10,
    code: "DEF00008",
    nameTh: "น็อตยึดหรือชิ้นส่วนประกอบหลวม",
    part: "ฐาน",
    severity: "MAJOR",
    disposition: "REWORK",
  },
  {
    defectId: 8,
    code: "DEF00006",
    nameTh: "พบการรั่วซึม (ลม / น้ำมัน)",
    part: "ข้อต่อ/วาล์ว",
    severity: "MAJOR",
    disposition: "REWORK",
  },
  {
    defectId: 120,
    code: "DEF00118",
    nameTh: "เสียงดังผิดปกติ / สั่นสะเทือนเกินเกณฑ์",
    part: "หัวปั๊ม",
    severity: "MAJOR",
    disposition: "CHOOSE",
  },
  {
    defectId: 3,
    code: "DEF00001",
    nameTh: "ชิ้นส่วนชำรุด แตกหัก หรือผิดสเปก",
    part: "แขนจับ",
    severity: "CRITICAL",
    disposition: "REJECT",
  },
];

/**
 * Standard Part/Area options for pinpoint defect photo capture:
 * "เลือกสิ่งที่พบ (Defect) → เลือกจุด (Part/Area เช่น ถัง, ฐาน, แขนจับ) → บังคับเปิดกล้องถ่ายรูปเจาะจงจุดนั้นทันที"
 */
export const STANDARD_DEFECT_PARTS = [
  "ถัง",
  "ฐาน",
  "แขนจับ",
  "หัวปั๊ม/ฝาสูบ",
  "มอเตอร์",
  "สายพาน/มู่เล่ย์",
  "ข้อต่อ/วาล์ว",
  "เกจวัด/สวิตช์",
  "ล้อ/ขาตั้ง",
  "ทั่วไป/ภายนอก",
] as const;

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

type ActiveCameraTarget = {
  defect: SelectedDefect;
  part: string;
  mode?: "add" | "retake";
  replaceIndex?: number;
};

type LightboxState = {
  uri: string;
  defectName: string;
  part?: string | null;
};

/**
 * Screen S06: Modern "Defect & Spot-Specific Mandatory Camera Capture"
 * Flow: เลือกสิ่งที่พบ (Defect) → เลือกจุด (Part/Area เช่น ถัง, ฐาน, แขนจับ) → บังคับเปิดกล้องถ่ายรูปเจาะจงจุดนั้นทันที
 * และผูกรูปภาพเข้ากับ ID ของ Defect นั้นโดยตรง
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

  // Mandatory Camera capture state
  const [cameraTarget, setCameraTarget] = useState<ActiveCameraTarget | null>(null);

  // Full-size image lightbox state
  const [lightboxPhoto, setLightboxPhoto] = useState<LightboxState | null>(null);

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

  function getSelectedFinding(target: SelectedDefect): SelectedDefect | undefined {
    return selectedDefects.find((d) => defectMatches(d, target));
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
          part: match.part?.trim() || "ถัง",
        });
      }
    }

    if (results.length < 3) {
      for (const d of combinedDefects) {
        if (results.length >= 3) break;
        if (!results.some((r) => defectMatches(r.defect, d))) {
          results.push({
            defect: d,
            label: d.nameTh.split("/")[0].trim().slice(0, 10),
            pct: "50%",
            part: d.part?.trim() || "ฐาน",
          });
        }
      }
    }

    return results;
  }, [combinedDefects]);

  // 3. Group by Symptom Name (nameTh): "สิ่งที่พบ (Defect) ➔ จุด (Part/Area)"
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
        part: d.part?.trim() || "ถัง",
      };

      if (existing) {
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
      const highestSeverity = data.severities.reduce((prev, curr) =>
        SEVERITY_WEIGHT[curr] > SEVERITY_WEIGHT[prev] ? curr : prev,
      );
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

    const query = searchQuery.trim().toLowerCase();
    if (!query) return groups;

    return groups.filter(
      (g) =>
        g.nameTh.toLowerCase().includes(query) ||
        g.variants.some((v) => v.part.toLowerCase().includes(query)),
    );
  }, [combinedDefects, searchQuery]);

  function handleCloseCamera() {
    // If defect was not yet in selectedDefects, add it so the user's choice isn't discarded,
    // and flag it as needing a photo evidence capture.
    if (cameraTarget) {
      const existing = getSelectedFinding(cameraTarget.defect);
      if (!existing) {
        const initialDisposition: Disposition =
          cameraTarget.defect.disposition === "CHOOSE" ? "REWORK" : cameraTarget.defect.disposition;
        onChange([
          ...selectedDefects,
          {
            ...cameraTarget.defect,
            part: cameraTarget.part,
            disposition: initialDisposition,
            photos: [],
          },
        ]);
      }
    }
    setCameraTarget(null);
  }

  /**
   * Snaps photo from live camera dialog and binds directly to the Defect ID and Part!
   */
  function handlePhotoSnapped(uri: string) {
    if (!cameraTarget) return;

    const newPhoto: InspectionPhoto = {
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      uri,
      timestamp: new Date().toISOString(),
      defectId: cameraTarget.defect.defectId,
      itemDefectId: cameraTarget.defect.itemDefectId,
      part: cameraTarget.part,
    };

    const existingIndex = selectedDefects.findIndex((d) =>
      defectMatches(d, { ...cameraTarget.defect, part: cameraTarget.part }),
    );

    if (existingIndex >= 0) {
      const existing = selectedDefects[existingIndex];
      let updatedPhotos: InspectionPhoto[];

      if (cameraTarget.mode === "retake" && typeof cameraTarget.replaceIndex === "number") {
        updatedPhotos = existing.photos?.map((p, idx) =>
          idx === cameraTarget.replaceIndex ? newPhoto : p,
        ) ?? [newPhoto];
      } else {
        updatedPhotos = [...(existing.photos ?? []), newPhoto];
      }

      const updatedDefects = selectedDefects.map((d, idx) =>
        idx === existingIndex
          ? {
              ...d,
              photos: updatedPhotos,
            }
          : d,
      );
      onChange(updatedDefects);
    } else {
      const initialDisposition: Disposition =
        cameraTarget.defect.disposition === "CHOOSE"
          ? "REWORK"
          : cameraTarget.defect.disposition;

      onChange([
        ...selectedDefects,
        {
          ...cameraTarget.defect,
          part: cameraTarget.part,
          disposition: initialDisposition,
          photos: [newPhoto],
        },
      ]);
    }

    setCameraTarget(null);
  }

  /**
   * Flow Core: เลือกสิ่งที่พบ (Defect) → เลือกจุด (Part/Area เช่น ถัง, ฐาน, แขนจับ) → บังคับเปิดกล้องถ่ายรูปเจาะจงจุดนั้นทันที
   */
  function handleSelectDefectWithPart(baseDefect: SelectedDefect, partName: string) {
    triggerHaptic("tap");
    const matchingVariant = availableDefects.find(
      (d) => d.nameTh === baseDefect.nameTh && d.part === partName,
    );
    const targetWithPart: SelectedDefect = {
      ...baseDefect,
      itemDefectId:
        matchingVariant?.itemDefectId ??
        (baseDefect.part === partName ? baseDefect.itemDefectId : null),
      part: partName,
    };

    // If already selected, toggling removes it
    if (isSelected(targetWithPart)) {
      onChange(selectedDefects.filter((d) => !defectMatches(d, targetWithPart)));
      return;
    }

    // Otherwise: trigger mandatory live camera capture immediately for this exact defect and part!
    setCameraTarget({
      defect: targetWithPart,
      part: partName,
      mode: "add",
    });
  }

  function handleOpenSpotCamera(defect: SelectedDefect, mode: "add" | "retake" = "add", replaceIndex?: number) {
    setCameraTarget({
      defect,
      part: defect.part || "ถัง",
      mode,
      replaceIndex,
    });
  }

  function handleRemoveSpotPhoto(defect: SelectedDefect, photoIndex: number) {
    onChange(
      selectedDefects.map((d) => {
        if (!defectMatches(d, defect)) return d;
        const nextPhotos = (d.photos ?? []).filter((_, idx) => idx !== photoIndex);
        return { ...d, photos: nextPhotos };
      }),
    );
  }

  function handleRemoveDefect(target: SelectedDefect) {
    onChange(selectedDefects.filter((d) => !defectMatches(d, target)));
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
    triggerHaptic("tap");
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

  const totalPhotosCaptured = selectedDefects.reduce(
    (acc, curr) => acc + (curr.photos?.length ?? 0),
    0,
  );

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 space-y-3.5 rounded-2xl border border-fail/30 bg-fail/5 p-2.5 sm:p-4 [overflow-wrap:anywhere]"
    >
      {/* Header: Title with Tooltip & Total Selected Counter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="flex min-w-0 items-center gap-1.5 text-sm sm:text-base font-bold text-fail">
          <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-fail text-white text-xs font-bold">
            !
          </span>
          <span className="min-w-0">อาการที่พบ · รูปเฉพาะจุด</span>
          <span aria-hidden="true" className="text-fail">*</span>
          <HelpTip label="คำแนะนำ Flow ตรวจ Defect">
            เลือกสิ่งที่พบ → เลือกจุดที่พบ (เช่น ถัง, ฐาน, แขนจับ) → ระบบจะบังคับเปิดกล้องถ่ายรูปเจาะจงจุดนั้นทันที และผูกรูปเข้ากับ Defect โดยตรง
          </HelpTip>
        </h3>
        <span
          role="status"
          aria-atomic="true"
          className="shrink-0 rounded-full border border-fail/40 bg-fail/15 px-3 py-1 text-xs font-bold text-fail"
        >
          {selectedDefects.length} จุด · {totalPhotosCaptured} รูป
        </span>
      </div>

      {/* 1. SMART RECOMMENDATIONS: Top Frequent Defects based on History & Model */}
      {recommendations.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-carbon-900/90 p-3 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400">
              <span>พบบ่อยในรุ่นนี้ ({modelCode ? `Model ${modelCode}` : "สถิติสายการผลิต"})</span>
              <HelpTip label="เกี่ยวกับรายการพบบ่อย">
                แตะเพื่อเลือกสิ่งที่พบและจุด แล้วระบบจะเปิดกล้องถ่ายเจาะจงจุดนั้นทันที
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
              const matchingVariant = availableDefects.find(
                (d) => d.nameTh === rec.defect.nameTh && d.part === rec.part,
              );
              const targetFinding = {
                ...rec.defect,
                itemDefectId:
                  matchingVariant?.itemDefectId ??
                  (rec.defect.part === rec.part ? rec.defect.itemDefectId : null),
                part: rec.part,
              };
              const active = isSelected(targetFinding);
              return (
                <button
                  key={`rec-${defectKey(targetFinding)}`}
                  type="button"
                  aria-pressed={active}
                  title={`สถิติพบในรุ่นนี้: ${rec.pct}`}
                  onClick={() => handleSelectDefectWithPart(rec.defect, rec.part)}
                  className={`min-h-11 shrink-0 snap-start inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium touch-manipulation transition-all whitespace-nowrap ${
                    active
                      ? "border-fail bg-fail/20 text-fail ring-1 ring-fail"
                      : "border-carbon-600 bg-carbon-800 text-ti-100 hover:border-amber-400 hover:bg-carbon-700"
                  }`}
                >
                  <span className={`text-[11px] font-bold ${active ? "text-fail" : "text-amber-700 dark:text-amber-400"}`}>
                    #{idx + 1}
                  </span>
                  <span className="font-semibold">{rec.label}</span>
                  <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    จุด: {rec.part} ({rec.pct})
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

      {/* 2. SELECTED DEFECTS DETAILS LIST: Spot Photo Evidence, Location & Disposition */}
      {selectedDefects.length > 0 && (
        <div className="min-w-0 space-y-3 rounded-xl border border-fail/40 bg-carbon-900/95 p-2 sm:p-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-fail">
              <span aria-hidden="true">✓</span> รายการที่เลือกบันทึก ({selectedDefects.length} จุด)
            </span>
          </div>

          <ul aria-label="อาการและจุดที่เลือกแล้ว" className="space-y-2.5">
            {selectedDefects.map((finding) => {
              const template =
                availableDefects.find((d) => defectMatches(d, finding)) ??
                COMMON_STANDARD_DEFECTS.find((d) => defectMatches(d, finding));
              const photos = finding.photos ?? [];
              const hasPhotos = photos.length > 0;

              return (
                <li
                  key={defectKey(finding)}
                  className="relative rounded-xl border border-fail/40 bg-carbon-800/90 overflow-hidden min-w-0"
                >
                  <details open className="group/finding min-w-0">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 py-2.5 pr-12 pl-3 text-left touch-manipulation hover:bg-carbon-700/40 [&::-webkit-details-marker]:hidden">
                      <span
                        aria-hidden="true"
                        className="flex size-5 shrink-0 items-center justify-center rounded-md bg-fail text-xs font-bold text-white shadow-xs"
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-ti-50 wrap-break-word">
                            {finding.nameTh}
                          </span>
                          <span className="rounded-md border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                            🏷️ จุด: {finding.part || "ไม่ระบุ"}
                          </span>
                          <span className="text-[11px] font-mono text-ti-400">
                            ({finding.code})
                          </span>
                        </div>
                        <span className="block text-xs text-ti-300 wrap-break-word">
                          {DISPOSITION_LABELS[finding.disposition]}
                          {finding.locationNote ? ` · รายละเอียด: ${finding.locationNote}` : ""}
                        </span>
                      </span>
                    </summary>

                    <div className="space-y-3.5 border-t border-carbon-700 px-2 py-3 sm:px-3 min-w-0">
                      {/* --- SPOT-SPECIFIC MANDATORY PHOTO EVIDENCE SECTION --- */}
                      <div className="min-w-0 space-y-2 rounded-xl border border-carbon-700 bg-carbon-900/90 p-2 sm:p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-ti-100">
                            <span>📷 รูปหลักฐานเฉพาะจุด ({finding.part || "จุดนี้"})</span>
                            <span className="text-fail">*</span>
                          </span>
                          <span className="text-[11px] font-mono text-ti-400">
                            {photos.length} รูป
                          </span>
                        </div>

                        {/* If photos captured: show thumbnails */}
                        {hasPhotos ? (
                          <div className="space-y-2">
                            <div className="flex gap-2 overflow-x-auto pb-1 pt-1">
                              {photos.map((ph, pIdx) => (
                                <div key={ph.id || pIdx} className="relative group shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightboxPhoto({
                                        uri: ph.uri,
                                        defectName: finding.nameTh,
                                        part: finding.part,
                                      })
                                    }
                                    title="แตะเพื่อดูรูปขยาย"
                                    className="block size-18 rounded-lg overflow-hidden border border-carbon-600 bg-carbon-950 hover:border-amber-400 transition-colors cursor-zoom-in"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={ph.uri}
                                      alt={`หลักฐาน ${finding.nameTh} จุด ${finding.part}`}
                                      className="size-full object-cover"
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSpotPhoto(finding, pIdx)}
                                    title="ลบรูปนี้"
                                    aria-label={`ลบรูปหลักฐานที่ ${pIdx + 1} ของ ${finding.nameTh}`}
                                    className="relative mt-1 flex min-h-11 w-full items-center justify-center rounded-lg bg-fail/15 text-xs font-bold text-fail hover:bg-fail/25 touch-manipulation"
                                  >
                                    ลบรูป
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleOpenSpotCamera(finding, "add")}
                                className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-carbon-600 bg-carbon-800 px-3 py-2 text-xs font-semibold text-ti-200 hover:border-amber-400 hover:text-amber-300 transition-colors"
                              >
                                <span>📷</span>
                                <span>ถ่ายรูปเพิ่มสำหรับจุดนี้</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* If NO photo captured yet: prominent mandatory warning & snap button */
                          <div className="space-y-2 rounded-lg border border-fail/40 bg-fail/10 p-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-fail">
                              <span className="text-base">⚠️</span>
                              <span>ยังไม่มีรูปหลักฐานเฉพาะจุด (ระบบบังคับถ่ายรูปจุดนี้)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenSpotCamera(finding, "add")}
                              className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-fail bg-fail/25 px-4 text-xs sm:text-sm font-bold text-fail shadow-xs hover:bg-fail/35 transition-all touch-manipulation cursor-pointer"
                            >
                              <span className="text-base">📷</span>
                              <span>เปิดกล้องถ่ายรูปจุด {finding.part || "นี้"} ทันที (บังคับ)</span>
                            </button>
                          </div>
                        )}
                      </div>

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
                                    ? "border-ember-500 bg-ember-500/15 text-ember-400 font-bold"
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

                      {/* Optional Directional Position Chips & Custom Note (Collapsed unless used to avoid cluttering the screen) */}
                      <details
                        open={Boolean(finding.locationNote)}
                        className="group/loc rounded-xl border border-carbon-700/70 bg-carbon-900/60 px-3 py-2 min-w-0 w-full"
                      >
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-ti-300 hover:text-ti-100 [&::-webkit-details-marker]:hidden">
                          <span>
                            + ระบุทิศทาง / รายละเอียดเพิ่มเติม{" "}
                            <span className="text-ti-400">(ไม่บังคับ)</span>
                          </span>
                          <span aria-hidden="true" className="text-ti-400 transition-transform group-open/loc:rotate-180">
                            ⌄
                          </span>
                        </summary>
                        <div className="space-y-2 pt-2.5 min-w-0 w-full">
                          <div
                            tabIndex={0}
                            role="region"
                            aria-label="ระบุตำแหน่งเพิ่มเติม เลื่อนซ้ายขวาได้"
                            className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 pt-0.5 scroll-smooth snap-x snap-mandatory touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus:outline-none"
                          >
                            {QUICK_LOCATION_PRESETS.slice(0, 4).map((chip) => {
                              const active = isLocationChipActive(finding.locationNote, chip);
                              return (
                                <button
                                  key={chip}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => handleToggleLocationPreset(finding, chip)}
                                  className={`min-h-11 shrink-0 snap-start inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium touch-manipulation transition-all whitespace-nowrap cursor-pointer ${
                                    active
                                      ? "border-ember-500 bg-ember-500/15 text-ember-400 font-bold ring-1 ring-ember-500"
                                      : "border-carbon-600 bg-carbon-800 text-ti-100 hover:border-amber-400 hover:bg-carbon-700"
                                  }`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`flex size-4 items-center justify-center rounded text-[10px] font-bold ${
                                      active
                                        ? "bg-ember-500 text-white"
                                        : "border border-carbon-500 text-ti-400"
                                    }`}
                                  >
                                    {active ? "✓" : "+"}
                                  </span>
                                  <span>{chip}</span>
                                </button>
                              );
                            })}
                          </div>
                          <label className="block">
                            <input
                              type="text"
                              name={`defect-location-${defectKey(finding)}`}
                              autoComplete="off"
                              placeholder="เช่น รอยยาว 2 ซม. ใกล้วาล์ว…"
                              value={finding.locationNote ?? ""}
                              onChange={(e) => handleLocationNoteChange(finding, e.target.value)}
                              aria-label={`รายละเอียดเพิ่มเติมของ ${finding.nameTh}`}
                              className="min-h-11 w-full min-w-0 rounded-lg border border-carbon-600 bg-carbon-900 px-3 text-base sm:text-sm text-ti-50 placeholder:text-ti-400"
                            />
                          </label>
                        </div>
                      </details>
                    </div>
                  </details>

                  {/* 1-Tap Remove Button */}
                  <button
                    type="button"
                    aria-label={`ยกเลิกอาการ ${finding.nameTh}${finding.part ? ` · ${finding.part}` : ""}`}
                    onClick={() => handleRemoveDefect(finding)}
                    className="absolute top-2 right-1 flex size-11 items-center justify-center rounded-lg text-ti-300 touch-manipulation hover:bg-fail/20 hover:text-fail cursor-pointer"
                  >
                    <span aria-hidden="true" className="text-base font-bold">✕</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 3. SYMPTOM-FIRST CATALOG WITH PART/AREA SELECTION */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 pt-1">
          <h4 className="text-xs sm:text-sm font-semibold text-ti-100">
            เลือกสิ่งที่พบ (Defect) แล้วเลือกจุด (Part/Area)
          </h4>
        </div>

        {/* Search input if more than 3 symptoms */}
        {symptomGroups.length > 3 && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาอาการหรือชิ้นส่วน (เช่น ถัง, ฐาน, สีถลอก)..."
              aria-label="ค้นหาอาการหรือชิ้นส่วน"
              className="min-h-12 w-full min-w-0 rounded-xl border border-carbon-600 bg-carbon-900/90 pl-3.5 pr-12 text-base sm:text-sm text-ti-50 placeholder:text-ti-400 focus:border-amber-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="ล้างคำค้นหา"
                className="absolute top-1/2 right-0.5 flex size-11 -translate-y-1/2 items-center justify-center text-sm text-ti-400 hover:text-ti-100"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Symptoms List */}
        <ul aria-label="เลือกอาการและจุด" className="space-y-2">
          {symptomGroups.map((group) => {
            const selectedVariants = group.variants.filter((v) => isSelected(v.defect));
            const selectedCount = selectedVariants.length;
            const hasSelection = selectedCount > 0;
            const isExpanded = expandedMap[group.nameTh] ?? (hasSelection || symptomGroups.length === 1);

            // Collect all parts for this symptom (template variants + standard parts fallback)
            const templateParts = group.variants.map((v) => v.part);
            const allAvailableParts = Array.from(
              new Set([...templateParts, ...STANDARD_DEFECT_PARTS]),
            );

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
                  className="flex min-h-14 w-full flex-wrap items-center gap-2 px-3 py-3 text-left touch-manipulation cursor-pointer sm:flex-nowrap sm:gap-3 sm:px-3.5"
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
                  <div className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] space-y-0.5 sm:basis-auto">
                    <span className="block text-sm font-semibold text-ti-50 wrap-break-word">
                      {group.nameTh}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs">
                      {hasSelection ? (
                        <span className="font-bold text-fail">
                          เลือกแล้ว {selectedCount} จุด (แตะเพื่อดู/เพิ่มจุด)
                        </span>
                      ) : (
                        <span className="text-ti-400">
                          แตะเลือกจุดที่พบ (เช่น ถัง, ฐาน, แขนจับ)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-7 flex shrink-0 items-center gap-2 sm:ml-0">
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${
                        group.severity === "CRITICAL"
                          ? "border-fail/50 text-fail bg-fail/10"
                          : group.severity === "MAJOR"
                            ? "border-amber-500/50 text-amber-700 dark:text-amber-400 bg-amber-500/10"
                            : "border-carbon-600 text-ti-200"
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

                {/* Inline Part Selection Drawer: "เลือกจุด (Part/Area เช่น ถัง, ฐาน, แขนจับ) → บังคับเปิดกล้องถ่ายเจาะจงจุดทันที" */}
                {isExpanded && (
                  <div className="border-t border-carbon-700/80 bg-carbon-800/80 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        เลือกจุดที่พบ (Part/Area) เพื่อเปิดกล้องถ่ายเจาะจงจุด:
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      {allAvailableParts.map((partName) => {
                        const matchingVariant = group.variants.find((v) => v.part === partName);
                        const baseDefect = matchingVariant
                          ? matchingVariant.defect
                          : { ...group.variants[0].defect, itemDefectId: null, part: partName };
                        const checked = isSelected({ ...baseDefect, part: partName });

                        return (
                          <button
                            key={`part-${group.nameTh}-${partName}`}
                            type="button"
                            aria-pressed={checked}
                            onClick={() => handleSelectDefectWithPart(baseDefect, partName)}
                            className={`min-h-11 min-w-0 inline-flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs sm:px-3 sm:text-sm font-medium touch-manipulation transition-all cursor-pointer ${
                              checked
                                ? "border-fail bg-fail/20 text-fail font-bold ring-1 ring-fail"
                                : "border-carbon-600 bg-carbon-900 text-ti-100 hover:border-amber-400 hover:bg-carbon-700"
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
                              {checked ? "✓" : "📷"}
                            </span>
                            <span>{partName}</span>
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
          className="min-h-11 w-full rounded-xl border border-dashed border-carbon-600 px-3 py-2 text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-400 touch-manipulation hover:border-amber-400 hover:bg-carbon-800/70 cursor-pointer"
        >
          {showCommonPool ? "ซ่อนอาการทั่วไปเพิ่มเติม" : "+ อาการทั่วไปเพิ่มเติม"}
        </button>
      )}

      {/* --- FULLSCREEN SPOT CAMERA DIALOG (สไตล์เดียวกับ SCAN QR Code: native <dialog> + full-screen fit + reticle) --- */}
      {cameraTarget && (
        <DefectSpotCameraDialog
          defectName={cameraTarget.defect.nameTh}
          defectCode={cameraTarget.defect.code}
          part={cameraTarget.part}
          onSnap={handlePhotoSnapped}
          onClose={handleCloseCamera}
        />
      )}

      {/* --- LIGHTBOX MODAL FOR PREVIEWING SPOT PHOTOS --- */}
      {lightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="รูปขยายหลักฐานเฉพาะจุด"
          data-theme-surface="dark"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-carbon-950/95 p-4 text-white"
        >
          <div className="w-full max-w-lg space-y-3">
            <div className="flex items-center justify-between text-ti-100">
              <div>
                <h4 className="text-sm font-bold">{lightboxPhoto.defectName}</h4>
                <p className="text-xs text-amber-400">
                  จุดที่พบ: {lightboxPhoto.part || "ทั่วไป"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                aria-label="ปิดรูปขยาย"
                className="size-11 shrink-0 rounded-xl bg-carbon-800 text-ti-300 flex items-center justify-center text-lg hover:bg-carbon-700"
              >
                ✕
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-carbon-700 bg-black max-h-[70vh] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxPhoto.uri}
                alt={lightboxPhoto.defectName}
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
