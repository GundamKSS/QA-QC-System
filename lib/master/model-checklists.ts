import "server-only";
import { dbConfigured } from "@/lib/db/config";
import { getPool, sql } from "@/lib/db/pool";
import { inferItemAnimationType } from "@/lib/inspections/rules";
import { DEMO_INSPECTION_ITEMS } from "@/lib/inspections/store";
import type { AnimationType, InputType, InspectionItem, InspectionRole } from "@/lib/inspections/types";
import {
  MASTER_CHECKLIST_POOL,
  type ChecklistTemplateSummary,
  type ChecklistVersionHistoryEntry,
  type ChecklistVersionHistoryItem,
  type ModelChecklistAuditEntry,
  type ModelChecklistHistoryPayload,
  type ModelChecklistPayload,
  type ModelChecklistSummary,
  type SaveChecklistData,
} from "./model-checklist-types";

type MemoryTemplateRecord = {
  templateId: number;
  templateCode: string;
  templateName: string;
  role: InspectionRole;
  scope: string | null;
  versionId: number;
  versionNo: number;
  updatedAt: string;
  items: InspectionItem[];
  history?: ChecklistVersionHistoryEntry[];
  auditLogs?: ModelChecklistAuditEntry[];
};

type MemoryModelLink = {
  modelId: number;
  modelCode: string;
  modelDescription: string | null;
  brandName: string;
  pumpTypeName: string | null;
  templates: Record<InspectionRole, number | null>;
};

function toChecklistVersionHistoryItem(it: {
  seq: number;
  topicCode?: string | null;
  title: string;
  inputType: InputType;
  isRequired?: boolean;
  photoRule?: string | null;
  videoRule?: string | null;
  animationType?: AnimationType | null;
  helpText?: string | null;
}): ChecklistVersionHistoryItem {
  return {
    seq: it.seq,
    topicCode: it.topicCode ?? null,
    title: it.title,
    inputType: it.inputType,
    isRequired: it.isRequired !== false,
    photoRule: it.photoRule === "ALWAYS" || it.photoRule === "NONE" ? it.photoRule : "ON_FAIL",
    videoRule: it.videoRule === "ALWAYS" || it.videoRule === "ON_FAIL" ? it.videoRule : "NONE",
    animationType: it.animationType ?? null,
    helpText: it.helpText ?? null,
  };
}

const INITIAL_MEMORY_TEMPLATES: MemoryTemplateRecord[] = [
  {
    templateId: 101,
    templateCode: "TPL-QC-01",
    templateName: "Template 1 — ปั๊มลมลูกสูบมาตรฐาน (Piston)",
    role: "QC",
    scope: "Piston (ลูกสูบ)",
    versionId: 1001,
    versionNo: 1,
    updatedAt: "2026-11-10T06:00:00.000Z",
    items: DEMO_INSPECTION_ITEMS.slice(0, 6).map((item, idx) => ({
      ...item,
      id: 1000 + idx + 1,
      seq: idx + 1,
    })),
  },
  {
    templateId: 201,
    templateCode: "TPL-QC-02",
    templateName: "Template 2 — ปั๊มลมลูกสูบอุตสาหกรรม (Full Check)",
    role: "QC",
    scope: "Piston 2-Stage",
    versionId: 2001,
    versionNo: 1,
    updatedAt: "2026-11-10T06:00:00.000Z",
    items: DEMO_INSPECTION_ITEMS.map((item, idx) => ({
      ...item,
      id: 3000 + idx + 1,
      seq: idx + 1,
    })),
  },
  {
    templateId: 301,
    templateCode: "TPL-QC-03",
    templateName: "Template 3 — ปั๊มลม Oil-Free ไร้น้ำมัน",
    role: "QC",
    scope: "Oil-Free (ไร้น้ำมัน)",
    versionId: 3001,
    versionNo: 1,
    updatedAt: "2026-11-10T06:00:00.000Z",
    items: [
      DEMO_INSPECTION_ITEMS[0],
      DEMO_INSPECTION_ITEMS[1],
      DEMO_INSPECTION_ITEMS[4],
      DEMO_INSPECTION_ITEMS[5],
    ].map((item, idx) => ({
      ...item,
      id: 5000 + idx + 1,
      seq: idx + 1,
    })),
  },
  {
    templateId: 102,
    templateCode: "TPL-QA-01",
    templateName: "Template 1 (QA) — สุ่มตรวจปั๊มลมลูกสูบ",
    role: "QA",
    scope: "Piston (ลูกสูบ)",
    versionId: 1002,
    versionNo: 1,
    updatedAt: "2026-11-10T06:00:00.000Z",
    items: DEMO_INSPECTION_ITEMS.slice(0, 5).map((item, idx) => ({
      ...item,
      id: 2000 + idx + 1,
      seq: idx + 1,
    })),
  },
  {
    templateId: 202,
    templateCode: "TPL-QA-02",
    templateName: "Template 2 (QA) — สุ่มตรวจปั๊มลมอุตสาหกรรม",
    role: "QA",
    scope: "Piston 2-Stage",
    versionId: 2002,
    versionNo: 1,
    updatedAt: "2026-11-10T06:00:00.000Z",
    items: DEMO_INSPECTION_ITEMS.slice(0, 5).map((item, idx) => ({
      ...item,
      id: 4000 + idx + 1,
      seq: idx + 1,
    })),
  },
  {
    templateId: 302,
    templateCode: "TPL-QA-03",
    templateName: "Template 3 (QA) — สุ่มตรวจปั๊มลม Oil-Free",
    role: "QA",
    scope: "Oil-Free (ไร้น้ำมัน)",
    versionId: 3002,
    versionNo: 1,
    updatedAt: "2026-11-10T06:00:00.000Z",
    items: [
      DEMO_INSPECTION_ITEMS[0],
      DEMO_INSPECTION_ITEMS[4],
      DEMO_INSPECTION_ITEMS[5],
    ].map((item, idx) => ({
      ...item,
      id: 6000 + idx + 1,
      seq: idx + 1,
    })),
  },
];

const INITIAL_MEMORY_MODELS: MemoryModelLink[] = [
  {
    modelId: 1,
    modelCode: "PP-21",
    modelDescription: "ปั๊มลมลูกสูบสายพาน PUMA 1 HP ถัง 64 ลิตร",
    brandName: "PUMA",
    pumpTypeName: "Piston (ลูกสูบ)",
    templates: { QC: 101, QA: 102 },
  },
  {
    modelId: 2,
    modelCode: "PP-22",
    modelDescription: "ปั๊มลมลูกสูบสายพาน PUMA 2 HP ถัง 95 ลิตร",
    brandName: "PUMA",
    pumpTypeName: "Piston (ลูกสูบ)",
    templates: { QC: 201, QA: 202 },
  },
  {
    modelId: 3,
    modelCode: "OS-25",
    modelDescription: "ปั๊มลม Oil-Free เสียงเงียบ 25 ลิตร",
    brandName: "PUMA",
    pumpTypeName: "Oil-Free (ไร้น้ำมัน)",
    templates: { QC: 301, QA: 302 },
  },
];

