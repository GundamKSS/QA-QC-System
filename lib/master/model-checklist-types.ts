import {
  ANIMATION_TYPES,
  INPUT_TYPES,
  PHOTO_RULES,
  VIDEO_RULES,
  type AnimationType,
  type InputType,
  type InspectionItem,
  type InspectionRole,
  type PhotoRule,
  type VideoRule,
} from "@/lib/inspections/types";

export type ModelChecklistItemInput = {
  topicCode: string | null;
  title: string;
  inputType: InputType;
  isRequired: boolean;
  photoRule: PhotoRule;
  videoRule: VideoRule;
  animationType: AnimationType;
  helpText: string | null;
};

export type ChecklistTemplateLinkedModel = {
  modelId: number;
  modelCode: string;
  modelDescription: string | null;
  brandName: string;
};

export type ChecklistTemplateSummary = {
  templateId: number;
  templateCode: string;
  templateName: string;
  role: InspectionRole;
  scope: string | null;
  versionId: number;
  versionNo: number;
  itemCount: number;
  updatedAt: string | null;
  linkedModels: ChecklistTemplateLinkedModel[];
};

export type ModelChecklistSummary = {
  modelId: number;
  modelCode: string;
  modelDescription: string | null;
  brandName: string;
  pumpTypeName: string | null;
  role: InspectionRole;
  templateId: number | null;
  templateCode: string;
  templateName?: string;
  versionId: number;
  versionNo: number;
  itemCount: number;
  updatedAt: string | null;
};

export type ModelChecklistPayload = {
  templates: ChecklistTemplateSummary[];
  selectedTemplateId: number;
  models: ModelChecklistSummary[];
  selectedModelId: number;
  role: InspectionRole;
  activeVersionNo: number;
  items: InspectionItem[];
  masterPool: readonly ModelChecklistItemInput[];
};

export type ChecklistVersionHistoryItem = {
  seq: number;
  topicCode: string | null;
  title: string;
  inputType: InputType;
  isRequired: boolean;
  photoRule: PhotoRule;
  videoRule: VideoRule;
  animationType: AnimationType | null;
  helpText: string | null;
};

export type ChecklistVersionHistoryEntry = {
  versionId: number;
  versionNo: number;
  status: string;
  source: string;
  publishedAt: string | null;
  publishedByCode: string | null;
  publishedByName: string | null;
  itemCount: number;
  items: ChecklistVersionHistoryItem[];
};

export type ModelChecklistAuditEntry = {
  id: number;
  at: string;
  action: string;
  actorCode: string | null;
  actorName?: string | null;
  description?: string | null;
  versionNo?: number;
  itemCount?: number;
  ip: string | null;
};

export type ModelChecklistHistoryPayload = {
  templateId?: number;
  templateCode?: string;
  templateName?: string;
  modelId: number;
  modelCode: string;
  modelDescription: string | null;
  role: InspectionRole;
  currentVersionNo: number;
  versions: ChecklistVersionHistoryEntry[];
  auditLogs: ModelChecklistAuditEntry[];
};

/**
 * Common Master Checklist Library Pool (คลังหัวข้อตรวจกลางมาตรฐาน)
 * Admin can 1-click pick from this common pool to add to any template, or create custom items.
 */
