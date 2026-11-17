/**
 * Pure business rules and calculation engine for Unit Inspections (docs/03 BR-04, BR-05, BR-18).
 * Pure on purpose: shared by both client (Checklist Runner UI) and server (API validation & audit).
 */

import { parsePumpQr } from "@/lib/plans/qr";
import {
  ANIMATION_TYPES,
  type AnimationType,
  type Disposition,
  type InspectionItem,
  type InspectionPhoto,
  type InspectionRole,
  type ItemAnswer,
  type SelectedDefect,
  type Severity,
  type UnitAction,
  type UnitEvaluation,
  type UnitResult,
} from "./types";

export const ANIMATION_TYPE_LABELS: Record<AnimationType, string> = {
  SCAN_PUMP: "สแกนปั๊มลม & สภาพภายนอก",
  PISTON_HEAD: "หัวปั๊ม ลูกสูบ & จุดยึด",
  MOTOR_BELT: "มอเตอร์ สายพาน & มู่เล่ย์",
  PRESSURE_GAUGE: "เกจวัดแรงดัน & Pressure Switch",
  AIR_TANK: "ถังลม ระดับน้ำมัน & รอยเชื่อม",
  VALVE_LEAK: "เช็ควาล์ว ข้อต่อ & รอยรั่วซึม",
  GENERAL_CHECK: "ตรวจสอบมาตรฐานทั่วไป",
};

/**
 * Resolve the minimal vector animation type for a checklist item.
 * Uses explicit `animationType` if configured; otherwise infers from title/topic/seq.
 */
export function inferItemAnimationType(item: InspectionItem): AnimationType {
  if (
    item.animationType &&
    (ANIMATION_TYPES as readonly string[]).includes(item.animationType)
  ) {
    return item.animationType;
  }

  const text = `${item.topicCode ?? ""} ${item.title}`.toLowerCase();
  if (text.includes("สแกน") || text.includes("ภายนอก") || text.includes("serial") || text.includes("สีเคลือบ")) {
    return "SCAN_PUMP";
  }
  if (text.includes("แรงดัน") || text.includes("เกจ") || text.includes("pressure") || text.includes("bar")) {
    return "PRESSURE_GAUGE";
  }
  if (text.includes("สายพาน") || text.includes("มู่เล่ย์") || text.includes("มอเตอร์") || text.includes("เดินเครื่อง")) {
    return "MOTOR_BELT";
  }
  if (text.includes("รั่ว") || text.includes("เช็ควาล์ว") || text.includes("ข้อต่อ")) {
    return "VALVE_LEAK";
  }
  if (text.includes("น็อต") || text.includes("ฝาสูบ") || text.includes("ลูกสูบ") || text.includes("หัวปั๊ม")) {
    return "PISTON_HEAD";
  }
  if (text.includes("น้ำมัน") || text.includes("ถัง") || text.includes("รอยเชื่อม")) {
    return "AIR_TANK";
  }

  switch (item.seq) {
    case 1:
      return "SCAN_PUMP";
    case 2:
      return "PISTON_HEAD";
    case 3:
      return "AIR_TANK";
    case 4:
      return "MOTOR_BELT";
    case 5:
      return "VALVE_LEAK";
    case 6:
      return "PRESSURE_GAUGE";
    default:
      return "GENERAL_CHECK";
  }
}

export const UNIT_RESULT_LABELS: Record<UnitResult, string> = {
  PASS: "ผ่าน",
  CONCESSION: "อนุโลม",
  NOT_PASSED: "ไม่ผ่าน",
};

export const UNIT_ACTION_LABELS: Record<UnitAction, string> = {
  REWORK: "ส่งซ่อม",
  REJECT: "คัดออก",
};