let memoryTemplates: MemoryTemplateRecord[] = structuredClone(INITIAL_MEMORY_TEMPLATES);
let memoryModels: MemoryModelLink[] = structuredClone(INITIAL_MEMORY_MODELS);
let nextTemplateId = 500;
let nextItemId = 9000;
let nextVersionId = 8000;

export function resetMemoryModelChecklists(): void {
  memoryTemplates = structuredClone(INITIAL_MEMORY_TEMPLATES);
  memoryModels = structuredClone(INITIAL_MEMORY_MODELS);
  nextTemplateId = 500;
  nextItemId = 9000;
  nextVersionId = 8000;
}

function loadMemoryModelChecklistPayload(query: {
  templateId?: number;
  modelId?: number;
  role?: InspectionRole;
}): ModelChecklistPayload {
  const matchedById = query.templateId
    ? memoryTemplates.find((t) => t.templateId === query.templateId)
    : undefined;
  const role: InspectionRole = matchedById
    ? matchedById.role
    : query.role === "QA"
    ? "QA"
    : "QC";
  const roleTemplates = memoryTemplates.filter((t) => t.role === role);

  const templateSummaries: ChecklistTemplateSummary[] = roleTemplates.map((t) => {
    const linkedModels = memoryModels
      .filter((m) => m.templates[role] === t.templateId)
      .map((m) => ({
        modelId: m.modelId,
        modelCode: m.modelCode,
        modelDescription: m.modelDescription,
        brandName: m.brandName,
      }));
    return {
      templateId: t.templateId,
      templateCode: t.templateCode,
      templateName: t.templateName,
      role: t.role,
      scope: t.scope,
      versionId: t.versionId,
      versionNo: t.versionNo,
      itemCount: t.items.length,
      updatedAt: t.updatedAt,
      linkedModels,
    };
  });

  const modelSummaries: ModelChecklistSummary[] = memoryModels.map((m) => {
    const tplId = m.templates[role];
    const tpl = roleTemplates.find((t) => t.templateId === tplId) ?? roleTemplates[0];
    return {
      modelId: m.modelId,
      modelCode: m.modelCode,
      modelDescription: m.modelDescription,
      brandName: m.brandName,
      pumpTypeName: m.pumpTypeName,
      role,
      templateId: tplId ?? null,
      templateCode: tpl?.templateCode ?? "",
      templateName: tpl?.templateName ?? "",
      versionId: tpl?.versionId ?? 1,
      versionNo: tpl?.versionNo ?? 1,
      itemCount: tpl?.items.length ?? 0,
      updatedAt: tpl?.updatedAt ?? null,
    };
  });

  const selectedModel =
    memoryModels.find((m) => m.modelId === query.modelId) ?? memoryModels[0];

  let selectedTemplate = roleTemplates.find((t) => t.templateId === query.templateId);
  if (!selectedTemplate && query.modelId) {
    const linkedTplId = selectedModel?.templates[role];
    selectedTemplate = roleTemplates.find((t) => t.templateId === linkedTplId);
  }
  if (!selectedTemplate) {
    selectedTemplate = roleTemplates[0];
  }

  return {
    templates: templateSummaries,
    selectedTemplateId: selectedTemplate.templateId,
    models: modelSummaries,
    selectedModelId: selectedModel.modelId,
    role,
    activeVersionNo: selectedTemplate.versionNo,
    items: selectedTemplate.items,
    masterPool: MASTER_CHECKLIST_POOL,
  };
}

function saveMemoryModelChecklist(
  input: SaveChecklistData,
  userMeta?: { employeeCode?: string; fullName?: string },
): {
  templateId: number;
  templateCode: string;
  templateName: string;
  versionId: number;
  versionNo: number;
  itemCount: number;
  modelCode: string;
} | null {
  const newItems: InspectionItem[] = input.items.map((item, idx) => ({
    id: ++nextItemId,
    seq: idx + 1,
    topicCode: item.topicCode,
    title: item.title,
    inputType: item.inputType,
    isRequired: item.isRequired,
    photoRule: item.photoRule,
    videoRule: item.videoRule,
    animationType: item.animationType,
    helpText: item.helpText,
  }));

  const actorCode = userMeta?.employeeCode ?? "04712";
  const actorName = userMeta?.fullName ?? "สมศักดิ์ สดใส (QC Head)";

  if (input.isNewTemplate) {
    const newTplId = ++nextTemplateId;
    const newVersionId = ++nextVersionId;
    const now = new Date().toISOString();
    const code = input.templateCode || `TPL-${input.role}-${newTplId}`;
    const name = input.templateName || code;

    const newTpl: MemoryTemplateRecord = {
      templateId: newTplId,
      templateCode: code,
      templateName: name,
      role: input.role,
      scope: input.scope ?? null,
      versionId: newVersionId,
      versionNo: 1,
      updatedAt: now,
      items: newItems,
      history: [
        {
          versionId: newVersionId,
          versionNo: 1,
          status: "PUBLISHED",
          source: "BUILDER",
          publishedAt: now,
          publishedByCode: actorCode,
          publishedByName: actorName,
          itemCount: newItems.length,
          items: newItems.map(toChecklistVersionHistoryItem),
        },
      ],
      auditLogs: [
        {
          id: Date.now(),
          at: now,
          action: "master.create",
          actorCode,
          actorName,
          description: `สร้างเทมเพลตใหม่ ${code} และเผยแพร่เวอร์ชันแรก v1 (${newItems.length} ขั้นตอน)`,
          versionNo: 1,
          itemCount: newItems.length,
          ip: "127.0.0.1",
        },
      ],
    };
    memoryTemplates.push(newTpl);

    return {
      templateId: newTplId,
      templateCode: code,
      templateName: name,
      versionId: newVersionId,
      versionNo: 1,
      itemCount: newItems.length,
      modelCode: code,
    };
  }

  let targetTpl = memoryTemplates.find(
    (t) => t.templateId === input.templateId,
  );
  let targetModelCode = targetTpl?.templateCode ?? "";

  if (!targetTpl && input.modelId) {
    const model = memoryModels.find((m) => m.modelId === input.modelId);
    if (!model) return null;
    targetModelCode = model.modelCode;
    const tplId = model.templates[input.role];
    targetTpl = memoryTemplates.find((t) => t.templateId === tplId);
  }

  if (!targetTpl) return null;
  if (!targetModelCode) targetModelCode = targetTpl.templateCode;

  if (!targetTpl.history || targetTpl.history.length === 0) {
    targetTpl.history = [
      {
        versionId: targetTpl.versionId,
        versionNo: targetTpl.versionNo,
        status: "PUBLISHED",
        source: "BUILDER",
        publishedAt: targetTpl.updatedAt,
        publishedByCode: "04712",
        publishedByName: "สมศักดิ์ สดใส (QC Head)",
        itemCount: targetTpl.items.length,
        items: targetTpl.items.map(toChecklistVersionHistoryItem),
      },
    ];
  }

  const newVersionNo = targetTpl.versionNo + 1;
  const newVersionId = ++nextVersionId;
  const now = new Date().toISOString();

  if (input.templateName) targetTpl.templateName = input.templateName;
  if (input.templateCode) targetTpl.templateCode = input.templateCode;
  if (input.scope !== undefined) targetTpl.scope = input.scope;
  targetTpl.versionId = newVersionId;
  targetTpl.versionNo = newVersionNo;
  targetTpl.updatedAt = now;
  targetTpl.items = newItems;

  targetTpl.history.unshift({
    versionId: newVersionId,
    versionNo: newVersionNo,
    status: "PUBLISHED",
    source: "BUILDER",
    publishedAt: now,
    publishedByCode: actorCode,
    publishedByName: actorName,
    itemCount: newItems.length,
    items: newItems.map(toChecklistVersionHistoryItem),
  });

  if (!targetTpl.auditLogs) targetTpl.auditLogs = [];
  targetTpl.auditLogs.unshift({
    id: Date.now(),
    at: now,
    action: "master.update",
    actorCode,
    actorName,
    description: `บันทึกและเผยแพร่เวอร์ชันใหม่ v${newVersionNo} (${newItems.length} ขั้นตอน)`,
    versionNo: newVersionNo,
    itemCount: newItems.length,
    ip: "127.0.0.1",
  });

  return {
    templateId: targetTpl.templateId,
    templateCode: targetTpl.templateCode,
    templateName: targetTpl.templateName,
    versionId: newVersionId,
    versionNo: newVersionNo,
    itemCount: newItems.length,
    modelCode: targetModelCode,
  };
}

