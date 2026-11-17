/**
 * Pure business rules and calculation engine for Unit Inspections (docs/03 BR-04, BR-05, BR-18).
 * Pure on purpose: shared by both client (Checklist Runner UI) and server (API validation & audit).
 */

import { parsePumpQr } from "@/lib/plans/qr";
import type {
  Disposition,
  InspectionItem,
  InspectionRole,
  ItemAnswer,
  Severity,
  UnitAction,
  UnitEvaluation,
  UnitResult,
} from "./types";

export const UNIT_RESULT_LABELS: Record<UnitResult, string> = {
  PASS: "ผ่าน",
  CONCESSION: "อนุโลม (นับเป็นผ่าน)",
  NOT_PASSED: "ไม่ผ่าน",
};

export const UNIT_ACTION_LABELS: Record<UnitAction, string> = {
  REWORK: "ส่งซ่อม (Rework)",
  REJECT: "คัดออก (Reject)",
};

export const DISPOSITION_LABELS: Record<Disposition, string> = {
  CONCESSION: "อนุโลม",
  REWORK: "ส่งซ่อม",
  REJECT: "คัดออก",
  CHOOSE: "ผู้ตรวจเลือก",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  MINOR: "เล็กน้อย (Minor)",
  MAJOR: "ปานกลาง (Major)",
  CRITICAL: "วิกฤต (Critical)",
};

export const MIN_SERIAL_LENGTH = 4;

/**
 * BR-04: Evaluate machine-level inspection result from item answers.
 *
 * Rules:
 * 1. PASS: No item failed.
 * 2. CONCESSION: At least one item failed, but ALL selected defects carry CONCESSION disposition.
 * 3. NOT_PASSED: At least one defect carries REWORK, REJECT, or CHOOSE.
 *    - Forced action: If any defect is CRITICAL with REJECT disposition -> forced REJECT (B5).
 *    - Suggested action: REJECT takes priority over REWORK; if all are CHOOSE -> null (no default suggestion).
 *    - For QA role: A failed machine is strictly QA Reject (QA does not order rework directly).
 */
export function evalUnitResult(
  items: readonly InspectionItem[],
  answers: Record<number, ItemAnswer | undefined>,
  options?: { role?: InspectionRole },
): UnitEvaluation {
  const failedItems: { item: InspectionItem; answer: ItemAnswer }[] = [];

  for (const item of items) {
    if (item.inputType !== "PASS_FAIL") continue;
    const answer = answers[item.id];
    if (answer?.status === "FAIL") {
      failedItems.push({ item, answer });
    }
  }

  // 1. All normal (or no fail)
  if (failedItems.length === 0) {
    return {
      result: "PASS",
      failedItems: [],
      allDefects: [],
      suggestedAction: null,
      forcedAction: null,
      reason: "ทุกหัวข้อปกติ",
    };
  }

  const allDefects = failedItems.flatMap((fi) => fi.answer.defects ?? []);

  // 2. All defects are CONCESSION
  if (allDefects.length > 0 && allDefects.every((d) => d.disposition === "CONCESSION")) {
    return {
      result: "CONCESSION",
      failedItems,
      allDefects,
      suggestedAction: null,
      forcedAction: null,
      reason: "อาการที่พบเป็นอาการอนุโลมทั้งหมด (อนุมัติไว้ล่วงหน้า)",
    };
  }

  // 3. NOT_PASSED: contains REWORK, REJECT, or CHOOSE
  const forcedRejectDefects = allDefects.filter(
    (d) => d.severity === "CRITICAL" && d.disposition === "REJECT",
  );
  const forcedAction: UnitAction | null = forcedRejectDefects.length > 0 ? "REJECT" : null;

  let suggestedAction: UnitAction | null = null;
  if (options?.role === "QA") {
    // QA only rejects back to QC
    suggestedAction = "REJECT";
  } else if (forcedAction) {
    suggestedAction = "REJECT";
  } else if (allDefects.some((d) => d.disposition === "REJECT")) {
    suggestedAction = "REJECT";
  } else if (allDefects.some((d) => d.disposition === "REWORK")) {
    suggestedAction = "REWORK";
  } else {
    // All defects are CHOOSE (ผู้ตรวจเลือก) -> no automated suggestion
    suggestedAction = null;
  }

  const nonConcessionDispositions = [
    ...new Set(
      allDefects
        .filter((d) => d.disposition !== "CONCESSION")
        .map((d) => DISPOSITION_LABELS[d.disposition]),
    ),
  ];

  return {
    result: "NOT_PASSED",
    failedItems,
    allDefects,
    suggestedAction,
    forcedAction,
    reason: `พบอาการไม่ผ่าน (${nonConcessionDispositions.join(" / ")})`,
  };
}

/**
 * BR-05: Missing evidence check for a single item.
 *
 * Rules:
 * - When FAIL:
 *   - Must have at least 1 defect selected.
 *   - Must have at least 1 photo taken in-app.
 *   - Must have video if item has videoRule = 'ALWAYS' | 'ON_FAIL', or any selected defect has requiresVideo = true.
 * - When NORMAL:
 *   - Must have video if item has videoRule = 'ALWAYS'.
 */
