/**
 * Data structures and domain types for Unit Inspections (docs/02 §5, docs/03 §3.1).
 */

export const UNIT_RESULTS = ["PASS", "CONCESSION", "NOT_PASSED"] as const;
export type UnitResult = (typeof UNIT_RESULTS)[number];

export const UNIT_ACTIONS = ["REWORK", "REJECT"] as const;
export type UnitAction = (typeof UNIT_ACTIONS)[number];

export const DISPOSITIONS = ["CONCESSION", "REWORK", "REJECT", "CHOOSE"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const SEVERITIES = ["MINOR", "MAJOR", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const VIDEO_RULES = ["NONE", "ON_FAIL", "ALWAYS"] as const;
export type VideoRule = (typeof VIDEO_RULES)[number];

export const PHOTO_RULES = ["NONE", "ON_FAIL", "ALWAYS"] as const;
export type PhotoRule = (typeof PHOTO_RULES)[number];

export const ANIMATION_TYPES = [
  "SCAN_PUMP",
  "PISTON_HEAD",
  "MOTOR_BELT",
  "PRESSURE_GAUGE",
  "AIR_TANK",
  "VALVE_LEAK",
  "GENERAL_CHECK",
] as const;
export type AnimationType = (typeof ANIMATION_TYPES)[number];

export const INPUT_TYPES = ["PASS_FAIL", "NUMBER", "TEXT", "SELECT", "DISPLAY"] as const;
export type InputType = (typeof INPUT_TYPES)[number];

export const SERIAL_ENTRY_MODES = ["SCAN_CAMERA", "SCAN_WEDGE", "MANUAL"] as const;
export type SerialEntryMode = (typeof SERIAL_ENTRY_MODES)[number];

export const ENTRY_MODES = ["LIVE", "PAPER_BACKFILL"] as const;
export type EntryMode = (typeof ENTRY_MODES)[number];

export const CAUSE_TAGS = ["SUPPLIER", "TRANSPORT", "INTERNAL", "UNKNOWN"] as const;
export type CauseTag = (typeof CAUSE_TAGS)[number];

export type InspectionRole = "QC" | "QA";
export type BrandGroup = "PUMA" | "OTHER";

/** Checklist item loaded from template version (dbo.checklist_items). */
export type InspectionItem = {
  id: number;
  seq: number;
  topicCode: string | null;
  title: string;
  inputType: InputType;
  isRequired: boolean;
  photoRule?: string | null;
  videoRule: VideoRule;
  animationType?: AnimationType | null;
  helpText?: string | null;
  exampleImage?: string | null;
};

/** An active defect finding selected for an item. */
export type SelectedDefect = {
  itemDefectId?: number | null;
  defectId: number;
  code: string;
  nameTh: string;
  part?: string | null;
  severity: Severity;
  disposition: Disposition;
  requiresVideo?: boolean;
  causeTag?: CauseTag | null;
  locationNote?: string | null;
};

/** Evidence photo attached to an item. */
export type InspectionPhoto = {
  id?: string;
  uri: string;
  timestamp: string;
  pHash?: string | null;
};

/** Evidence video attached to an item. */
export type InspectionVideo = {
  id?: string;
  uri: string;
  durationSeconds: number;
};

/** The recorded answer and attached evidence for a single checklist item. */
export type ItemAnswer = {
  status?: "NORMAL" | "FAIL" | null;
  value?: string | null;
  remark?: string | null;
  defects?: SelectedDefect[];
  photos?: InspectionPhoto[];
  video?: InspectionVideo | null;
};

/** Full evaluated outcome of a machine inspection (BR-04). */
export type UnitEvaluation = {
  result: UnitResult;
  failedItems: { item: InspectionItem; answer: ItemAnswer }[];
  allDefects: SelectedDefect[];
  /** Action recommended by the system based on defect dispositions (REJECT > REWORK). */
  suggestedAction: UnitAction | null;
  /** Forced action when a Critical defect carries a REJECT disposition (BR-04, B5). */
  forcedAction: UnitAction | null;
  reason: string;
};

/** Pending machine rework record displayed on Jobs (S04) and used by Rework Runner (S08). */
export type PendingReworkItem = {
  id: string; // unit_inspections.id
  workOrderId: string;
  woNo: string;
  planId: number;
  planNo: string;
  modelCode: string;
  description: string | null;
  serialPump: string;
  roundNo: number;
  failedItemCount: number;
  defectNames: string | null;
  role: InspectionRole;
  submittedAt: string | null;
  inspectorId: string;
  inspectorName: string;
};

/**
 * One inspector's progress inside one work order (Head QC progress view / "งานของฉัน").
 * `done` counts machines the person has inspected (first round); the rest classify each machine's latest round.
 */
export type InspectorProgress = {
  done: number;
  passed: number;
  /** Failed with action REWORK and not fixed yet — the inspector still owes the fix. */
  reworkPending: number;
  /** Failed and rejected (no rework expected). */
  rejected: number;
  /** Machines the person opened (first round) but has not submitted yet — they can resume them. */
  drafts?: InspectionDraft[];
};

/** A first-round inspection still IN_PROGRESS — what the jobs screen needs to send the person back to it. */
export type InspectionDraft = { inspectionId: string; serialPump: string };

/** Details of an item that failed in the previous round, loaded by Rework Runner (S08). */
export type FailedItemFinding = {
  itemId: number;
  seq: number;
  topicCode: string | null;
  title: string;
  videoRule: VideoRule;
  defects: SelectedDefect[];
  photos: InspectionPhoto[];
  video?: InspectionVideo | null;
  remark?: string | null;
};

/** Stored machine inspection entity (dbo.unit_inspections). */
export type StoredInspection = {
  id: string;
  planId: number;
  workOrderId: string | null;
  role: InspectionRole;
  cycleNo: number;
  roundNo: number;
  inspectionNo: number | null;
  serialPump: string;
  serialMotor: string | null;
  serialSupplier: string | null;
  serialEntryMode: SerialEntryMode;
  entryMode: EntryMode;
  inspectorId: string;
  inspectorName?: string;
  startedAt: Date;
  submittedAt: Date | null;
  result: UnitResult | null;
  action: UnitAction | null;
  suggestedAction: UnitAction | null;
  parentInspectionId?: string | null;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  answers?: Record<number, ItemAnswer>;
};

export type InspectionTemplateData = {
  template: {
    id: number;
    code: string;
    name: string;
    role: InspectionRole;
    versionId: number;
    versionNo: number;
  };
  items: InspectionItem[];
  itemDefects: Record<number, SelectedDefect[]>;
  brandGroup: BrandGroup;
  modelCode: string;
  modelDescription: string | null;
  planNo: string;
  docNo: string;
};

/** Full data needed to run a Rework session (Screen S08). */
export type ReworkDetails = {
  inspection: StoredInspection;
  planNo: string;
  modelCode: string;
  description: string | null;
  failedItems: FailedItemFinding[];
  template?: InspectionTemplateData | null;
  previousAnswers?: Record<number, ItemAnswer>;
};

/** Recorded answer for an item during a Rework session. */
export type ReworkItemAnswer = {
  status: "NORMAL" | "FAIL" | null;
  fixes?: { defectId: number; fixMethod: string; fixNote?: string }[];
  defects?: SelectedDefect[];
  photos?: InspectionPhoto[];
  video?: InspectionVideo | null;
  remark?: string | null;
};

/** Input to submit a completed Rework session. */
export type SubmitReworkInput = {
  parentInspectionId: string;
  answers: Record<number, ReworkItemAnswer>;
  decision?: UnitAction | null;
};

/** Summary metrics of inspected units under a plan (for Head QC dashboard / Plan details). */
export type PlanInspectionSummary = {
  passCount: number;
  reworkCount: number;
  rejectCount: number;
  inProgressCount: number;
};

/** Individual unit inspection record under a plan (for Head QC inspected units log). */
export type PlanUnitInspectionItem = {
  id: string;
  workOrderId: string;
  woNo: string;
  role: InspectionRole;
  cycleNo: number;
  roundNo: number;
  inspectionNo: number;
  serialPump: string | null;
  serialMotor: string | null;
  serialSupplier: string | null;
  result: UnitResult | null;
  failureDecision: UnitAction | "CHOOSE" | null;
  inspectorId: string;
  inspectorName: string;
  startedAt: string;
  submittedAt: string | null;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  failedItemCount: number;
  defectNames: string | null;
};

/** Aggregated monthly quality & output metrics for an individual QC inspector. */
export type InspectorMonthlyStats = {
  totalInspected: number;
  passedCount: number;
  failedCount: number;
  reworkResolvedCount: number;
  firstTimePassRate: number;
  topDefectName: string | null;
};