function switchMemoryChecklistTemplateVersion(
  input: {
    templateId: number;
    versionId: number;
  },
  userMeta?: { employeeCode?: string; fullName?: string },
): {
  templateId: number;
  templateCode: string;
  templateName: string;
  role: InspectionRole;
  versionId: number;
  versionNo: number;
  itemCount: number;
} | null {
  const targetTpl = memoryTemplates.find((t) => t.templateId === input.templateId);
  if (!targetTpl) return null;

  if (!targetTpl.history || targetTpl.history.length === 0) {
    targetTpl.history = [
      {
        versionId: targetTpl.versionId,
        versionNo: targetTpl.versionNo,
        status: "PUBLISHED",
        source: "BUILDER",
        publishedAt: targetTpl.updatedAt,
        publishedByCode: "04712",
        publishedByName: "สมศักดิ์ สดใส (QC Head)",
        itemCount: targetTpl.items.length,
        items: targetTpl.items.map(toChecklistVersionHistoryItem),
      },
    ];
  }

  const ver = targetTpl.history.find((v) => v.versionId === input.versionId);
  if (!ver) return null;

  targetTpl.versionId = ver.versionId;
  targetTpl.versionNo = ver.versionNo;
  targetTpl.items = ver.items.map((it, idx) => ({
    id: ++nextItemId,
    seq: it.seq || idx + 1,
    topicCode: it.topicCode,
    title: it.title,
    inputType: it.inputType,
    isRequired: it.isRequired,
    photoRule: it.photoRule,
    videoRule: it.videoRule,
    animationType: it.animationType ?? "GENERAL_CHECK",
    helpText: it.helpText,
  }));
  targetTpl.updatedAt = new Date().toISOString();

  const actorCode = userMeta?.employeeCode ?? "04712";
  const actorName = userMeta?.fullName ?? "สมศักดิ์ สดใส (QC Head)";

  if (!targetTpl.auditLogs) targetTpl.auditLogs = [];
  targetTpl.auditLogs.unshift({
    id: Date.now(),
    at: targetTpl.updatedAt,
    action: "master.update",
    actorCode,
    actorName,
    description: `สลับกลับมาใช้เวอร์ชัน v${ver.versionNo} (${ver.items.length} ขั้นตอน) เป็นเวอร์ชันปัจจุบัน`,
    versionNo: ver.versionNo,
    itemCount: targetTpl.items.length,
    ip: "127.0.0.1",
  });

  return {
    templateId: targetTpl.templateId,
    templateCode: targetTpl.templateCode,
    templateName: targetTpl.templateName,
    role: targetTpl.role,
    versionId: ver.versionId,
    versionNo: ver.versionNo,
    itemCount: targetTpl.items.length,
  };
}

/**
 * Assign a Checklist Template to a Master Model (or unassign if templateId is null).
 */
export async function assignModelChecklistTemplate(
  userId: string,
  input: {
    modelId: number;
    role: InspectionRole;
    templateId: number | null;
  },
): Promise<{ modelId: number; modelCode: string; templateId: number | null; templateName: string | null } | null> {
  if (!dbConfigured()) {
    const model = memoryModels.find((m) => m.modelId === input.modelId);
    if (!model) return null;
    if (input.templateId !== null) {
      const tpl = memoryTemplates.find((t) => t.templateId === input.templateId && t.role === input.role);
      if (!tpl) return null;
      model.templates[input.role] = tpl.templateId;
      return {
        modelId: model.modelId,
        modelCode: model.modelCode,
        templateId: tpl.templateId,
        templateName: tpl.templateName,
      };
    }
    model.templates[input.role] = null;
    return {
      modelId: model.modelId,
      modelCode: model.modelCode,
      templateId: null,
      templateName: null,
    };
  }

  const pool = await getPool();
  const numericUserId = /^\d+$/.test(userId) ? Number(userId) : null;

  const modelRes = await pool
    .request()
    .input("modelId", sql.Int, input.modelId)
    .query(`SELECT id, code FROM dbo.models WHERE id = @modelId`);
  if (modelRes.recordset.length === 0) return null;
  const modelCode = String(modelRes.recordset[0].code);

  let templateName: string | null = null;
  let currentVersionId: number | null = null;
  if (input.templateId !== null) {
    const tplRes = await pool
      .request()
      .input("templateId", sql.Int, input.templateId)
      .query(`SELECT id, name, current_version_id FROM dbo.checklist_templates WHERE id = @templateId`);
    if (tplRes.recordset.length === 0) return null;
    templateName = String(tplRes.recordset[0].name);
    currentVersionId = tplRes.recordset[0].current_version_id ? Number(tplRes.recordset[0].current_version_id) : null;
  }

  const modelTemplateCol = input.role === "QA" ? "qa_template_id" : "qc_template_id";
  await pool
    .request()
    .input("modelId", sql.Int, input.modelId)
    .input("templateId", sql.Int, input.templateId)
    .input("userId", sql.BigInt, numericUserId)
    .query(`
      UPDATE dbo.models
         SET ${modelTemplateCol} = @templateId,
             updated_at = SYSUTCDATETIME(),
             updated_by = @userId
       WHERE id = @modelId
    `);

  if (currentVersionId) {
    const planVersionCol = input.role === "QA" ? "qa_template_version_id" : "qc_template_version_id";
    await pool
      .request()
      .input("modelId", sql.Int, input.modelId)
      .input("versionId", sql.Int, currentVersionId)
      .query(`
        UPDATE dbo.plans
           SET ${planVersionCol} = @versionId,
               updated_at = SYSUTCDATETIME()
         WHERE model_id = @modelId
           AND status IN ('OPEN', 'IN_PROGRESS')
      `);
  }

  return {
    modelId: input.modelId,
    modelCode,
    templateId: input.templateId,
    templateName,
  };
}