export const DISPOSITION_LABELS: Record<Disposition, string> = {
  CONCESSION: "อนุโลม",
  REWORK: "ส่งซ่อม",
  REJECT: "คัดออก",
  CHOOSE: "เลือก",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  MINOR: "เล็กน้อย",
  MAJOR: "ปานกลาง",
  CRITICAL: "วิกฤต",
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
  // NOTE: Per user direction (แนวทางที่ 1), inspectors have the autonomy to decide between REWORK or REJECT.
  // Critical defects suggest REJECT, but do not hard-lock forcedAction, giving inspectors the ability to order rework.
  const forcedAction: UnitAction | null = null;

  let suggestedAction: UnitAction | null = null;
  if (options?.role === "QA") {
    // QA only rejects back to QC
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
 *   - Must have at least 1 photo taken in-app for each selected defect.
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

      // Check mandatory photo evidence for defects
      if (defects.length > 0) {
        const defectsWithoutPhotos = defects.filter((d) => {
          const hasDirectPhoto = Boolean(d.photos && d.photos.length > 0);
          const hasLinkedPhoto = photos.some(
            (p) => p.defectId === d.defectId && (!d.part || !p.part || p.part === d.part),
          );
          // Legacy backward compatibility: unlinked photo pool if total photos >= defects
          const hasLegacyPhoto = photos.some((p) => !p.defectId);
          return !hasDirectPhoto && !hasLinkedPhoto && !hasLegacyPhoto;
        });

        if (defectsWithoutPhotos.length > 0) {
          if (defectsWithoutPhotos.length === 1) {
            const d = defectsWithoutPhotos[0];
            missing.push(`ถ่ายรูปหลักฐานอย่างน้อย 1 รูป (จุดที่พบ: ${d.nameTh}${d.part ? ` - ${d.part}` : ""})`);
          } else {
            missing.push(`ถ่ายรูปหลักฐานอย่างน้อย 1 รูปสำหรับแต่ละจุด (ยังขาด ${defectsWithoutPhotos.length} จุด)`);
          }
        }
      } else if (photos.length === 0) {
        missing.push("ถ่ายรูปหลักฐานอย่างน้อย 1 รูป");
      }

      const videoRequired =
        item.videoRule === "ALWAYS" ||
        item.videoRule === "ON_FAIL" ||
        defects.some((d) => d.requiresVideo);

      if (videoRequired && !answer.video) {
        missing.push("ถ่ายวิดีโอสั้น ≤ 20 วินาที");
      }
    }
    // When status === "NORMAL" (Pass), no photo, video, or remark is required.
  } else {
    if (item.photoRule === "ALWAYS" && (answer.photos ?? []).length === 0) {
      missing.push("ถ่ายรูปหลักฐานอย่างน้อย 1 รูป (หัวข้อนี้บังคับถ่ายรูปทุกครั้ง)");
    }
    if (item.videoRule === "ALWAYS" && !answer.video) {
      missing.push("ถ่ายวิดีโอสั้น ≤ 20 วินาที (หัวข้อนี้บังคับวิดีโอทุกครั้ง)");
    }
  }

  return missing;
}

/**
 * Helper to sync all photos from selected defects into an item-level photo array,
 * ensuring each photo has defectId and part correctly attached.
 */
export function syncDefectPhotos(
  defects: readonly SelectedDefect[] = [],
  extraPhotos: readonly InspectionPhoto[] = [],
): InspectionPhoto[] {
  const defectPhotos: InspectionPhoto[] = defects.flatMap((d) =>
    (d.photos ?? []).map((p) => ({
      ...p,
      defectId: p.defectId ?? d.defectId,
      itemDefectId: p.itemDefectId ?? d.itemDefectId,
      part: p.part ?? d.part ?? null,
    })),
  );

  const defectPhotoUris = new Set(defectPhotos.map((p) => p.uri));
  const unlinkedPhotos = extraPhotos.filter((p) => !defectPhotoUris.has(p.uri));
  return [...defectPhotos, ...unlinkedPhotos];
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
    const val = answer?.value?.trim();
    const hasValidValue = Boolean(val && val.length > 0 && !Number.isNaN(Number(val)));
    if (item.isRequired && !hasValidValue) return false;
    if (item.photoRule === "ALWAYS" && (answer?.photos ?? []).length === 0) return false;
    if (item.videoRule === "ALWAYS" && !answer?.video) return false;
    return true;
  }

  if (item.inputType === "TEXT") {
    const hasValue = Boolean(answer?.value && answer.value.trim().length > 0);
    if (item.isRequired && !hasValue) return false;
    if (item.photoRule === "ALWAYS" && (answer?.photos ?? []).length === 0) return false;
    if (item.videoRule === "ALWAYS" && !answer?.video) return false;
    return true;
  }

  return !item.isRequired || Boolean(answer?.value && answer.value.trim().length > 0);
}

