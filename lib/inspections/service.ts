import {
  evalUnitResult,
  unansweredRequiredItems,
  validateSerial,
} from "./rules";
import type {
  CompletedInspectionInput,
  InspectionQuota,
  InspectionStore,
  InspectionTemplateData,
  NewClaimInput,
  StoredInspection,
} from "./store";
import type {
  EntryMode,
  InspectionRole,
  ItemAnswer,
  SerialEntryMode,
  UnitAction,
  UnitEvaluation,
} from "./types";

export type InspectionContext = {
  actorId: string;
  actorName: string;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
};

/** Load checklist template and defect items for a plan and role. */
export async function loadInspectionTemplate(
  store: InspectionStore,
  planId: number,
  role: InspectionRole = "QC",
): Promise<InspectionTemplateData | null> {
  return store.getTemplate(planId, role);
}

/** Get live queue quota and active claims for a work order. */
export async function loadWorkOrderQuota(
  store: InspectionStore,
  workOrderId: string,
): Promise<InspectionQuota | null> {
  return store.getQuota(workOrderId);
}

export type ClaimUnitInput = {
  planId: number;
  workOrderId: string;
  role?: InspectionRole;
  serialPump: string;
  serialMotor?: string | null;
  serialSupplier?: string | null;
  serialEntryMode?: SerialEntryMode;
  entryMode?: EntryMode;
  inspectionId?: string;
  existingSerials?: string[];
};

export type ClaimUnitResult =
  | { kind: "claimed"; inspection: StoredInspection; quota: InspectionQuota }
  | { kind: "resumed"; inspection: StoredInspection; quota: InspectionQuota }
  | { kind: "invalid_serial"; message: string }
  | { kind: "already_completed"; message: string }
  | { kind: "claimed_by_other"; message: string; inspectorName: string }
  | { kind: "quota_full"; message: string; quota: InspectionQuota }
  | { kind: "not_found"; message: string };

/**
 * Claim and reserve a unit for inspection (Live Unit Claiming pool).
 * Locks the serial number to the inspector and deducts from the live quota.
 */
export async function claimUnitInspection(
  store: InspectionStore,
  input: ClaimUnitInput,
  context: InspectionContext,
): Promise<ClaimUnitResult> {
  // Dev user is in spectator/view-only mode — only actual assigned responsible inspectors may inspect
  if (context.actorName === "dev gundam" || context.actorId === "2") {
    return {
      kind: "not_found",
      message: "ผู้ใช้ Dev มีสิทธิ์เข้าดูข้อมูลเท่านั้น — ไม่สามารถจองหรือเริ่มตรวจเครื่องได้ (ต้องให้ผู้รับผิดชอบจริงเป็นผู้ตรวจ)",
    };
  }

  // 1. Validate serial format and uniqueness
  const validation = validateSerial(input.serialPump, {
    existingSerials: input.existingSerials ?? [],
  });
  if (!validation.ok) {
    return { kind: "invalid_serial", message: validation.message };
  }

  const claimInput: NewClaimInput = {
    id: input.inspectionId,
    planId: input.planId,
    workOrderId: input.workOrderId,
    role: input.role ?? "QC",
    serialPump: validation.serial,
    serialMotor: input.serialMotor,
    serialSupplier: input.serialSupplier,
    serialEntryMode: input.serialEntryMode ?? "MANUAL",
    entryMode: input.entryMode ?? "LIVE",
    inspectorId: context.actorId,
    inspectorName: context.actorName,
  };

  const outcome = await store.claimUnit(claimInput);
  return outcome;
}

/** Cancel / release an in-progress unit claim, returning the quota back to the pool. */
export async function cancelUnitClaim(
  store: InspectionStore,
  inspectionId: string,
  context: InspectionContext,
): Promise<boolean> {
  return store.cancelClaim(inspectionId, context.actorId);
}

export type SubmitInspectionInput = {
  inspectionId: string;
  workOrderId: string;
  planId: number;
  role?: InspectionRole;
  answers: Record<number, ItemAnswer>;
  decision?: UnitAction | null;
};

export type SubmitInspectionResult =
  | {
      kind: "saved";
      inspection: StoredInspection;
      evaluation: UnitEvaluation;
      qtyDone: number;
      qtyNeed: number;
    }
  | { kind: "incomplete"; message: string; missingItemIds: number[] }
  | { kind: "decision_required"; message: string }
  | { kind: "forced_reject"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "not_in_progress"; message: string };

/**
 * Submit completed inspection answers, evaluate result according to BR-04,
 * and update the work order's inspected count.
 */
export async function submitUnitInspection(
  store: InspectionStore,
  input: SubmitInspectionInput,
  context: InspectionContext,
): Promise<SubmitInspectionResult> {
  const role = input.role ?? "QC";

  // 1. Load template to evaluate required items and rules
  const templateData = await store.getTemplate(input.planId, role);
  const items = templateData?.items ?? [];

  // 1.5 Validate answer statuses before touching DB (avoids SQL CHECK constraint 503 on bad input)
  const VALID_ITEM_STATUSES = new Set(["NORMAL", "FAIL", "NA"]);
  const invalidStatusIds: number[] = [];
  for (const [rawKey, ans] of Object.entries(input.answers)) {
    if (ans?.status != null && !VALID_ITEM_STATUSES.has(ans.status)) {
      const numericId = Number(rawKey);
      if (Number.isFinite(numericId)) invalidStatusIds.push(numericId);
    }
  }
  if (invalidStatusIds.length > 0) {
    return {
      kind: "incomplete",
      message: "สถานะผลตรวจไม่ถูกต้อง (ต้องเป็น NORMAL, FAIL หรือ NA)",
      missingItemIds: invalidStatusIds,
    };
  }

  // 2. Validate all required items are answered with adequate evidence
  const missing = unansweredRequiredItems(items, input.answers);
  if (missing.length > 0) {
    return {
      kind: "incomplete",
      message: `ยังตอบไม่ครบ ${missing.length} หัวข้อบังคับ (หัวข้อ ${missing.map((m) => m.seq).join(", ")})`,
      missingItemIds: missing.map((m) => m.id),
    };
  }

  // 3. Evaluate machine outcome (BR-04)
  const evaluation = evalUnitResult(items, input.answers, { role });

  // 4. Validate decision for NOT_PASSED
  let action: UnitAction | null = null;
  if (evaluation.result === "NOT_PASSED") {
    if (!input.decision) {
      return {
        kind: "decision_required",
        message: "ผลตรวจไม่ผ่าน กรุณาเลือกว่าจะส่งซ่อม (Rework) หรือคัดออก (Reject)",
      };
    }
    action = input.decision;
  }

  // 5. Save to database/store
  const completedInput: CompletedInspectionInput = {
    inspectionId: input.inspectionId,
    workOrderId: input.workOrderId,
    planId: input.planId,
    role,
    answers: input.answers,
    result: evaluation.result,
    action,
    suggestedAction: evaluation.suggestedAction,
    inspectorId: context.actorId,
  };

  const outcome = await store.submitResult(completedInput);

  if (outcome.kind !== "saved") {
    return outcome;
  }

  return {
    kind: "saved",
    inspection: outcome.inspection,
    evaluation,
    qtyDone: outcome.qtyDone,
    qtyNeed: outcome.qtyNeed,
  };
}