export function missingEvidenceForItem(
  item: InspectionItem,
  answer?: ItemAnswer | null,
): string[] {
  const missing: string[] = [];
  if (!answer || !answer.status) return missing;

  if (item.inputType === "PASS_FAIL") {
    if (answer.status === "FAIL") {
      const defects = answer.defects ?? [];
      const photos = answer.photos ?? [];

      if (defects.length === 0) {
        missing.push("เลือกอาการอย่างน้อย 1 อาการ");
      }
      if (photos.length === 0) {
        missing.push("ถ่ายรูปหลักฐานอย่างน้อย 1 รูป");
      }

      const videoRequired =
        item.videoRule === "ALWAYS" ||
        item.videoRule === "ON_FAIL" ||
        defects.some((d) => d.requiresVideo);

      if (videoRequired && !answer.video) {
        missing.push("ถ่ายวิดีโอสั้น ≤ 20 วินาที");
      }
    } else if (answer.status === "NORMAL") {
      if (item.videoRule === "ALWAYS" && !answer.video) {
        missing.push("ถ่ายวิดีโอสั้น ≤ 20 วินาที (หัวข้อนี้บังคับวิดีโอทุกครั้ง)");
      }
    }
  }

  return missing;
}

/**
 * Determines whether a checklist item is considered completed.
 */
export function isItemDone(item: InspectionItem, answer?: ItemAnswer | null): boolean {
  if (item.inputType === "DISPLAY") return true;

  if (item.inputType === "PASS_FAIL") {
    if (!answer?.status) return !item.isRequired;
    return missingEvidenceForItem(item, answer).length === 0;
  }

  if (item.inputType === "NUMBER") {
    if (!item.isRequired) return true;
    const val = answer?.value?.trim();
    return Boolean(val && val.length > 0 && !Number.isNaN(Number(val)));
  }

  if (item.inputType === "TEXT") {
    if (!item.isRequired) return true;
    return Boolean(answer?.value && answer.value.trim().length > 0);
  }

  return !item.isRequired || Boolean(answer?.value && answer.value.trim().length > 0);
}

/**
 * Block reason if the inspector attempts to leave or navigate away from a failed item
 * without fulfilling the defect selection and photo requirements (AC FR-QC-04/05/06).
 */
export function leaveBlockReason(
  item: InspectionItem,
  answer?: ItemAnswer | null,
): string | null {
  if (item.inputType !== "PASS_FAIL" || answer?.status !== "FAIL") return null;
  const missing = missingEvidenceForItem(item, answer);
  if (missing.length === 0) return null;
  return `หัวข้อ ${item.seq}: ${missing.join(" และ ")} ก่อนไปหัวข้ออื่น`;
}

/**
 * Returns required items that remain unanswered or incomplete.
 */
export function unansweredRequiredItems(
  items: readonly InspectionItem[],
  answers: Record<number, ItemAnswer | undefined>,
): InspectionItem[] {
  return items.filter((item) => item.isRequired && !isItemDone(item, answers[item.id]));
}

/**
 * BR-18: Standardized serial normalization.
 * Strips whitespace, uppercase, removes leading zero noise.
 */
export function normalizeSerial(serial: string): string {
  return serial.normalize("NFKC").trim().replace(/\s+/g, "").toUpperCase();
}

export type SerialValidationResult =
  | { ok: true; serial: string }
  | { ok: false; serial: string; message: string };

/**
 * BR-18: Validate pump serial before starting an inspection.
 * Checks for minimum length and uniqueness within the current inspection plan.
 */
export function validateSerial(
  rawSerial: string,
  options: { existingSerials: readonly string[]; minLength?: number },
): SerialValidationResult {
  const serial = normalizeSerial(rawSerial);
  const minLength = options.minLength ?? MIN_SERIAL_LENGTH;

  if (!serial) {
    return { ok: false, serial, message: "กรุณาระบุ Serial ปั๊ม" };
  }

  if (serial.length < minLength) {
    return {
      ok: false,
      serial,
      message: `Serial สั้นเกินไป (ต้องมีอย่างน้อย ${minLength} ตัวอักษร)`,
    };
  }

  const normalizedExisting = new Set(options.existingSerials.map((s) => normalizeSerial(s)));
  if (normalizedExisting.has(serial)) {
    return {
      ok: false,
      serial,
      message: `Serial ${serial} ได้รับการตรวจแล้วในแผนนี้ — บันทึกซ้ำไม่ได้`,
    };
  }

  return { ok: true, serial };
}

/**
 * Extract serial number from either a raw text barcode or a domestic pump QR code sticker.
 */
export function extractSerial(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (trimmed.includes("|")) {
    const qrResult = parsePumpQr(trimmed);
    if (qrResult.ok) {
      return normalizeSerial(qrResult.data.serial);
    }
  }
  return normalizeSerial(trimmed);
}