/**
 * Returns true when every checklist item in `items` satisfies `isItemDone`.
 * Used to automatically open the Screen S07 Summary Modal as soon as all items are completed.
 */
export function areAllItemsDone(
  items: readonly InspectionItem[],
  answers: Record<number, ItemAnswer | undefined>,
): boolean {
  return items.length > 0 && items.every((item) => isItemDone(item, answers[item.id]));
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
 * Strict Step-by-Step Gate:
 * Returns the maximum step index (0-based) that the inspector is allowed to access.
 * Step k is unlocked if and only if all steps 0 .. k-1 are completed (`isItemDone`).
 */
export function maxUnlockedStepIndex(
  items: readonly InspectionItem[],
  answers: Record<number, ItemAnswer | undefined>,
): number {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isItemDone(item, answers[item.id])) {
      return i;
    }
  }
  return Math.max(0, items.length - 1);
}

/**
 * Strict Step-by-Step Advance Block Reason:
 * Blocks advancing to the next step if the current step is not yet completed (`isItemDone`),
 * enforcing sequential 1 -> 2 -> 3 -> 4 -> 5 -> 6 progression without skipping.
 */
export function stepAdvanceBlockReason(
  item: InspectionItem,
  answer?: ItemAnswer | null,
): string | null {
  const failBlock = leaveBlockReason(item, answer);
  if (failBlock) return failBlock;

  if (isItemDone(item, answer)) return null;

  const missing = missingEvidenceForItem(item, answer);
  if (missing.length > 0) {
    return `ขั้นตอนที่ ${item.seq}: ยังขาด${missing.join(" และ ")}`;
  }

  if (item.inputType === "PASS_FAIL") {
    return `กรุณาเลือกผลขั้นตอนที่ ${item.seq} ก่อน (ห้ามข้ามขั้นตอน)`;
  }
  if (item.inputType === "NUMBER") {
    return `กรุณากรอกค่าขั้นตอนที่ ${item.seq} ก่อน (ห้ามข้ามขั้นตอน)`;
  }
  return `กรุณาทำขั้นตอนที่ ${item.seq} ให้เสร็จก่อน (ห้ามข้ามขั้นตอน)`;
}

/**
 * Checks whether jumping from `currentIndex` to `targetIndex` is permitted under strict step-by-step rules.
 * - Backward navigation (`targetIndex < currentIndex`) is allowed once any incomplete FAIL evidence on the current item is resolved.
 * - Forward navigation (`targetIndex > currentIndex`) is only allowed up to `maxUnlockedStepIndex`.
 */
export function canJumpToStep(
  items: readonly InspectionItem[],
  answers: Record<number, ItemAnswer | undefined>,
  currentIndex: number,
  targetIndex: number,
  options?: { maxUnlocked?: number },
): { allowed: true } | { allowed: false; reason: string } {
  if (targetIndex === currentIndex) return { allowed: true };

  const currentItem = items[currentIndex];
  if (currentItem) {
    const failBlock = leaveBlockReason(currentItem, answers[currentItem.id]);
    if (failBlock) {
      return { allowed: false, reason: failBlock };
    }
  }

  const unlocked = options?.maxUnlocked ?? maxUnlockedStepIndex(items, answers);
  if (targetIndex > unlocked) {
    const isCurrentFail = currentItem && answers[currentItem.id]?.status === "FAIL";
    if (isCurrentFail && isItemDone(currentItem, answers[currentItem.id])) {
      return {
        allowed: false,
        reason: `ขั้นตอนที่ ${currentItem.seq}: กรุณากด "ถัดไป" เพื่อยืนยันผลตรวจและปลดล็อกขั้นตอนถัดไป`,
      };
    }
    const blockingItem = items[unlocked];
    const seqLabel = blockingItem ? blockingItem.seq : unlocked + 1;
    return {
      allowed: false,
      reason: `กรุณาทำขั้นตอนที่ ${seqLabel} ให้เสร็จก่อน (ห้ามข้ามขั้นตอน)`,
    };
  }

  return { allowed: true };
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
