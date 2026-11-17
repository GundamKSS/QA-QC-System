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
