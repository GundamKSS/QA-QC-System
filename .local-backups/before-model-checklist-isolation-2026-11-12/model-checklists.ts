import "server-only";
import { dbConfigured } from "@/lib/db/config";
import { getPool, sql } from "@/lib/db/pool";
import { inferItemAnimationType } from "@/lib/inspections/rules";
import { DEMO_INSPECTION_ITEMS } from "@/lib/inspections/store";
import type { InspectionItem, InspectionRole } from "@/lib/inspections/types";
import {
  MASTER_CHECKLIST_POOL,
  type ModelChecklistItemInput,
  type ModelChecklistPayload,
  type ModelChecklistSummary,
} from "./model-checklist-types";

type MemoryModelRecord = {
  modelId: number;
  modelCode: string;
  modelDescription: string | null;
  brandName: string;
  pumpTypeName: string | null;
  versions: Record<
    InspectionRole,
    {
      templateId: number;
      templateCode: string;
      versionId: number;
      versionNo: number;
      updatedAt: string;
      items: InspectionItem[];
    }
  >;
};

const INITIAL_MEMORY_MODELS: MemoryModelRecord[] = [
  {
    modelId: 1,
    modelCode: "PP-21",
    modelDescription: "ปั๊มลมลูกสูบสายพาน PUMA 1 HP ถัง 64 ลิตร",
    brandName: "PUMA",
    pumpTypeName: "Piston (ลูกสูบ)",
    versions: {
      QC: {
        templateId: 101,
        templateCode: "MDL-PP-21-QC",
        versionId: 1001,
        versionNo: 1,
        updatedAt: "2026-11-10T06:00:00.000Z",
        items: DEMO_INSPECTION_ITEMS.slice(0, 6).map((item, idx) => ({
          ...item,
          id: 1000 + idx + 1,
          seq: idx + 1,
        })),
      },
      QA: {
        templateId: 102,
        templateCode: "MDL-PP-21-QA",
        versionId: 1002,
        versionNo: 1,
        updatedAt: "2026-11-10T06:00:00.000Z",
        items: DEMO_INSPECTION_ITEMS.slice(0, 5).map((item, idx) => ({
          ...item,
          id: 2000 + idx + 1,
          seq: idx + 1,
        })),
      },
    },
  },
  {
    modelId: 2,
    modelCode: "PP-22",
    modelDescription: "ปั๊มลมลูกสูบสายพาน PUMA 2 HP ถัง 95 ลิตร",
    brandName: "PUMA",
    pumpTypeName: "Piston (ลูกสูบ)",
    versions: {
      QC: {
        templateId: 201,
        templateCode: "MDL-PP-22-QC",
        versionId: 2001,
        versionNo: 1,
        updatedAt: "2026-11-10T06:00:00.000Z",
        items: DEMO_INSPECTION_ITEMS.map((item, idx) => ({
          ...item,
          id: 3000 + idx + 1,
          seq: idx + 1,
        })),
      },
      QA: {
        templateId: 202,
        templateCode: "MDL-PP-22-QA",
        versionId: 2002,
        versionNo: 1,
        updatedAt: "2026-11-10T06:00:00.000Z",
        items: DEMO_INSPECTION_ITEMS.slice(0, 5).map((item, idx) => ({
          ...item,
          id: 4000 + idx + 1,
          seq: idx + 1,
        })),
      },
    },
  },
  {
    modelId: 3,
    modelCode: "OS-25",
    modelDescription: "ปั๊มลม Oil-Free เสียงเงียบ 25 ลิตร",
    brandName: "PUMA",
    pumpTypeName: "Oil-Free (ไร้น้ำมัน)",
    versions: {
      QC: {
        templateId: 301,
        templateCode: "MDL-OS-25-QC",
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
      QA: {
        templateId: 302,
        templateCode: "MDL-OS-25-QA",
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
    },
  },
];

let memoryModels: MemoryModelRecord[] = structuredClone(INITIAL_MEMORY_MODELS);
let nextItemId = 9000;
let nextVersionId = 8000;

export function resetMemoryModelChecklists(): void {
  memoryModels = structuredClone(INITIAL_MEMORY_MODELS);
  nextItemId = 9000;
  nextVersionId = 8000;
}

function loadMemoryModelChecklistPayload(query: {
  modelId?: number;
  role?: InspectionRole;
}): ModelChecklistPayload {
  const role: InspectionRole = query.role === "QA" ? "QA" : "QC";
  const selected =
    memoryModels.find((m) => m.modelId === query.modelId) ?? memoryModels[0];

  const summaries: ModelChecklistSummary[] = memoryModels.map((m) => {
    const ver = m.versions[role];
    return {
      modelId: m.modelId,
      modelCode: m.modelCode,
      modelDescription: m.modelDescription,
      brandName: m.brandName,
      pumpTypeName: m.pumpTypeName,
      role,
      templateId: ver.templateId,
      templateCode: ver.templateCode,
      versionId: ver.versionId,
      versionNo: ver.versionNo,
      itemCount: ver.items.length,
      updatedAt: ver.updatedAt,
    };
  });

  const activeVer = selected.versions[role];

  return {
    models: summaries,
    selectedModelId: selected.modelId,
    role,
    activeVersionNo: activeVer.versionNo,
    items: activeVer.items,
    masterPool: MASTER_CHECKLIST_POOL,
  };
}

function saveMemoryModelChecklist(input: {
  modelId: number;
  role: InspectionRole;
  items: ModelChecklistItemInput[];
}): { versionId: number; versionNo: number; itemCount: number; modelCode: string } | null {
  const target = memoryModels.find((m) => m.modelId === input.modelId);
  if (!target) return null;

  const current = target.versions[input.role];
  const newVersionNo = current.versionNo + 1;
  const newVersionId = ++nextVersionId;
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

  target.versions[input.role] = {
    ...current,
    versionId: newVersionId,
    versionNo: newVersionNo,
    updatedAt: new Date().toISOString(),
    items: newItems,
  };

  return {
    versionId: newVersionId,
    versionNo: newVersionNo,
    itemCount: newItems.length,
    modelCode: target.modelCode,
  };
}

/**
 * Load all active models and the checklist items of the selected model + role.
 */
export async function loadModelChecklistPayload(query: {
  modelId?: number;
  role?: InspectionRole;
}): Promise<ModelChecklistPayload> {
  if (!dbConfigured()) {
    return loadMemoryModelChecklistPayload(query);
  }

  const role: InspectionRole = query.role === "QA" ? "QA" : "QC";
  const pool = await getPool();

  const modelsRes = await pool
    .request()
    .input("role", sql.VarChar(8), role)
    .query(`
      SELECT m.id AS model_id,
             m.code AS model_code,
             m.description AS model_desc,
             b.name AS brand_name,
             pt.name AS pump_type_name,
             tv.template_id,
             tv.template_code,
             tv.version_id,
             tv.version_no,
             tv.updated_at,
             ISNULL(ic.item_count, 0) AS item_count
        FROM dbo.models m
        JOIN dbo.brands b ON b.id = m.brand_id
        LEFT JOIN dbo.pump_types pt ON pt.id = m.pump_type_id
        OUTER APPLY (
          SELECT TOP (1)
                 t.id AS template_id,
                 t.code AS template_code,
                 v.id AS version_id,
                 v.version_no,
                 v.updated_at
            FROM dbo.checklist_templates t
            JOIN dbo.template_versions v ON v.template_id = t.id
           WHERE t.id = (CASE WHEN @role = 'QC' THEN m.qc_template_id ELSE m.qa_template_id END)
              OR (t.role = @role AND pt.code IS NOT NULL AND t.code = CONCAT(@role, '_', pt.code))
              OR t.role = @role
           ORDER BY
             CASE
               WHEN t.id = (CASE WHEN @role = 'QC' THEN m.qc_template_id ELSE m.qa_template_id END) THEN 0
               WHEN t.role = @role AND pt.code IS NOT NULL AND t.code = CONCAT(@role, '_', pt.code) THEN 1
               ELSE 2
             END,
             v.version_no DESC,
             v.id DESC
        ) tv
        OUTER APPLY (
          SELECT COUNT(1) AS item_count
            FROM dbo.checklist_items ci
           WHERE ci.version_id = tv.version_id AND ci.is_active = 1
        ) ic
       WHERE m.is_active = 1
       ORDER BY m.code ASC
    `);

  if (modelsRes.recordset.length === 0) {
    return loadMemoryModelChecklistPayload(query);
  }

  const summaries: ModelChecklistSummary[] = modelsRes.recordset.map((r) => ({
    modelId: Number(r.model_id),
    modelCode: String(r.model_code),
    modelDescription: r.model_desc ?? null,
    brandName: String(r.brand_name),
    pumpTypeName: r.pump_type_name ?? null,
    role,
    templateId: r.template_id ? Number(r.template_id) : null,
    templateCode: r.template_code ? String(r.template_code) : `MDL-${r.model_code}-${role}`,
    versionId: r.version_id ? Number(r.version_id) : 1,
    versionNo: r.version_no ? Number(r.version_no) : 1,
    itemCount: Number(r.item_count) > 0 ? Number(r.item_count) : DEMO_INSPECTION_ITEMS.length,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  }));

  const selectedModel =
    summaries.find((m) => m.modelId === query.modelId) ?? summaries[0];

  let items: InspectionItem[] = DEMO_INSPECTION_ITEMS;
  if (selectedModel.templateId && selectedModel.versionId) {
    const itemsRes = await pool
      .request()
      .input("versionId", sql.Int, selectedModel.versionId)
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
    models: summaries,
    selectedModelId: selectedModel.modelId,
    role,
    activeVersionNo: selectedModel.versionNo,
    items,
    masterPool: MASTER_CHECKLIST_POOL,
  };
}

/**
 * Save and publish a new checklist version for a specific model + role.
 * Preserves all historical versions so past unit_inspections remain 100% intact.
 */
export async function saveModelChecklist(
  userId: string,
  input: {
    modelId: number;
    role: InspectionRole;
    items: ModelChecklistItemInput[];
  },
): Promise<{ versionId: number; versionNo: number; itemCount: number; modelCode: string } | null> {
  if (!dbConfigured()) {
    return saveMemoryModelChecklist(input);
  }

  const pool = await getPool();
  const numericUserId = /^\d+$/.test(userId) ? Number(userId) : null;

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
  const modelCode = String(modelRow.code);
  const templateCode = `MDL-${modelCode}-${input.role}`.slice(0, 64);
  const templateName = `แบบตรวจ ${modelCode} (${input.role})`;

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 1. Find or create dedicated checklist_template for this model + role
    const tplLookup = await new sql.Request(tx)
      .input("code", sql.NVarChar(64), templateCode)
      .query(`SELECT id FROM dbo.checklist_templates WHERE code = @code`);

    let templateId: number;
    if (tplLookup.recordset.length > 0) {
      templateId = Number(tplLookup.recordset[0].id);
    } else {
      const tplInsert = await new sql.Request(tx)
        .input("code", sql.NVarChar(64), templateCode)
        .input("name", sql.NVarChar(200), templateName)
        .input("role", sql.VarChar(2), input.role)
        .input("scope", sql.NVarChar(100), modelCode)
        .input("userId", sql.BigInt, numericUserId)
        .query(`
          INSERT INTO dbo.checklist_templates (code, name, role, scope, created_by, updated_by)
          OUTPUT INSERTED.id
          VALUES (@code, @name, @role, @scope, @userId, @userId)
        `);
      templateId = Number(tplInsert.recordset[0].id);
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
        -- 1. Copy item_defects matching by title or seq from earlier versions
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

        -- 2. Copy item_defect_dispositions
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

    // 6. Link current_version_id on template and link template on model
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

    // 7. Update active plans of this model so newly started inspections immediately use the latest version
    const planVersionCol = input.role === "QA" ? "qa_template_version_id" : "qc_template_version_id";
    await new sql.Request(tx)
      .input("modelId", sql.Int, input.modelId)
      .input("versionId", sql.Int, versionId)
      .query(`
        UPDATE dbo.plans
           SET ${planVersionCol} = @versionId,
               updated_at = SYSUTCDATETIME()
         WHERE model_id = @modelId
           AND status IN ('OPEN', 'IN_PROGRESS')
      `);

    await tx.commit();

    return {
      versionId,
      versionNo: nextVersionNo,
      itemCount: input.items.length,
      modelCode,
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