export const MASTER_CHECKLIST_POOL: readonly ModelChecklistItemInput[] = [
  {
    topicCode: "CHK-01",
    title: "ตรวจสอบสภาพภายนอก ถังลม และสีเคลือบผิว",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "NONE",
    animationType: "SCAN_PUMP",
    helpText: "สแกนตรวจดูรอยถลอก รอยบุบ สติกเกอร์รุ่น และความเรียบร้อยของสีตัวถัง",
  },
  {
    topicCode: "CHK-02",
    title: "ตรวจสอบความแน่นของน็อตยึด ฝาสูบ และชิ้นส่วนประกอบ",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "NONE",
    animationType: "PISTON_HEAD",
    helpText: "ตรวจสอบแรงขันน็อตยึดหัวปั๊ม แท่นมอเตอร์ และการ์ดครอบสายพาน",
  },
  {
    topicCode: "CHK-03",
    title: "ตรวจสอบระดับและคุณภาพน้ำมันหล่อลื่นในตาแมว",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "NONE",
    animationType: "AIR_TANK",
    helpText: "ระดับน้ำมันต้องอยู่กึ่งกลางตาแมว สีใส ไม่ขุ่นหรือมีฟองอากาศ",
  },
  {
    topicCode: "CHK-04",
    title: "ทดสอบการเดินเครื่อง มู่เล่ย์ สายพาน และเสียงรบกวน",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "ALWAYS",
    animationType: "MOTOR_BELT",
    helpText: "เดินเครื่องทดสอบความตึงสายพาน ศูนย์มู่เล่ย์ และบันทึกวิดีโอขณะหมุน",
  },
  {
    topicCode: "CHK-05",
    title: "ตรวจสอบการรั่วซึมของลมตามข้อต่อและเช็ควาล์ว",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "ON_FAIL",
    animationType: "VALVE_LEAK",
    helpText: "ใช้น้ำสบู่ตรวจเช็ครอยรั่วซึมรอบจุดต่อท่อส่งลมและเช็ควาล์ว",
  },
  {
    topicCode: "CHK-06",
    title: "วัดแรงดันตัดอัตโนมัติ (Cut-out Pressure) (Bar)",
    inputType: "NUMBER",
    isRequired: true,
    photoRule: "NONE",
    videoRule: "NONE",
    animationType: "PRESSURE_GAUGE",
    helpText: "บันทึกค่าแรงดัน (Bar) เมื่อ Pressure Switch ตัดการทำงานอัตโนมัติ",
  },
  {
    topicCode: "CHK-07",
    title: "วัดแรงดันต่อการทำงานอัตโนมัติ (Cut-in Pressure) (Bar)",
    inputType: "NUMBER",
    isRequired: true,
    photoRule: "NONE",
    videoRule: "NONE",
    animationType: "PRESSURE_GAUGE",
    helpText: "ปล่อยลมออกและบันทึกค่าแรงดัน (Bar) เมื่อมอเตอร์เริ่มทำงานอีกครั้ง",
  },
  {
    topicCode: "CHK-08",
    title: "ตรวจสอบแนวรอยเชื่อมถังลมและวาล์วนิรภัย (Safety Valve)",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "NONE",
    animationType: "AIR_TANK",
    helpText: "ดึงทดสอบ Safety Valve และตรวจรอยเชื่อมรอบถังลม",
  },
  {
    topicCode: "CHK-09",
    title: "ตรวจวัดกระแสไฟฟ้าขณะเดินเครื่องเต็มพิกัด (Amp)",
    inputType: "NUMBER",
    isRequired: true,
    photoRule: "NONE",
    videoRule: "NONE",
    animationType: "MOTOR_BELT",
    helpText: "ใช้ Clamp Meter วัดกระแสไฟฟ้า (A) ไม่ให้เกินพิกัดบนเนมเพลทมอเตอร์",
  },
  {
    topicCode: "CHK-10",
    title: "ถ่ายรูปเนมเพลทและสภาพเครื่องสมบูรณ์ก่อนส่งมอบ",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ALWAYS",
    videoRule: "NONE",
    animationType: "SCAN_PUMP",
    helpText: "บังคับถ่ายรูปคู่เนมเพลทและตัวเครื่องที่ตรวจผ่านแล้วทุกครั้ง",
  },
];

export type SaveChecklistData = {
  templateId?: number;
  isNewTemplate?: boolean;
  templateCode?: string;
  templateName?: string;
  scope?: string | null;
  modelId?: number;
  role: InspectionRole;
  items: ModelChecklistItemInput[];
};

export type AssignModelTemplateData = {
  action: "assign_model_template";
  modelId: number;
  role: InspectionRole;
  templateId: number | null;
};

export type ParsedSaveChecklist =
  | {
      ok: true;
      data: SaveChecklistData;
    }
  | { ok: false; message: string };

/**
 * Validate payload when Admin saves/publishes a checklist template (or creates a new template).
 */