/**
 * Switch the currently active version of a Checklist Template (Option 2: Switch Active Version).
 * Updates current_version_id on checklist_templates and updates open plans using this template.
 */
export async function switchChecklistTemplateVersion(
  userId: string,
  input: {
    templateId: number;
    versionId: number;
  },
  userMeta?: { employeeCode?: string; fullName?: string },
): Promise<{
  templateId: number;
  templateCode: string;
  templateName: string;
  role: InspectionRole;
  versionId: number;
  versionNo: number;
  itemCount: number;
} | null> {
  if (!dbConfigured()) {
    return switchMemoryChecklistTemplateVersion(input, userMeta);
  }

  const pool = await getPool();
  const numericUserId = /^\d+$/.test(userId) ? Number(userId) : null;

  // 1. Verify template exists
  const tplRes = await pool
    .request()
    .input("templateId", sql.Int, input.templateId)
    .query(`SELECT id, code, name, role FROM dbo.checklist_templates WHERE id = @templateId`);
  if (tplRes.recordset.length === 0) return null;
  const tpl = tplRes.recordset[0];
  const role: InspectionRole = tpl.role === "QA" ? "QA" : "QC";

  // 2. Verify version exists and belongs to this template
  const verRes = await pool
    .request()
    .input("templateId", sql.Int, input.templateId)
    .input("versionId", sql.Int, input.versionId)
    .query(`
      SELECT v.id, v.version_no, ISNULL(COUNT(ci.id), 0) AS item_count
        FROM dbo.template_versions v
        LEFT JOIN dbo.checklist_items ci ON ci.version_id = v.id AND ci.is_active = 1
       WHERE v.id = @versionId AND v.template_id = @templateId
       GROUP BY v.id, v.version_no
    `);
  if (verRes.recordset.length === 0) return null;
  const ver = verRes.recordset[0];
  const versionNo = Number(ver.version_no);
  const itemCount = Number(ver.item_count);

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 3. Update current_version_id on template
    await new sql.Request(tx)
      .input("templateId", sql.Int, input.templateId)
      .input("versionId", sql.Int, input.versionId)
      .input("userId", sql.BigInt, numericUserId)
      .query(`
        UPDATE dbo.checklist_templates
           SET current_version_id = @versionId,
               updated_at = SYSUTCDATETIME(),
               updated_by = @userId
         WHERE id = @templateId
      `);

    // 4. Update plans that are OPEN or IN_PROGRESS
    const modelTemplateCol = role === "QA" ? "qa_template_id" : "qc_template_id";
    const planVersionCol = role === "QA" ? "qa_template_version_id" : "qc_template_version_id";
    await new sql.Request(tx)
      .input("templateId", sql.Int, input.templateId)
      .input("versionId", sql.Int, input.versionId)
      .query(`
        UPDATE p
           SET p.${planVersionCol} = @versionId,
               p.updated_at = SYSUTCDATETIME()
          FROM dbo.plans p
          JOIN dbo.models m ON m.id = p.model_id
         WHERE m.${modelTemplateCol} = @templateId
           AND p.status IN ('OPEN', 'IN_PROGRESS')
      `);

    await tx.commit();

    return {
      templateId: Number(tpl.id),
      templateCode: String(tpl.code),
      templateName: String(tpl.name),
      role,
      versionId: input.versionId,
      versionNo,
      itemCount,
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Load all active Checklist Templates (Template 1, 2, 3...), models, and the steps of the selected template.
 */
export async function loadModelChecklistPayload(query: {
  templateId?: number;
  modelId?: number;
  role?: InspectionRole;
}): Promise<ModelChecklistPayload> {
  if (!dbConfigured()) {
    return loadMemoryModelChecklistPayload(query);
  }

  let role: InspectionRole = query.role === "QA" ? "QA" : "QC";
  const pool = await getPool();

  if (query.templateId) {
    const targetTplRes = await pool
      .request()
      .input("targetTplId", sql.Int, query.templateId)
      .query(`SELECT role FROM dbo.checklist_templates WHERE id = @targetTplId`);
    if (targetTplRes.recordset.length > 0) {
      role = targetTplRes.recordset[0].role === "QA" ? "QA" : "QC";
    }
  }

  // 1. Load all active templates for this role (plus the explicitly requested templateId even if inactive)
  const templatesRes = await pool
    .request()
    .input("role", sql.VarChar(8), role)
    .input("targetTemplateId", sql.Int, query.templateId ?? 0)
    .query(`
      SELECT t.id AS template_id,
             t.code AS template_code,
             t.name AS template_name,
             t.role,
             t.scope,
             ISNULL(tv.version_id, 0) AS version_id,
             ISNULL(tv.version_no, 1) AS version_no,
             COALESCE(tv.updated_at, t.updated_at) AS updated_at,
             ISNULL(ic.item_count, 0) AS item_count
        FROM dbo.checklist_templates t
        OUTER APPLY (
          SELECT TOP (1)
                 v.id AS version_id,
                 v.version_no,
                 v.updated_at
            FROM dbo.template_versions v
           WHERE v.template_id = t.id
           ORDER BY
             CASE WHEN v.id = t.current_version_id THEN 0 ELSE 1 END,
             v.version_no DESC,
             v.id DESC
        ) tv
        OUTER APPLY (
          SELECT COUNT(1) AS item_count
            FROM dbo.checklist_items ci
           WHERE ci.version_id = tv.version_id AND ci.is_active = 1
        ) ic
       WHERE (t.is_active = 1 OR t.id = @targetTemplateId)
         AND t.role = @role
       ORDER BY
         CASE WHEN t.code LIKE 'MDL-%' THEN 1 ELSE 0 END,
         t.id ASC
    `);

  // 2. Load all active models and their linked templates
  const modelsRes = await pool
    .request()
    .input("role", sql.VarChar(8), role)
    .query(`
      SELECT m.id AS model_id,
             m.code AS model_code,
             m.description AS model_desc,
             b.name AS brand_name,
             pt.name AS pump_type_name,
             CASE WHEN @role = 'QC' THEN m.qc_template_id ELSE m.qa_template_id END AS assigned_template_id
        FROM dbo.models m
        JOIN dbo.brands b ON b.id = m.brand_id
        LEFT JOIN dbo.pump_types pt ON pt.id = m.pump_type_id
       WHERE m.is_active = 1
       ORDER BY m.code ASC
    `);

  if (templatesRes.recordset.length === 0 && modelsRes.recordset.length === 0) {
    return loadMemoryModelChecklistPayload(query);
  }

  const rawModels = modelsRes.recordset.map((r) => ({
    modelId: Number(r.model_id),
    modelCode: String(r.model_code),
    modelDescription: r.model_desc ? String(r.model_desc) : null,
    brandName: String(r.brand_name),
    pumpTypeName: r.pump_type_name ? String(r.pump_type_name) : null,
    assignedTemplateId: r.assigned_template_id ? Number(r.assigned_template_id) : null,
  }));

  const templates: ChecklistTemplateSummary[] = templatesRes.recordset.map((r) => {
    const tplId = Number(r.template_id);
    const linkedModels = rawModels
      .filter((m) => m.assignedTemplateId === tplId)
      .map((m) => ({
        modelId: m.modelId,
        modelCode: m.modelCode,
        modelDescription: m.modelDescription,
        brandName: m.brandName,
      }));
    return {
      templateId: tplId,
      templateCode: String(r.template_code),
      templateName: String(r.template_name),
      role,
      scope: r.scope ? String(r.scope) : null,
      versionId: Number(r.version_id),
      versionNo: Number(r.version_no),
      itemCount: Number(r.item_count) > 0 ? Number(r.item_count) : DEMO_INSPECTION_ITEMS.length,
      updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : null,
      linkedModels,
    };
  });

  if (templates.length === 0) {
    return loadMemoryModelChecklistPayload(query);
  }

  const summaries: ModelChecklistSummary[] = rawModels.map((m) => {
    const tpl = templates.find((t) => t.templateId === m.assignedTemplateId);
    return {
      modelId: m.modelId,
      modelCode: m.modelCode,
      modelDescription: m.modelDescription,
      brandName: m.brandName,
      pumpTypeName: m.pumpTypeName,
      role,
      templateId: m.assignedTemplateId,
      templateCode: tpl?.templateCode ?? "— ยังไม่เลือก Template —",
      templateName: tpl?.templateName ?? "ยังไม่เลือก Template",
      versionId: tpl?.versionId ?? 1,
      versionNo: tpl?.versionNo ?? 1,
      itemCount: tpl?.itemCount ?? 0,
      updatedAt: tpl?.updatedAt ?? null,
    };
  });

  const selectedModel =
    summaries.find((m) => m.modelId === query.modelId) ?? summaries[0] ?? { modelId: 1 };

  let selectedTemplate = templates.find((t) => t.templateId === query.templateId);
  if (!selectedTemplate && query.modelId) {
    const modelSummary = summaries.find((m) => m.modelId === query.modelId);
    if (modelSummary?.templateId) {
      selectedTemplate = templates.find((t) => t.templateId === modelSummary.templateId);
    }
  }
  if (!selectedTemplate) {
    selectedTemplate = templates[0];
  }

  let items: InspectionItem[] = DEMO_INSPECTION_ITEMS;
  if (selectedTemplate.versionId) {
    const itemsRes = await pool
      .request()
      .input("versionId", sql.Int, selectedTemplate.versionId)
      .query(`
        SELECT *
          FROM dbo.checklist_items
         WHERE version_id = @versionId AND is_active = 1
         ORDER BY seq ASC
      `);

    if (itemsRes.recordset.length > 0) {
      items = itemsRes.recordset.map((r) => {
        const base: InspectionItem = {
          id: Number(r.id),
          seq: Number(r.seq),
          topicCode: r.topic_code ?? null,
          title: String(r.title),
          inputType: r.input_type,
          isRequired: Boolean(r.is_required),
          photoRule: r.photo_rule ?? "ON_FAIL",
          videoRule: r.video_rule ?? "NONE",
          animationType: r.animation_type ?? null,
          helpText: r.help_text ?? null,
          exampleImage: r.example_image ?? null,
        };
        return {
          ...base,
          animationType: inferItemAnimationType(base),
        };
      });
    }
  }

  return {
    templates,
    selectedTemplateId: selectedTemplate.templateId,
    models: summaries,
    selectedModelId: selectedModel.modelId,
    role,
    activeVersionNo: selectedTemplate.versionNo,
    items,
    masterPool: MASTER_CHECKLIST_POOL,
  };
}

/**
 * Create a new Checklist Template OR save & publish a new version of an existing Checklist Template.
 * Preserves all historical versions so past unit_inspections remain 100% intact.
 */
export async function saveModelChecklist(
  userId: string,
  input: SaveChecklistData,
  userMeta?: { employeeCode?: string; fullName?: string },
): Promise<{
  templateId: number;
  templateCode: string;
  templateName: string;
  versionId: number;
  versionNo: number;
  itemCount: number;
  modelCode: string;
} | null> {
  if (!dbConfigured()) {
    return saveMemoryModelChecklist(input, userMeta);
  }

  const pool = await getPool();
  const numericUserId = /^\d+$/.test(userId) ? Number(userId) : null;

  let templateId: number | null = input.templateId ?? null;
  let templateCode = input.templateCode ?? "";
  let templateName = input.templateName ?? "";
  let modelCodeForReturn = templateCode;

  if (!input.isNewTemplate) {
    if (templateId) {
      const tplRes = await pool
        .request()
        .input("tplId", sql.Int, templateId)
        .query(`SELECT id, code, name, scope FROM dbo.checklist_templates WHERE id = @tplId`);
      if (tplRes.recordset.length === 0) return null;
      const row = tplRes.recordset[0];
      templateCode = input.templateCode || String(row.code);
      templateName = input.templateName || String(row.name);
      modelCodeForReturn = templateCode;
    } else if (input.modelId) {
      const modelRes = await pool
        .request()
        .input("modelId", sql.Int, input.modelId)
        .query(`
          SELECT id, code, qc_template_id, qa_template_id
            FROM dbo.models
           WHERE id = @modelId
        `);
      if (modelRes.recordset.length === 0) return null;
      const modelRow = modelRes.recordset[0];
      modelCodeForReturn = String(modelRow.code);
      const linkedTplId = input.role === "QA" ? modelRow.qa_template_id : modelRow.qc_template_id;
      if (linkedTplId) {
        templateId = Number(linkedTplId);
        const tplRes = await pool
          .request()
          .input("tplId", sql.Int, templateId)
          .query(`SELECT id, code, name FROM dbo.checklist_templates WHERE id = @tplId`);
        if (tplRes.recordset.length > 0) {
          templateCode = String(tplRes.recordset[0].code);
          templateName = String(tplRes.recordset[0].name);
        }
      }
      if (!templateCode) {
        templateCode = `MDL-${modelCodeForReturn}-${input.role}`.slice(0, 64);
        templateName = `แบบตรวจ ${modelCodeForReturn} (${input.role})`;
      }
    } else {
      return null;
    }
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 1. Create or update dbo.checklist_templates
    if (input.isNewTemplate) {
      const dupCheck = await new sql.Request(tx)
        .input("code", sql.NVarChar(64), templateCode)
        .query(`SELECT id FROM dbo.checklist_templates WHERE code = @code`);
      if (dupCheck.recordset.length > 0) {
        templateId = Number(dupCheck.recordset[0].id);
        await new sql.Request(tx)
          .input("id", sql.Int, templateId)
          .input("name", sql.NVarChar(200), templateName)
          .input("scope", sql.NVarChar(100), input.scope ?? null)
          .input("userId", sql.BigInt, numericUserId)
          .query(`
            UPDATE dbo.checklist_templates
               SET name = @name,
                   scope = @scope,
                   is_active = 1,
                   updated_at = SYSUTCDATETIME(),
                   updated_by = @userId
             WHERE id = @id
          `);
      } else {
        const tplInsert = await new sql.Request(tx)
          .input("code", sql.NVarChar(64), templateCode)
          .input("name", sql.NVarChar(200), templateName)
          .input("role", sql.VarChar(2), input.role)
          .input("scope", sql.NVarChar(100), input.scope ?? null)
          .input("userId", sql.BigInt, numericUserId)
          .query(`
            INSERT INTO dbo.checklist_templates (code, name, role, scope, created_by, updated_by)
            OUTPUT INSERTED.id
            VALUES (@code, @name, @role, @scope, @userId, @userId)
          `);
        templateId = Number(tplInsert.recordset[0].id);
      }
    } else if (templateId) {
      await new sql.Request(tx)
        .input("id", sql.Int, templateId)
        .input("name", sql.NVarChar(200), templateName)
        .input("scope", sql.NVarChar(100), input.scope ?? null)
        .input("hasScope", sql.Bit, input.scope !== undefined ? 1 : 0)
        .input("userId", sql.BigInt, numericUserId)
        .query(`
          UPDATE dbo.checklist_templates
             SET name = @name,
                 scope = CASE WHEN @hasScope = 1 THEN @scope ELSE scope END,
                 updated_at = SYSUTCDATETIME(),
                 updated_by = @userId
           WHERE id = @id
        `);
    } else {
      const tplLookup = await new sql.Request(tx)
        .input("code", sql.NVarChar(64), templateCode)
        .query(`SELECT id FROM dbo.checklist_templates WHERE code = @code`);
      if (tplLookup.recordset.length > 0) {
        templateId = Number(tplLookup.recordset[0].id);
      } else {
        const tplInsert = await new sql.Request(tx)
          .input("code", sql.NVarChar(64), templateCode)
          .input("name", sql.NVarChar(200), templateName)
          .input("role", sql.VarChar(2), input.role)
          .input("scope", sql.NVarChar(100), input.scope ?? modelCodeForReturn)
          .input("userId", sql.BigInt, numericUserId)
          .query(`
            INSERT INTO dbo.checklist_templates (code, name, role, scope, created_by, updated_by)
            OUTPUT INSERTED.id
            VALUES (@code, @name, @role, @scope, @userId, @userId)
          `);
        templateId = Number(tplInsert.recordset[0].id);
      }
    }

    // 2. Determine next version_no for this template
    const verMaxRes = await new sql.Request(tx)
      .input("templateId", sql.Int, templateId)
      .query(`
        SELECT ISNULL(MAX(version_no), 0) AS max_ver
          FROM dbo.template_versions
         WHERE template_id = @templateId
      `);
    const nextVersionNo = Number(verMaxRes.recordset[0].max_ver) + 1;

    // 3. Create new PUBLISHED version
    const verInsert = await new sql.Request(tx)
      .input("templateId", sql.Int, templateId)
      .input("versionNo", sql.Int, nextVersionNo)
      .input("userId", sql.BigInt, numericUserId)
      .query(`
        INSERT INTO dbo.template_versions
          (template_id, version_no, status, published_at, published_by, source, created_by, updated_by)
        OUTPUT INSERTED.id
        VALUES
          (@templateId, @versionNo, 'PUBLISHED', SYSUTCDATETIME(), @userId, 'BUILDER', @userId, @userId)
      `);
    const versionId = Number(verInsert.recordset[0].id);

    // 4. Check if animation_type column exists on dbo.checklist_items (migration 019)
    const colCheck = await new sql.Request(tx).query(`
      SELECT COL_LENGTH(N'dbo.checklist_items', N'animation_type') AS has_anim
    `);
    const hasAnimColumn = colCheck.recordset[0]?.has_anim != null;

    // 5. Insert checklist_items in sequence 1..N
    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      const req = new sql.Request(tx)
        .input("versionId", sql.Int, versionId)
        .input("seq", sql.Int, i + 1)
        .input("topicCode", sql.NVarChar(32), it.topicCode)
        .input("title", sql.NVarChar(400), it.title)
        .input("inputType", sql.VarChar(10), it.inputType)
        .input("isRequired", sql.Bit, it.isRequired ? 1 : 0)
        .input("photoRule", sql.VarChar(10), it.photoRule)
        .input("videoRule", sql.VarChar(10), it.videoRule)
        .input("helpText", sql.NVarChar(1000), it.helpText)
        .input("userId", sql.BigInt, numericUserId);

      if (hasAnimColumn) {
        req.input("animationType", sql.VarChar(24), it.animationType);
        await req.query(`
          INSERT INTO dbo.checklist_items
            (version_id, seq, topic_code, title, input_type, is_required, photo_rule, video_rule, animation_type, help_text, created_by, updated_by)
          VALUES
            (@versionId, @seq, @topicCode, @title, @inputType, @isRequired, @photoRule, @videoRule, @animationType, @helpText, @userId, @userId)
        `);
      } else {
        await req.query(`
          INSERT INTO dbo.checklist_items
            (version_id, seq, topic_code, title, input_type, is_required, photo_rule, video_rule, help_text, created_by, updated_by)
          VALUES
            (@versionId, @seq, @topicCode, @title, @inputType, @isRequired, @photoRule, @videoRule, @helpText, @userId, @userId)
        `);
      }
    }

    // 5.5 Copy defects and dispositions from previous versions matching by title or seq
    await new sql.Request(tx)
      .input("newVersionId", sql.Int, versionId)
      .input("userId", sql.BigInt, numericUserId)
      .query(`
        INSERT INTO dbo.item_defects (item_id, defect_id, part, severity, seq, is_active, created_by, updated_by)
        SELECT target_ci.id AS item_id,
               src_idf.defect_id,
               src_idf.part,
               src_idf.severity,
               src_idf.seq,
               1,
               @userId,
               @userId
          FROM dbo.checklist_items target_ci
          CROSS APPLY (
            SELECT TOP (1) prev_ci.id AS prev_item_id
              FROM dbo.checklist_items prev_ci
             WHERE prev_ci.version_id <> @newVersionId
               AND (prev_ci.title = target_ci.title OR prev_ci.seq = target_ci.seq)
               AND EXISTS (SELECT 1 FROM dbo.item_defects x WHERE x.item_id = prev_ci.id)
             ORDER BY CASE WHEN prev_ci.title = target_ci.title THEN 0 ELSE 1 END, prev_ci.version_id DESC
          ) matched
          JOIN dbo.item_defects src_idf ON src_idf.item_id = matched.prev_item_id
         WHERE target_ci.version_id = @newVersionId
           AND NOT EXISTS (
             SELECT 1 FROM dbo.item_defects existing
              WHERE existing.item_id = target_ci.id
                AND existing.defect_id = src_idf.defect_id
                AND ISNULL(existing.part, N'') = ISNULL(src_idf.part, N'')
           );

        INSERT INTO dbo.item_defect_dispositions (item_defect_id, brand_group, disposition, is_active)
        SELECT target_idf.id AS item_defect_id,
               src_idd.brand_group,
               src_idd.disposition,
               1
          FROM dbo.checklist_items target_ci
          JOIN dbo.item_defects target_idf ON target_idf.item_id = target_ci.id
          CROSS APPLY (
            SELECT TOP (1) prev_ci.id AS prev_item_id
              FROM dbo.checklist_items prev_ci
             WHERE prev_ci.version_id <> @newVersionId
               AND (prev_ci.title = target_ci.title OR prev_ci.seq = target_ci.seq)
               AND EXISTS (SELECT 1 FROM dbo.item_defects x WHERE x.item_id = prev_ci.id)
             ORDER BY CASE WHEN prev_ci.title = target_ci.title THEN 0 ELSE 1 END, prev_ci.version_id DESC
          ) matched
          JOIN dbo.item_defects src_idf ON src_idf.item_id = matched.prev_item_id
                                       AND src_idf.defect_id = target_idf.defect_id
                                       AND ISNULL(src_idf.part, N'') = ISNULL(target_idf.part, N'')
          JOIN dbo.item_defect_dispositions src_idd ON src_idd.item_defect_id = src_idf.id
         WHERE target_ci.version_id = @newVersionId
           AND NOT EXISTS (
             SELECT 1 FROM dbo.item_defect_dispositions existing
              WHERE existing.item_defect_id = target_idf.id
                AND existing.brand_group = src_idd.brand_group
           );
      `);

    // 6. Link current_version_id on template
    await new sql.Request(tx)
      .input("templateId", sql.Int, templateId)
      .input("versionId", sql.Int, versionId)
      .input("userId", sql.BigInt, numericUserId)
      .query(`
        UPDATE dbo.checklist_templates
           SET current_version_id = @versionId,
               updated_at = SYSUTCDATETIME(),
               updated_by = @userId
         WHERE id = @templateId
      `);

    const modelTemplateCol = input.role === "QA" ? "qa_template_id" : "qc_template_id";
    if (input.modelId && !input.templateId && !input.isNewTemplate) {
      await new sql.Request(tx)
        .input("modelId", sql.Int, input.modelId)
        .input("templateId", sql.Int, templateId)
        .input("userId", sql.BigInt, numericUserId)
        .query(`
          UPDATE dbo.models
             SET ${modelTemplateCol} = @templateId,
                 updated_at = SYSUTCDATETIME(),
                 updated_by = @userId
           WHERE id = @modelId
        `);
    }

    // 7. Update active plans of all models using this template so newly started inspections immediately use the latest version
    const planVersionCol = input.role === "QA" ? "qa_template_version_id" : "qc_template_version_id";
    await new sql.Request(tx)
      .input("templateId", sql.Int, templateId)
      .input("versionId", sql.Int, versionId)
      .query(`
        UPDATE p
           SET p.${planVersionCol} = @versionId,
               p.updated_at = SYSUTCDATETIME()
          FROM dbo.plans p
          JOIN dbo.models m ON m.id = p.model_id
         WHERE m.${modelTemplateCol} = @templateId
           AND p.status IN ('OPEN', 'IN_PROGRESS')
      `);

    await tx.commit();

    return {
      templateId: templateId!,
      templateCode,
      templateName,
      versionId,
      versionNo: nextVersionNo,
      itemCount: input.items.length,
      modelCode: modelCodeForReturn || templateCode,
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

function loadMemoryModelChecklistHistory(query: {
  templateId?: number;
  modelId?: number;
  role: InspectionRole;
}): ModelChecklistHistoryPayload | null {
  let targetTpl = query.templateId
    ? memoryTemplates.find((t) => t.templateId === query.templateId)
    : undefined;
  const role: InspectionRole = targetTpl
    ? targetTpl.role
    : query.role === "QA"
    ? "QA"
    : "QC";
  let modelId = query.modelId ?? 0;
  let modelCode = "";
  let modelDescription: string | null = null;

  if (query.modelId) {
    const model = memoryModels.find((m) => m.modelId === query.modelId);
    if (!model && !targetTpl) return null;
    if (model) {
      modelId = model.modelId;
      modelCode = model.modelCode;
      modelDescription = model.modelDescription;
      if (!targetTpl) {
        targetTpl = memoryTemplates.find((t) => t.templateId === model.templates[role]);
      }
    }
  }

  if (!targetTpl) return null;
  if (!modelCode) {
    modelCode = targetTpl.templateCode;
    modelDescription = targetTpl.templateName;
  }

  if (!targetTpl.history || targetTpl.history.length === 0) {
    targetTpl.history = [
      {
        versionId: targetTpl.versionId,
        versionNo: targetTpl.versionNo,
        status: "PUBLISHED",
        source: "BUILDER",
        publishedAt: targetTpl.updatedAt,
        publishedByCode: "04712",
        publishedByName: "สมศักดิ์ สดใส (QC Head)",
        itemCount: targetTpl.items.length,
        items: targetTpl.items.map(toChecklistVersionHistoryItem),
      },
    ];
  }

  if (!targetTpl.auditLogs || targetTpl.auditLogs.length === 0) {
    targetTpl.auditLogs = [
      {
        id: 1,
        at: targetTpl.updatedAt,
        action: "master.update",
        actorCode: "04712",
        actorName: "สมศักดิ์ สดใส (QC Head)",
        description: `บันทึกและเผยแพร่เวอร์ชัน v${targetTpl.versionNo} (${targetTpl.items.length} ขั้นตอน)`,
        versionNo: targetTpl.versionNo,
        itemCount: targetTpl.items.length,
        ip: "192.168.1.105",
      },
    ];
  }

  return {
    templateId: targetTpl.templateId,
    templateCode: targetTpl.templateCode,
    templateName: targetTpl.templateName,
    modelId: modelId || targetTpl.templateId,
    modelCode,
    modelDescription,
    role,
    currentVersionNo: targetTpl.versionNo,
    versions: targetTpl.history,
    auditLogs: targetTpl.auditLogs,
  };
}

/**
 * Load full version history and audit log for a specific Checklist Template (or Model + Role).
 */
export async function loadModelChecklistHistory(query: {
  templateId?: number;
  modelId?: number;
  role: InspectionRole;
}): Promise<ModelChecklistHistoryPayload | null> {
  if (!dbConfigured()) {
    return loadMemoryModelChecklistHistory(query);
  }

  const pool = await getPool();
  let role: InspectionRole = query.role === "QA" ? "QA" : "QC";

  let templateId: number | null = query.templateId ?? null;
  let templateCode = "";
  let templateName = "";
  let modelId = query.modelId ?? 0;
  let modelCode = "";
  let modelDescription: string | null = null;

  if (query.modelId && !templateId) {
    const modelRes = await pool
      .request()
      .input("modelId", sql.Int, query.modelId)
      .query(`
        SELECT m.id, m.code, m.description, m.qc_template_id, m.qa_template_id
          FROM dbo.models m
         WHERE m.id = @modelId
      `);
    if (modelRes.recordset.length === 0) return null;
    const modelRow = modelRes.recordset[0];
    modelId = Number(modelRow.id);
    modelCode = String(modelRow.code);
    modelDescription = modelRow.description ? String(modelRow.description) : null;
    templateId = (role === "QC" ? modelRow.qc_template_id : modelRow.qa_template_id) ?? null;
  }

  if (templateId) {
    const tplRes = await pool
      .request()
      .input("tplId", sql.Int, templateId)
      .query(`
        SELECT id, code, name, role, scope
          FROM dbo.checklist_templates
         WHERE id = @tplId
      `);
    if (tplRes.recordset.length === 0) return null;
    const tplRow = tplRes.recordset[0];
    templateCode = String(tplRow.code);
    templateName = String(tplRow.name);
    if (tplRow.role === "QA" || tplRow.role === "QC") {
      role = tplRow.role;
    }
    if (!modelCode) {
      modelCode = templateCode;
      modelDescription = templateName;
    }
  } else {
    return {
      modelId,
      modelCode,
      modelDescription,
      role,
      currentVersionNo: 0,
      versions: [],
      auditLogs: [],
    };
  }

  // 3. Query versions
  const versionsRes = await pool
    .request()
    .input("templateId", sql.Int, templateId)
    .query(`
      SELECT v.id AS version_id,
             v.version_no,
             v.status,
             v.source,
             v.published_at,
             v.created_at,
             u.employee_code AS published_by_code,
             u.full_name AS published_by_name
        FROM dbo.template_versions v
        LEFT JOIN dbo.users u ON u.id = ISNULL(v.published_by, v.created_by)
       WHERE v.template_id = @templateId
       ORDER BY v.version_no DESC
    `);

  const versionIds = versionsRes.recordset.map((r: { version_id: number }) => Number(r.version_id));

  const itemsByVersion: Record<number, ChecklistVersionHistoryItem[]> = {};
  if (versionIds.length > 0) {
    const itemsRes = await pool.request().query(`
      SELECT ci.id, ci.version_id, ci.seq, ci.topic_code, ci.title, ci.input_type,
             ci.is_required, ci.photo_rule, ci.video_rule, ci.animation_type, ci.help_text
        FROM dbo.checklist_items ci
       WHERE ci.version_id IN (${versionIds.join(",")}) AND ci.is_active = 1
       ORDER BY ci.version_id, ci.seq ASC
    `);

    for (const row of itemsRes.recordset) {
      const vid = Number(row.version_id);
      if (!itemsByVersion[vid]) itemsByVersion[vid] = [];
      const base: InspectionItem = {
        id: Number(row.id),
        seq: Number(row.seq),
        topicCode: row.topic_code ?? null,
        title: String(row.title),
        inputType: row.input_type,
        isRequired: Boolean(row.is_required),
        photoRule: row.photo_rule ?? "ON_FAIL",
        videoRule: row.video_rule ?? "NONE",
        animationType: row.animation_type ?? null,
        helpText: row.help_text ?? null,
      };
      itemsByVersion[vid].push(
        toChecklistVersionHistoryItem({
          ...base,
          animationType: inferItemAnimationType(base),
        }),
      );
    }
  }

  const versions: ChecklistVersionHistoryEntry[] = versionsRes.recordset.map((r: Record<string, unknown>) => {
    const vid = Number(r.version_id);
    const verItems = itemsByVersion[vid] ?? [];
    return {
      versionId: vid,
      versionNo: Number(r.version_no),
      status: String(r.status),
      source: String(r.source),
      publishedAt: r.published_at
        ? new Date(String(r.published_at)).toISOString()
        : r.created_at
        ? new Date(String(r.created_at)).toISOString()
        : null,
      publishedByCode: r.published_by_code ? String(r.published_by_code) : null,
      publishedByName: r.published_by_name ? String(r.published_by_name) : null,
      itemCount: verItems.length,
      items: verItems,
    };
  });

  // 4. Query audit logs
  const tplEntityId = `tpl:${templateId}`;
  const mdlEntityId = modelId ? `${modelId}:${role}` : tplEntityId;
  const auditRes = await pool
    .request()
    .input("tplEntityId", sql.NVarChar(64), tplEntityId)
    .input("mdlEntityId", sql.NVarChar(64), mdlEntityId)
    .input("rawTplId", sql.NVarChar(64), String(templateId))
    .query(`
      SELECT TOP 30 a.id, a.[at], a.[action], a.actor_code, a.after_json, a.ip,
             u.full_name AS actor_name
        FROM dbo.audit_logs a
        LEFT JOIN dbo.users u ON (u.id = a.actor_id OR u.employee_code = a.actor_code)
       WHERE (a.entity_type = 'model_checklist' AND a.entity_id IN (@tplEntityId, @mdlEntityId))
          OR (a.entity_type = 'checklist_templates' AND a.entity_id = @rawTplId)
       ORDER BY a.[at] DESC
    `);

  const auditLogs: ModelChecklistAuditEntry[] = auditRes.recordset.map((r: Record<string, unknown>) => {
    let versionNo: number | undefined;
    let itemCount: number | undefined;
    let actorName: string | null = r.actor_name ? String(r.actor_name) : null;
    let description: string | null = null;

    if (r.after_json && typeof r.after_json === "string") {
      try {
        const parsed = JSON.parse(r.after_json);
        if (parsed.versionNo) versionNo = Number(parsed.versionNo);
        if (parsed.itemCount) itemCount = Number(parsed.itemCount);
        if (parsed.actorName && !actorName) actorName = String(parsed.actorName);
        if (parsed.description) {
          description = String(parsed.description);
        } else if (parsed.action === "switch_version") {
          description = `สลับกลับมาใช้เวอร์ชัน v${versionNo ?? ""} (${itemCount ?? ""} ขั้นตอน) เป็นเวอร์ชันปัจจุบัน`;
        } else if (parsed.modelCode && parsed.templateName) {
          description = `ผูกรุ่น ${parsed.modelCode} เข้ากับ ${parsed.templateName}`;
        } else if (versionNo) {
          description = `บันทึกและเผยแพร่เวอร์ชันใหม่ v${versionNo} (${itemCount ?? ""} ขั้นตอน)`;
        }
      } catch {
        // ignore
      }
    }
    return {
      id: Number(r.id),
      at: new Date(String(r.at)).toISOString(),
      action: String(r.action),
      actorCode: r.actor_code ? String(r.actor_code) : null,
      actorName,
      description,
      versionNo,
      itemCount,
      ip: r.ip ? String(r.ip) : null,
    };
  });

  return {
    templateId,
    templateCode,
    templateName,
    modelId: modelId || templateId,
    modelCode,
    modelDescription,
    role,
    currentVersionNo: versions[0]?.versionNo ?? 1,
    versions,
    auditLogs,
  };
}