export function parseSaveModelChecklistInput(raw: {
  templateId?: unknown;
  isNewTemplate?: unknown;
  templateCode?: unknown;
  templateName?: unknown;
  scope?: unknown;
  modelId?: unknown;
  role?: unknown;
  items?: unknown;
}): ParsedSaveChecklist {
  const role: InspectionRole = raw.role === "QA" ? "QA" : "QC";
  const isNewTemplate = raw.isNewTemplate === true || raw.isNewTemplate === "true" || raw.isNewTemplate === "1";

  const rawTemplateId = raw.templateId !== undefined && raw.templateId !== null && raw.templateId !== "" ? Number(raw.templateId) : undefined;
  const rawModelId = raw.modelId !== undefined && raw.modelId !== null && raw.modelId !== "" ? Number(raw.modelId) : undefined;

  const templateId = rawTemplateId && Number.isInteger(rawTemplateId) && rawTemplateId > 0 ? rawTemplateId : undefined;
  const modelId = rawModelId && Number.isInteger(rawModelId) && rawModelId > 0 ? rawModelId : undefined;

  if (!isNewTemplate && !templateId && !modelId) {
    return { ok: false, message: "กรุณาเลือกเทมเพลตเช็คลิสต์หรือโมเดลที่ต้องการบันทึก" };
  }

  const templateCode = typeof raw.templateCode === "string" ? raw.templateCode.trim().slice(0, 64) : undefined;
  const templateName = typeof raw.templateName === "string" ? raw.templateName.trim().slice(0, 200) : undefined;
  const scopeRaw = typeof raw.scope === "string" ? raw.scope.trim().slice(0, 100) : "";
  const scope = scopeRaw ? scopeRaw : null;

  if (isNewTemplate) {
    if (!templateCode) {
      return { ok: false, message: "กรุณาระบุรหัส Template (เช่น TPL-QC-01)" };
    }
    if (!templateName) {
      return { ok: false, message: "กรุณาระบุชื่อ Template (เช่น Template 1 — ปั๊มลูกสูบ)" };
    }
  }

  let parsedItemsRaw: unknown[] = [];
  if (typeof raw.items === "string") {
    try {
      const json = JSON.parse(raw.items);
      if (Array.isArray(json)) parsedItemsRaw = json;
    } catch {
      return { ok: false, message: "รูปแบบรายการเช็คลิสต์ไม่ถูกต้อง" };
    }
  } else if (Array.isArray(raw.items)) {
    parsedItemsRaw = raw.items;
  }

  if (parsedItemsRaw.length === 0) {
    return { ok: false, message: "ต้องมีหัวข้อเช็คลิสต์อย่างน้อย 1 ขั้นตอน" };
  }
  if (parsedItemsRaw.length > 30) {
    return { ok: false, message: "กำหนดหัวข้อเช็คลิสต์ได้สูงสุดไม่เกิน 30 ขั้นตอนต่อเทมเพลต" };
  }

  const items: ModelChecklistItemInput[] = [];
  for (let i = 0; i < parsedItemsRaw.length; i++) {
    const row = parsedItemsRaw[i] as Record<string, unknown> | null;
    if (!row || typeof row !== "object") {
      return { ok: false, message: `ข้อมูลขั้นตอนที่ ${i + 1} ไม่ถูกต้อง` };
    }

    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!title) {
      return { ok: false, message: `กรุณาระบุชื่อหัวข้อตรวจในขั้นตอนที่ ${i + 1}` };
    }
    if (title.length > 400) {
      return { ok: false, message: `ชื่อหัวข้อตรวจในขั้นตอนที่ ${i + 1} ยาวเกิน 400 ตัวอักษร` };
    }

    const topicCodeRaw = typeof row.topicCode === "string" ? row.topicCode.trim() : "";
    const topicCode = topicCodeRaw ? topicCodeRaw.slice(0, 32) : `CHK-${String(i + 1).padStart(2, "0")}`;

    const inputType = (INPUT_TYPES as readonly string[]).includes(String(row.inputType))
      ? (String(row.inputType) as InputType)
      : "PASS_FAIL";

    const photoRule = (PHOTO_RULES as readonly string[]).includes(String(row.photoRule))
      ? (String(row.photoRule) as PhotoRule)
      : "ON_FAIL";

    const videoRule = (VIDEO_RULES as readonly string[]).includes(String(row.videoRule))
      ? (String(row.videoRule) as VideoRule)
      : "NONE";

    const animationType = (ANIMATION_TYPES as readonly string[]).includes(String(row.animationType))
      ? (String(row.animationType) as AnimationType)
      : "GENERAL_CHECK";

    const helpTextRaw = typeof row.helpText === "string" ? row.helpText.trim() : "";
    const helpText = helpTextRaw ? helpTextRaw.slice(0, 1000) : null;

    items.push({
      topicCode,
      title,
      inputType,
      isRequired: row.isRequired !== false,
      photoRule,
      videoRule,
      animationType,
      helpText,
    });
  }

  return {
    ok: true,
    data: {
      templateId,
      isNewTemplate,
      templateCode,
      templateName,
      scope,
      modelId,
      role,
      items,
    },
  };
}
