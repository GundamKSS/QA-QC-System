import "server-only";
import { getPool, sql } from "./pool";
import {
  DEMO_DEFECTS_BY_ITEM,
  DEMO_INSPECTION_ITEMS,
  type ActiveClaim,
  type ClaimOutcome,
  type CompletedInspectionInput,
  type InspectionQuota,
  type InspectionStore,
  type InspectionTemplateData,
  type NewClaimInput,
  type StoredInspection,
  type SubmitInspectionOutcome,
} from "@/lib/inspections/store";
import type {
  BrandGroup,
  CauseTag,
  Disposition,
  FailedItemFinding,
  InspectionItem,
  InspectionRole,
  PendingReworkItem,
  PlanInspectionSummary,
  PlanUnitInspectionItem,
  ReworkDetails,
  SelectedDefect,
  Severity,
  SubmitReworkInput,
  VideoRule,
} from "@/lib/inspections/types";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSqlInspectionStore(): InspectionStore {
  return {
    async getTemplate(planId: number, role: InspectionRole): Promise<InspectionTemplateData | null> {
      const pool = await getPool();

      // 1. Fetch plan, model, template version (with fallback when plan/model template is not published yet), and brand group
      const planRes = await pool
        .request()
        .input("planId", sql.BigInt, planId)
        .input("role", sql.VarChar(8), role)
        .query(`
          SELECT p.id AS plan_id, p.plan_no, rd.doc_no, m.code AS model_code, m.description AS model_desc,
                 b.brand_group,
                 tv.version_id, tv.version_no, tv.template_id, tv.template_code, tv.template_name
            FROM dbo.plans p
            JOIN dbo.receipt_docs rd ON rd.id = p.receipt_doc_id
            JOIN dbo.models m ON m.id = p.model_id
            JOIN dbo.brands b ON b.id = m.brand_id
            LEFT JOIN dbo.pump_types pt ON pt.id = m.pump_type_id
            OUTER APPLY (
              SELECT TOP (1)
                     v.id AS version_id, v.version_no, t.id AS template_id, t.code AS template_code, t.name AS template_name
                FROM dbo.template_versions v
                JOIN dbo.checklist_templates t ON t.id = v.template_id
               WHERE v.id = (CASE WHEN @role = 'QC' THEN p.qc_template_version_id ELSE p.qa_template_version_id END)
                  OR t.id = (CASE WHEN @role = 'QC' THEN m.qc_template_id ELSE m.qa_template_id END)
                  OR (t.role = @role AND pt.code IS NOT NULL AND t.code = CONCAT(@role, '_', pt.code))
                  OR t.role = @role
               ORDER BY
                 CASE
                   WHEN v.id = (CASE WHEN @role = 'QC' THEN p.qc_template_version_id ELSE p.qa_template_version_id END) THEN 0
                   WHEN t.id = (CASE WHEN @role = 'QC' THEN m.qc_template_id ELSE m.qa_template_id END) THEN 1
                   WHEN t.role = @role AND pt.code IS NOT NULL AND t.code = CONCAT(@role, '_', pt.code) THEN 2
                   ELSE 3
                 END,
                 v.version_no DESC,
                 v.id DESC
            ) tv
           WHERE p.id = @planId
        `);

      if (planRes.recordset.length === 0) return null;
      const planRow = planRes.recordset[0];
      const versionId: number | null = planRow.version_id ?? null;
      const brandGroup: BrandGroup = planRow.brand_group === "PUMA" ? "PUMA" : "OTHER";

      if (!versionId) {
        return {
          template: {
            id: 1,
            code: "TPL-PISTON-QC",
            name: "แบบตรวจรับปั๊มลมมาตรฐาน",
            role,
            versionId: 1,
            versionNo: 1,
          },
          items: DEMO_INSPECTION_ITEMS,
          itemDefects: DEMO_DEFECTS_BY_ITEM,
          brandGroup,
          modelCode: planRow.model_code,
          modelDescription: planRow.model_desc,
          planNo: planRow.plan_no,
          docNo: planRow.doc_no,
        };
      }

      // 2. Fetch checklist items (SELECT * safely reads animation_type when migration 019 is applied)
      const itemsRes = await pool
        .request()
        .input("versionId", sql.Int, versionId)
        .query(`
          SELECT *
            FROM dbo.checklist_items
           WHERE version_id = @versionId AND is_active = 1
           ORDER BY seq ASC
        `);

      const items: InspectionItem[] =
        itemsRes.recordset.length > 0
          ? itemsRes.recordset.map((r) => ({
              id: r.id,
              seq: r.seq,
              topicCode: r.topic_code,
              title: r.title,
              inputType: r.input_type,
              isRequired: Boolean(r.is_required),
              photoRule: r.photo_rule,
              videoRule: r.video_rule,
              animationType: r.animation_type ?? null,
              helpText: r.help_text,
              exampleImage: r.example_image,
            }))
          : DEMO_INSPECTION_ITEMS;

      // 3. Fetch linked active defects and dispositions for this version's items
      const itemDefects: Record<number, SelectedDefect[]> = {};
      for (const it of items) itemDefects[it.id] = [];

      const defectsRes = await pool
        .request()
        .input("versionId", sql.Int, versionId)
        .input("brandGroup", sql.VarChar(8), brandGroup)
        .query(`
          SELECT idf.id AS item_defect_id, idf.item_id, idf.part, idf.severity,
                 d.id AS defect_id, d.code, d.name_th, d.requires_video, d.cause_type_default,
                 idd.disposition
            FROM dbo.item_defects idf
            JOIN dbo.checklist_items ci ON ci.id = idf.item_id
            JOIN dbo.defects d ON d.id = idf.defect_id
            JOIN dbo.item_defect_dispositions idd ON idd.item_defect_id = idf.id AND idd.brand_group = @brandGroup AND idd.is_active = 1
           WHERE ci.version_id = @versionId AND d.is_active = 1 AND idf.is_active = 1
           ORDER BY idf.item_id ASC, idf.seq ASC
        `);

      for (const d of defectsRes.recordset) {
        if (!itemDefects[d.item_id]) itemDefects[d.item_id] = [];
        itemDefects[d.item_id].push({
          itemDefectId: d.item_defect_id,
          defectId: d.defect_id,
          code: d.code,
          nameTh: d.name_th,
          part: d.part,
          severity: d.severity as Severity,
          disposition: d.disposition as Disposition,
          requiresVideo: Boolean(d.requires_video),
          causeTag: d.cause_type_default as CauseTag | null,
        });
      }

      return {
        template: {
          id: planRow.template_id,
          code: planRow.template_code,
          name: planRow.template_name,
          role,
          versionId: planRow.version_id,
          versionNo: planRow.version_no,
        },
        items,
        itemDefects: itemsRes.recordset.length > 0 ? itemDefects : DEMO_DEFECTS_BY_ITEM,
        brandGroup,
        modelCode: planRow.model_code,
        modelDescription: planRow.model_desc,
        planNo: planRow.plan_no,
        docNo: planRow.doc_no,
      };
    },

    async getActiveClaims(workOrderId: string): Promise<ActiveClaim[]> {
      if (!GUID.test(workOrderId)) return [];
      const pool = await getPool();
      const res = await pool
        .request()
        .input("workOrderId", sql.UniqueIdentifier, workOrderId)
        .query(`
          SELECT CAST(ui.id AS VARCHAR(36)) AS id, ui.serial_pump,
                 CAST(ui.inspector_id AS VARCHAR(20)) AS inspector_id,
                 COALESCE(u.full_name, u.employee_code) AS inspector_name,
                 ui.started_at
            FROM dbo.unit_inspections ui
            JOIN dbo.users u ON u.id = ui.inspector_id
           WHERE ui.work_order_id = @workOrderId AND ui.status = 'IN_PROGRESS'
           ORDER BY ui.started_at ASC
        `);

      return res.recordset.map((r) => ({
        inspectionId: r.id,
        serialPump: r.serial_pump,
        inspectorId: String(r.inspector_id),
        inspectorName: r.inspector_name,
        startedAt: r.started_at,
      }));
    },

    async getQuota(workOrderId: string): Promise<InspectionQuota | null> {
      if (!GUID.test(workOrderId)) return null;
      const pool = await getPool();
      const woRes = await pool
        .request()
        .input("workOrderId", sql.UniqueIdentifier, workOrderId)
        .query(`
          SELECT qty_need, qty_done
            FROM dbo.work_orders
           WHERE id = @workOrderId
        `);

      if (woRes.recordset.length === 0) return null;
      const wo = woRes.recordset[0];
      const activeClaims = await this.getActiveClaims(workOrderId);
      const remaining = Math.max(0, wo.qty_need - wo.qty_done - activeClaims.length);

      return {
        qtyNeed: wo.qty_need,
        qtyDone: wo.qty_done,
        inProgress: activeClaims.length,
        remaining,
        activeClaims,
      };
    },

    async findInspection(id: string): Promise<StoredInspection | null> {
      if (!GUID.test(id)) return null;
      const pool = await getPool();
      const res = await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`
          SELECT CAST(ui.id AS VARCHAR(36)) AS id, ui.plan_id,
                 CAST(ui.work_order_id AS VARCHAR(36)) AS work_order_id,
                 ui.role, ui.cycle_no, ui.round_no, ui.inspection_no,
                 ui.serial_pump, ui.serial_motor, ui.serial_supplier, ui.serial_entry_mode, ui.entry_mode,
                 CAST(ui.inspector_id AS VARCHAR(20)) AS inspector_id,
                 COALESCE(u.full_name, u.employee_code) AS inspector_name,
                 ui.started_at, ui.submitted_at,
                 ui.result, ui.action, ui.suggested_action, ui.status
            FROM dbo.unit_inspections ui
            JOIN dbo.users u ON u.id = ui.inspector_id
           WHERE ui.id = @id
        `);

      if (res.recordset.length === 0) return null;
      const r = res.recordset[0];
      return {
        id: r.id,
        planId: Number(r.plan_id),
        workOrderId: r.work_order_id,
        role: r.role,
        cycleNo: r.cycle_no,
        roundNo: r.round_no,
        inspectionNo: r.inspection_no,
        serialPump: r.serial_pump,
        serialMotor: r.serial_motor,
        serialSupplier: r.serial_supplier,
        serialEntryMode: r.serial_entry_mode,
        entryMode: r.entry_mode,
        inspectorId: String(r.inspector_id),
        inspectorName: r.inspector_name,
        startedAt: r.started_at,
        submittedAt: r.submitted_at,
        result: r.result,
        action: r.action,
        suggestedAction: r.suggested_action,
        status: r.status,
      };
    },

    async claimUnit(input: NewClaimInput): Promise<ClaimOutcome> {
      if (!GUID.test(input.workOrderId)) {
        return { kind: "not_found", message: "ไม่พบใบงานที่ระบุ" };
      }
      const pool = await getPool();
      const quota = await this.getQuota(input.workOrderId);
      if (!quota) return { kind: "not_found", message: "ไม่พบใบงานที่ระบุ" };

      // Check serial uniqueness and existing active claims
      const existing = await pool
        .request()
        .input("planId", sql.BigInt, input.planId)
        .input("serialPump", sql.NVarChar(64), input.serialPump)
        .query(`
          SELECT CAST(ui.id AS VARCHAR(36)) AS id, ui.status,
                 CAST(ui.inspector_id AS VARCHAR(20)) AS inspector_id,
                 COALESCE(u.full_name, u.employee_code) AS inspector_name,
                 CAST(ui.work_order_id AS VARCHAR(36)) AS work_order_id,
                 ui.cycle_no, ui.round_no, ui.inspection_no, ui.serial_motor, ui.serial_supplier,
                 ui.serial_entry_mode, ui.entry_mode, ui.started_at, ui.submitted_at, ui.result, ui.action, ui.suggested_action
            FROM dbo.unit_inspections ui
            JOIN dbo.users u ON u.id = ui.inspector_id
           WHERE ui.plan_id = @planId AND ui.serial_pump = @serialPump AND ui.status <> 'CANCELLED'
        `);

      if (existing.recordset.length > 0) {
        const row = existing.recordset[0];
        if (row.status === "COMPLETED") {
          return {
            kind: "already_completed",
            message: `Serial ${input.serialPump} ได้รับการตรวจแล้วในแผนนี้ — บันทึกซ้ำไม่ได้`,
          };
        }
        if (row.status === "IN_PROGRESS") {
          if (String(row.inspector_id) === String(input.inspectorId)) {
            return {
              kind: "resumed",
              inspection: {
                id: row.id,
                planId: input.planId,
                workOrderId: row.work_order_id,
                role: input.role,
                cycleNo: row.cycle_no,
                roundNo: row.round_no,
                inspectionNo: row.inspection_no,
                serialPump: input.serialPump,
                serialMotor: row.serial_motor,
                serialSupplier: row.serial_supplier,
                serialEntryMode: row.serial_entry_mode,
                entryMode: row.entry_mode,
                inspectorId: String(row.inspector_id),
                inspectorName: row.inspector_name,
                startedAt: row.started_at,
                submittedAt: row.submitted_at,
                result: row.result,
                action: row.action,
                suggestedAction: row.suggested_action,
                status: "IN_PROGRESS",
              },
              quota,
            };
          }
          return {
            kind: "claimed_by_other",
            message: `เครื่องนี้กำลังตรวจโดย ${row.inspector_name} — ไม่สามารถตรวจซ้ำได้`,
            inspectorName: row.inspector_name,
          };
        }
      }

      if (quota.remaining <= 0) {
        return {
          kind: "quota_full",
          message: `ยอดตรวจครบจำนวนแล้ว (ต้องตรวจ ${quota.qtyNeed} · เสร็จแล้ว ${quota.qtyDone} · กำลังตรวจ ${quota.inProgress})`,
          quota,
        };
      }

      // Resolve template version safely (falling back to model/pump_type/role template version, or creating a default if none exists)
      const planRes = await pool
        .request()
        .input("planId", sql.BigInt, input.planId)
        .input("role", sql.VarChar(8), input.role)
        .query<{ version_id: number }>(`
          DECLARE @vid INT;
          SELECT TOP (1) @vid = v.id
            FROM dbo.plans p
            JOIN dbo.models m ON m.id = p.model_id
            LEFT JOIN dbo.pump_types pt ON pt.id = m.pump_type_id
            JOIN dbo.checklist_templates t ON t.role = @role
            JOIN dbo.template_versions v ON v.template_id = t.id
           WHERE p.id = @planId
           ORDER BY
             CASE
               WHEN v.id = (CASE WHEN @role = 'QC' THEN p.qc_template_version_id ELSE p.qa_template_version_id END) THEN 0
               WHEN t.id = (CASE WHEN @role = 'QC' THEN m.qc_template_id ELSE m.qa_template_id END) THEN 1
               WHEN pt.code IS NOT NULL AND t.code = CONCAT(@role, '_', pt.code) THEN 2
               ELSE 3
             END,
             v.version_no DESC,
             v.id DESC;

          IF @vid IS NULL
              SELECT TOP (1) @vid = id FROM dbo.template_versions ORDER BY id;

          IF @vid IS NULL
          BEGIN
              DECLARE @tid INT;
              SELECT TOP (1) @tid = id FROM dbo.checklist_templates WHERE code = 'QC_DEFAULT';
              IF @tid IS NULL
              BEGIN
                  INSERT INTO dbo.checklist_templates (code, name, role, scope)
                  VALUES ('QC_DEFAULT', N'แบบตรวจรับมาตรฐาน', 'QC', 'PISTON');
                  SET @tid = SCOPE_IDENTITY();
              END
              INSERT INTO dbo.template_versions (template_id, version_no, status, source)
              VALUES (@tid, 1, 'PUBLISHED', 'IMPORT');
              SET @vid = SCOPE_IDENTITY();
          END

          SELECT @vid AS version_id;
        `);
      const versionId = planRes.recordset[0]?.version_id ?? 1;
      const customId = input.id && GUID.test(input.id) ? input.id : null;

      // Insert new claim (use NEWID() when @id is null because NEWSEQUENTIALID() is only valid in DEFAULT constraints)
      const insertRes = await pool
        .request()
        .input("id", sql.UniqueIdentifier, customId)
        .input("planId", sql.BigInt, input.planId)
        .input("workOrderId", sql.UniqueIdentifier, input.workOrderId)
        .input("role", sql.VarChar(8), input.role)
        .input("serialPump", sql.NVarChar(64), input.serialPump)
        .input("serialMotor", sql.NVarChar(64), input.serialMotor ?? null)
        .input("serialSupplier", sql.NVarChar(64), input.serialSupplier ?? null)
        .input("serialEntryMode", sql.VarChar(16), input.serialEntryMode)
        .input("entryMode", sql.VarChar(16), input.entryMode)
        .input("templateVersionId", sql.Int, versionId)
        .input("inspectorId", sql.BigInt, Number(input.inspectorId))
        .input("inspectionNo", sql.Int, quota.qtyDone + quota.inProgress + 1)
        .query(`
          INSERT INTO dbo.unit_inspections (
            id, plan_id, work_order_id, role, serial_pump, serial_motor, serial_supplier,
            serial_entry_mode, entry_mode, template_version_id, inspector_id, inspection_no,
            result, status, created_by, updated_by
          )
          OUTPUT CAST(INSERTED.id AS VARCHAR(36)) AS id, INSERTED.started_at
          VALUES (
            ISNULL(@id, NEWID()), @planId, @workOrderId, @role, @serialPump, @serialMotor, @serialSupplier,
            @serialEntryMode, @entryMode, @templateVersionId, @inspectorId, @inspectionNo,
            'NOT_PASSED', 'IN_PROGRESS', @inspectorId, @inspectorId
          )
        `);

      const inserted = insertRes.recordset[0];
      const updatedQuota = await this.getQuota(input.workOrderId);

      return {
        kind: "claimed",
        inspection: {
          id: inserted.id,
          planId: input.planId,
          workOrderId: input.workOrderId,
          role: input.role,
          cycleNo: 1,
          roundNo: 1,
          inspectionNo: quota.qtyDone + quota.inProgress + 1,
          serialPump: input.serialPump,
          serialMotor: input.serialMotor ?? null,
          serialSupplier: input.serialSupplier ?? null,
          serialEntryMode: input.serialEntryMode,
          entryMode: input.entryMode,
          inspectorId: input.inspectorId,
          inspectorName: input.inspectorName,
          startedAt: inserted.started_at,
          submittedAt: null,
          result: null,
          action: null,
          suggestedAction: null,
          status: "IN_PROGRESS",
        },
        quota: updatedQuota!,
      };
    },

    async cancelClaim(inspectionId: string, inspectorId: string): Promise<boolean> {
      if (!GUID.test(inspectionId)) return false;
      const pool = await getPool();
      const res = await pool
        .request()
        .input("id", sql.UniqueIdentifier, inspectionId)
        .input("inspectorId", sql.BigInt, Number(inspectorId))
        .query(`
          UPDATE dbo.unit_inspections
             SET status = 'CANCELLED', updated_at = SYSUTCDATETIME()
           WHERE id = @id AND inspector_id = @inspectorId AND status = 'IN_PROGRESS'
        `);

      return res.rowsAffected[0] > 0;
    },

    async submitResult(input: CompletedInspectionInput): Promise<SubmitInspectionOutcome> {
      if (!GUID.test(input.inspectionId) || !GUID.test(input.workOrderId)) {
        return { kind: "not_found", message: "ไม่พบข้อมูลการตรวจนี้" };
      }
      const pool = await getPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        // 1. Verify inspection is in progress
        const inspectRes = await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, input.inspectionId)
          .query(`
            SELECT id, status, serial_pump, inspection_no
              FROM dbo.unit_inspections WITH (UPDLOCK, ROWLOCK)
             WHERE id = @id
          `);

        if (inspectRes.recordset.length === 0) {
          await transaction.rollback();
          return { kind: "not_found", message: "ไม่พบข้อมูลการตรวจนี้" };
        }
        const current = inspectRes.recordset[0];
        if (current.status !== "IN_PROGRESS") {
          await transaction.rollback();
          return { kind: "not_in_progress", message: "รายการตรวจนี้ไม่ได้อยู่ในสถานะกำลังตรวจ" };
        }

        // 2. Update unit_inspections
        await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, input.inspectionId)
          .input("result", sql.VarChar(16), input.result)
          .input("action", sql.VarChar(10), input.action)
          .input("suggestedAction", sql.VarChar(10), input.suggestedAction)
          .input("inspectorId", sql.BigInt, Number(input.inspectorId))
          .query(`
            UPDATE dbo.unit_inspections
               SET status = 'COMPLETED',
                   submitted_at = SYSUTCDATETIME(),
                   result = @result,
                   action = @action,
                   suggested_action = @suggestedAction,
                   updated_at = SYSUTCDATETIME(),
                   updated_by = @inspectorId
             WHERE id = @id
          `);

        // 3. Insert item_results & item_defect_results & media
        for (const [itemIdStr, answer] of Object.entries(input.answers)) {
          const itemId = Number(itemIdStr);
          if (!answer.status && !answer.value) continue;

          const itemResultRes = await new sql.Request(transaction)
            .input("unitInspectionId", sql.UniqueIdentifier, input.inspectionId)
            .input("itemId", sql.Int, itemId)
            .input("status", sql.VarChar(10), answer.status ?? "NORMAL")
            .input("value", sql.NVarChar(500), answer.value ?? null)
            .input("remark", sql.NVarChar(500), answer.remark ?? null)
            .input("inspectorId", sql.BigInt, Number(input.inspectorId))
            .query(`
              INSERT INTO dbo.item_results (
                unit_inspection_id, item_id, status, value, remark, created_by, updated_by
              )
              OUTPUT INSERTED.id
              VALUES (
                @unitInspectionId, @itemId, @status, @value, @remark, @inspectorId, @inspectorId
              )
            `);

          const itemResultId = itemResultRes.recordset[0].id;

          // Defects
          if (answer.defects && answer.defects.length > 0) {
            for (const d of answer.defects) {
              // Ensure defect_id actually exists in dbo.defects
              let defectId = Number(d.defectId);
              if (defectId === 901) defectId = 5;
              else if (defectId === 902) defectId = 10;
              else if (defectId === 903) defectId = 8;
              else if (defectId === 904) defectId = 120;
              else if (defectId === 905) defectId = 3;

              const defExists = await new sql.Request(transaction)
                .input("defId", sql.Int, defectId)
                .query(`SELECT 1 FROM dbo.defects WHERE id = @defId`);
              if (defExists.recordset.length === 0) {
                defectId = 3; // Fallback to DEF00001 (ชำรุด)
              }

              let itemDefectId: number | null = d.itemDefectId ? Number(d.itemDefectId) : null;
              if (itemDefectId != null) {
                const itemDefExists = await new sql.Request(transaction)
                  .input("idfId", sql.Int, itemDefectId)
                  .query(`SELECT 1 FROM dbo.item_defects WHERE id = @idfId`);
                if (itemDefExists.recordset.length === 0) {
                  itemDefectId = null;
                }
              }

              const validDispositions = ["CONCESSION", "REWORK", "REJECT", "CHOOSE"];
              const disposition = validDispositions.includes(d.disposition) ? d.disposition : "REWORK";
              const validSeverities = ["MINOR", "MAJOR", "CRITICAL"];
              const severity = validSeverities.includes(d.severity) ? d.severity : "MAJOR";
              const validCauses = ["SUPPLIER", "TRANSPORT", "INTERNAL", "UNKNOWN"];
              const causeTag = (d.causeTag && validCauses.includes(d.causeTag)) ? d.causeTag : null;
              const locationNote = d.locationNote?.trim() ? d.locationNote.trim().slice(0, 200) : null;

              await new sql.Request(transaction)
                .input("itemResultId", sql.UniqueIdentifier, itemResultId)
                .input("itemDefectId", sql.Int, itemDefectId)
                .input("defectId", sql.Int, defectId)
                .input("disposition", sql.VarChar(10), disposition)
                .input("severity", sql.VarChar(8), severity)
                .input("causeTag", sql.VarChar(16), causeTag)
                .input("locationNote", sql.NVarChar(200), locationNote)
                .input("inspectorId", sql.BigInt, Number(input.inspectorId))
                .query(`
                  INSERT INTO dbo.item_defect_results (
                    item_result_id, item_defect_id, defect_id, disposition_applied, severity,
                    cause_tag, location_note, created_by, updated_by
                  )
                  VALUES (
                    @itemResultId, @itemDefectId, @defectId, @disposition, @severity,
                    @causeTag, @locationNote, @inspectorId, @inspectorId
                  )
                `);
            }
          }

          // Photos
          if (answer.photos && answer.photos.length > 0) {
            for (const ph of answer.photos) {
              await new sql.Request(transaction)
                .input("ownerId", sql.UniqueIdentifier, itemResultId)
                .input("storageKey", sql.NVarChar(sql.MAX), ph.uri)
                .input("phash", sql.VarChar(64), ph.pHash ?? null)
                .input("inspectorId", sql.BigInt, Number(input.inspectorId))
                .query(`
                  INSERT INTO dbo.media (
                    owner_type, owner_id, kind, storage_key, mime, phash, created_by, updated_by
                  )
                  VALUES (
                    'INSPECTION_ITEM', @ownerId, 'PHOTO', @storageKey, 'image/jpeg', @phash, @inspectorId, @inspectorId
                  )
                `);
            }
          }

          // Video
          if (answer.video) {
            await new sql.Request(transaction)
              .input("ownerId", sql.UniqueIdentifier, itemResultId)
              .input("storageKey", sql.NVarChar(sql.MAX), answer.video.uri)
              .input("inspectorId", sql.BigInt, Number(input.inspectorId))
              .query(`
                INSERT INTO dbo.media (
                  owner_type, owner_id, kind, storage_key, mime, created_by, updated_by
                )
                VALUES (
                  'INSPECTION_ITEM', @ownerId, 'VIDEO', @storageKey, 'video/mp4', @inspectorId, @inspectorId
                )
              `);
          }
        }

        // 4. Update work_orders.qty_done
        const updateWoRes = await new sql.Request(transaction)
          .input("workOrderId", sql.UniqueIdentifier, input.workOrderId)
          .query(`
            UPDATE dbo.work_orders
               SET qty_done = qty_done + 1, updated_at = SYSUTCDATETIME()
             OUTPUT INSERTED.qty_done, INSERTED.qty_need
             WHERE id = @workOrderId
          `);

        const woRow = updateWoRes.recordset[0];

        // 5. Update plans.qc_done_total
        await new sql.Request(transaction)
          .input("planId", sql.BigInt, input.planId)
          .query(`
            UPDATE dbo.plans
               SET qc_done_total = qc_done_total + 1, updated_at = SYSUTCDATETIME()
             WHERE id = @planId
          `);

        await transaction.commit();

        return {
          kind: "saved",
          inspection: {
            id: input.inspectionId,
            planId: input.planId,
            workOrderId: input.workOrderId,
            role: input.role,
            cycleNo: 1,
            roundNo: 1,
            inspectionNo: current.inspection_no,
            serialPump: current.serial_pump,
            serialMotor: null,
            serialSupplier: null,
            serialEntryMode: "MANUAL",
            entryMode: "LIVE",
            inspectorId: input.inspectorId,
            startedAt: new Date(),
            submittedAt: new Date(),
            result: input.result,
            action: input.action,
            suggestedAction: input.suggestedAction,
            status: "COMPLETED",
          },
          qtyDone: woRow?.qty_done ?? 1,
          qtyNeed: woRow?.qty_need ?? 10,
        };
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    },

    async getPendingReworks(inspectorId?: string | null): Promise<PendingReworkItem[]> {
      const pool = await getPool();
      const req = pool.request();
      let where = `
        WHERE ui.status = 'COMPLETED'
          AND ui.result = 'NOT_PASSED'
          AND ui.action = 'REWORK'
          AND NOT EXISTS (
            SELECT 1 FROM dbo.unit_inspections child
             WHERE child.parent_inspection_id = ui.id
               AND child.status IN ('COMPLETED', 'IN_PROGRESS')
          )
      `;
      if (inspectorId && /^\d+$/.test(String(inspectorId))) {
        req.input("inspectorId", sql.BigInt, Number(inspectorId));
        where += ` AND ui.inspector_id = @inspectorId`;
      }

      const res = await req.query<{
        id: string;
        work_order_id: string;
        wo_no: string;
        plan_id: number;
        plan_no: string;
        model_code: string;
        description: string | null;
        serial_pump: string;
        round_no: number;
        role: InspectionRole;
        submitted_at: string | null;
        inspector_id: string;
        inspector_name: string;
        failed_item_count: number;
        defect_names: string | null;
      }>(`
        SELECT
          CAST(ui.id AS VARCHAR(36)) AS id,
          CAST(ui.work_order_id AS VARCHAR(36)) AS work_order_id,
          COALESCE(wo.wo_no, '') AS wo_no,
          ui.plan_id,
          COALESCE(p.plan_no, '') AS plan_no,
          COALESCE(m.code, '') AS model_code,
          p.description,
          ui.serial_pump,
          ui.round_no,
          ui.role,
          CONVERT(VARCHAR(33), ui.submitted_at, 126) AS submitted_at,
          CAST(ui.inspector_id AS VARCHAR(20)) AS inspector_id,
          COALESCE(u.full_name, u.employee_code, '') AS inspector_name,
          (
            SELECT COUNT(DISTINCT ir.item_id)
              FROM dbo.item_results ir
             WHERE ir.unit_inspection_id = ui.id AND ir.status = 'FAIL'
          ) AS failed_item_count,
          (
            SELECT STRING_AGG(d.name_th, N', ')
              FROM dbo.item_results ir
              JOIN dbo.item_defect_results idr ON idr.item_result_id = ir.id
              JOIN dbo.defects d ON d.id = idr.defect_id
             WHERE ir.unit_inspection_id = ui.id
          ) AS defect_names
        FROM dbo.unit_inspections ui
        LEFT JOIN dbo.work_orders wo ON wo.id = ui.work_order_id
        LEFT JOIN dbo.plans p ON p.id = ui.plan_id
        LEFT JOIN dbo.models m ON m.id = p.model_id
        LEFT JOIN dbo.users u ON u.id = ui.inspector_id
        ${where}
        ORDER BY ui.submitted_at DESC
      `);

      return res.recordset.map((row) => ({
        id: row.id,
        workOrderId: row.work_order_id,
        woNo: row.wo_no,
        planId: Number(row.plan_id),
        planNo: row.plan_no,
        modelCode: row.model_code,
        description: row.description,
        serialPump: row.serial_pump,
        roundNo: row.round_no,
        failedItemCount: Number(row.failed_item_count || 0),
        defectNames: row.defect_names || null,
        role: row.role,
        submittedAt: row.submitted_at,
        inspectorId: row.inspector_id,
        inspectorName: row.inspector_name,
      }));
    },

    async getReworkDetails(inspectionId: string): Promise<ReworkDetails | null> {
      if (!GUID.test(inspectionId)) return null;
      const pool = await getPool();

      const inspectRes = await pool
        .request()
        .input("id", sql.UniqueIdentifier, inspectionId)
        .query(`
          SELECT CAST(ui.id AS VARCHAR(36)) AS id, ui.plan_id,
                 CAST(ui.work_order_id AS VARCHAR(36)) AS work_order_id,
                 ui.role, ui.cycle_no, ui.round_no, ui.inspection_no,
                 ui.serial_pump, ui.serial_motor, ui.serial_supplier,
                 ui.serial_entry_mode, ui.entry_mode,
                 CAST(ui.inspector_id AS VARCHAR(20)) AS inspector_id,
                 COALESCE(u.full_name, u.employee_code) AS inspector_name,
                 ui.started_at, ui.submitted_at,
                 ui.result, ui.action, ui.suggested_action, ui.status,
                 COALESCE(p.plan_no, '') AS plan_no,
                 COALESCE(m.code, '') AS model_code,
                 p.description
            FROM dbo.unit_inspections ui
            JOIN dbo.plans p ON p.id = ui.plan_id
            LEFT JOIN dbo.models m ON m.id = p.model_id
            LEFT JOIN dbo.users u ON u.id = ui.inspector_id
           WHERE ui.id = @id
        `);

      if (inspectRes.recordset.length === 0) return null;
      const r = inspectRes.recordset[0];
      if (r.status !== "COMPLETED" || r.action !== "REWORK") {
        return null;
      }

      const stored: StoredInspection = {
        id: r.id,
        planId: Number(r.plan_id),
        workOrderId: r.work_order_id,
        role: r.role,
        cycleNo: r.cycle_no,
        roundNo: r.round_no,
        inspectionNo: r.inspection_no,
        serialPump: r.serial_pump,
        serialMotor: r.serial_motor,
        serialSupplier: r.serial_supplier,
        serialEntryMode: r.serial_entry_mode,
        entryMode: r.entry_mode,
        inspectorId: String(r.inspector_id),
        inspectorName: r.inspector_name,
        startedAt: r.started_at,
        submittedAt: r.submitted_at,
        result: r.result,
        action: r.action,
        suggestedAction: r.suggested_action,
        status: r.status,
      };

      const itemsRes = await pool
        .request()
        .input("id", sql.UniqueIdentifier, inspectionId)
        .query<{
          item_result_id: string;
          item_id: number;
          seq: number;
          topic_code: string | null;
          title: string;
          video_rule: VideoRule;
          remark: string | null;
        }>(`
          SELECT CAST(ir.id AS VARCHAR(36)) AS item_result_id,
                 ir.item_id, ci.seq, ci.topic_code, ci.title, ci.video_rule, ir.remark
            FROM dbo.item_results ir
            JOIN dbo.checklist_items ci ON ci.id = ir.item_id
           WHERE ir.unit_inspection_id = @id AND ir.status = 'FAIL'
           ORDER BY ci.seq ASC
        `);

      const failedItems: FailedItemFinding[] = [];

      for (const row of itemsRes.recordset) {
        const defRes = await pool
          .request()
          .input("itemResultId", sql.UniqueIdentifier, row.item_result_id)
          .query<{
            defect_id: number;
            code: string;
            name_th: string;
            severity: Severity;
            disposition: Disposition;
            part: string | null;
            requires_video: boolean;
            cause_tag: CauseTag | null;
            location_note: string | null;
          }>(`
            SELECT idr.defect_id,
                   d.code,
                   d.name_th,
                   idr.severity,
                   idr.disposition_applied AS disposition,
                   idf.part,
                   COALESCE(d.requires_video, 0) AS requires_video,
                   idr.cause_tag,
                   idr.location_note
              FROM dbo.item_defect_results idr
              JOIN dbo.defects d ON d.id = idr.defect_id
              LEFT JOIN dbo.item_defects idf ON idf.id = idr.item_defect_id
             WHERE idr.item_result_id = @itemResultId
          `);

        const defects: SelectedDefect[] = defRes.recordset.map((d) => ({
          defectId: d.defect_id,
          code: d.code,
          nameTh: d.name_th,
          part: d.part,
          severity: d.severity,
          disposition: d.disposition,
          requiresVideo: Boolean(d.requires_video),
          causeTag: d.cause_tag,
          locationNote: d.location_note,
        }));

        const mediaRes = await pool
          .request()
          .input("itemResultId", sql.UniqueIdentifier, row.item_result_id)
          .query<{
            kind: string;
            storage_key: string;
            phash: string | null;
            created_at: Date;
          }>(`
            SELECT kind, storage_key, phash, created_at
              FROM dbo.media
             WHERE owner_type = 'INSPECTION_ITEM' AND owner_id = @itemResultId
          `);

        const photos = mediaRes.recordset
          .filter((m) => m.kind === "PHOTO")
          .map((m) => ({
            uri: m.storage_key,
            timestamp: m.created_at.toISOString(),
            pHash: m.phash,
          }));

        const videoRow = mediaRes.recordset.find((m) => m.kind === "VIDEO");
        const video = videoRow
          ? {
              uri: videoRow.storage_key,
              durationSeconds: 15,
            }
          : null;

        failedItems.push({
          itemId: row.item_id,
          seq: row.seq,
          topicCode: row.topic_code,
          title: row.title,
          videoRule: row.video_rule,
          defects,
          photos,
          video,
          remark: row.remark,
        });
      }

      return {
        inspection: stored,
        planNo: r.plan_no,
        modelCode: r.model_code,
        description: r.description,
        failedItems,
      };
    },

    async submitRework(input: SubmitReworkInput, inspectorId: string): Promise<SubmitInspectionOutcome> {
      if (!GUID.test(input.parentInspectionId)) {
        return { kind: "not_found", message: "ไม่พบข้อมูลการตรวจเดิม" };
      }

      const pool = await getPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        const inspectRes = await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, input.parentInspectionId)
          .query(`
            SELECT id, plan_id, work_order_id, role, cycle_no, round_no, inspection_no,
                   serial_pump, serial_motor, serial_supplier, serial_entry_mode, entry_mode,
                   template_version_id, status, action
              FROM dbo.unit_inspections WITH (UPDLOCK, ROWLOCK)
             WHERE id = @id
          `);

        if (inspectRes.recordset.length === 0) {
          await transaction.rollback();
          return { kind: "not_found", message: "ไม่พบข้อมูลการตรวจเดิม" };
        }
        const parent = inspectRes.recordset[0];
        if (parent.status !== "COMPLETED" || parent.action !== "REWORK") {
          await transaction.rollback();
          return { kind: "not_in_progress", message: "รายการตรวจนี้ไม่ได้อยู่ในสถานะส่งซ่อม (Rework)" };
        }

        const allNormal = Object.values(input.answers).every((a) => a.status === "NORMAL");
        const result = allNormal ? "PASS" : "NOT_PASSED";
        const action = allNormal ? null : (input.decision ?? "REWORK");
        const nextRoundNo = parent.round_no + 1;

        const insertRes = await new sql.Request(transaction)
          .input("planId", sql.BigInt, parent.plan_id)
          .input("workOrderId", sql.UniqueIdentifier, parent.work_order_id)
          .input("role", sql.VarChar(8), parent.role)
          .input("cycleNo", sql.Int, parent.cycle_no)
          .input("roundNo", sql.Int, nextRoundNo)
          .input("parentId", sql.UniqueIdentifier, parent.id)
          .input("inspectionNo", sql.Int, parent.inspection_no)
          .input("serialPump", sql.NVarChar(64), parent.serial_pump)
          .input("serialMotor", sql.NVarChar(64), parent.serial_motor)
          .input("serialSupplier", sql.NVarChar(64), parent.serial_supplier)
          .input("serialEntryMode", sql.VarChar(16), parent.serial_entry_mode)
          .input("entryMode", sql.VarChar(16), parent.entry_mode)
          .input("templateVersionId", sql.Int, parent.template_version_id)
          .input("inspectorId", sql.BigInt, Number(inspectorId))
          .input("result", sql.VarChar(16), result)
          .input("action", sql.VarChar(10), action)
          .query(`
            INSERT INTO dbo.unit_inspections (
              plan_id, work_order_id, role, cycle_no, round_no, parent_inspection_id, inspection_no,
              serial_pump, serial_motor, serial_supplier, serial_entry_mode, entry_mode,
              template_version_id, inspector_id, started_at, submitted_at, result, action,
              suggested_action, status, created_by, updated_by
            )
            OUTPUT INSERTED.id
            VALUES (
              @planId, @workOrderId, @role, @cycleNo, @roundNo, @parentId, @inspectionNo,
              @serialPump, @serialMotor, @serialSupplier, @serialEntryMode, @entryMode,
              @templateVersionId, @inspectorId, SYSUTCDATETIME(), SYSUTCDATETIME(), @result, @action,
              @action, 'COMPLETED', @inspectorId, @inspectorId
            )
          `);

        const childId = insertRes.recordset[0].id;

        for (const [itemIdStr, ans] of Object.entries(input.answers)) {
          const itemId = Number(itemIdStr);
          const itemRes = await new sql.Request(transaction)
            .input("unitInspectionId", sql.UniqueIdentifier, childId)
            .input("itemId", sql.Int, itemId)
            .input("status", sql.VarChar(10), ans.status ?? "NORMAL")
            .input("remark", sql.NVarChar(500), ans.remark ?? null)
            .input("inspectorId", sql.BigInt, Number(inspectorId))
            .query(`
              INSERT INTO dbo.item_results (
                unit_inspection_id, item_id, status, remark, created_by, updated_by
              )
              OUTPUT INSERTED.id
              VALUES (
                @unitInspectionId, @itemId, @status, @remark, @inspectorId, @inspectorId
              )
            `);

          const itemResultId = itemRes.recordset[0].id;

          if (ans.fixes && ans.fixes.length > 0) {
            for (const fix of ans.fixes) {
              await new sql.Request(transaction)
                .input("itemResultId", sql.UniqueIdentifier, itemResultId)
                .input("defectId", sql.Int, Number(fix.defectId))
                .input("disposition", sql.VarChar(10), "REWORK")
                .input("severity", sql.VarChar(8), "MAJOR")
                .input("fixNote", sql.NVarChar(500), fix.fixNote ?? fix.fixMethod)
                .input("inspectorId", sql.BigInt, Number(inspectorId))
                .query(`
                  INSERT INTO dbo.item_defect_results (
                    item_result_id, defect_id, disposition_applied, severity, fix_note, created_by, updated_by
                  )
                  VALUES (
                    @itemResultId, @defectId, @disposition, @severity, @fixNote, @inspectorId, @inspectorId
                  )
                `);
            }
          }

          if (ans.photos && ans.photos.length > 0) {
            for (const ph of ans.photos) {
              await new sql.Request(transaction)
                .input("ownerId", sql.UniqueIdentifier, itemResultId)
                .input("storageKey", sql.NVarChar(sql.MAX), ph.uri)
                .input("phash", sql.VarChar(64), ph.pHash ?? null)
                .input("inspectorId", sql.BigInt, Number(inspectorId))
                .query(`
                  INSERT INTO dbo.media (
                    owner_type, owner_id, kind, storage_key, mime, phash, created_by, updated_by
                  )
                  VALUES (
                    'INSPECTION_ITEM', @ownerId, 'PHOTO', @storageKey, 'image/jpeg', @phash, @inspectorId, @inspectorId
                  )
                `);
            }
          }

          if (ans.video) {
            await new sql.Request(transaction)
              .input("ownerId", sql.UniqueIdentifier, itemResultId)
              .input("storageKey", sql.NVarChar(sql.MAX), ans.video.uri)
              .input("inspectorId", sql.BigInt, Number(inspectorId))
              .query(`
                INSERT INTO dbo.media (
                  owner_type, owner_id, kind, storage_key, mime, created_by, updated_by
                )
                VALUES (
                  'INSPECTION_ITEM', @ownerId, 'VIDEO', @storageKey, 'video/mp4', @inspectorId, @inspectorId
                )
              `);
          }
        }

        await transaction.commit();

        return {
          kind: "saved",
          inspection: {
            id: String(childId),
            planId: Number(parent.plan_id),
            workOrderId: parent.work_order_id,
            role: parent.role,
            cycleNo: parent.cycle_no,
            roundNo: nextRoundNo,
            inspectionNo: parent.inspection_no,
            serialPump: parent.serial_pump,
            serialMotor: parent.serial_motor,
            serialSupplier: parent.serial_supplier,
            serialEntryMode: parent.serial_entry_mode,
            entryMode: parent.entry_mode,
            inspectorId,
            startedAt: new Date(),
            submittedAt: new Date(),
            result,
            action,
            suggestedAction: action,
            parentInspectionId: parent.id,
            status: "COMPLETED",
          },
          qtyDone: 1,
          qtyNeed: 10,
        };
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    },

    async getPlanInspectionSummary(planId: number): Promise<PlanInspectionSummary> {
      const pool = await getPool();
      const res = await pool
        .request()
        .input("planId", sql.BigInt, planId)
        .query(`
          SELECT
            COUNT(CASE WHEN ui.result = 'PASS' THEN 1 END) AS pass_count,
            COUNT(CASE WHEN ui.result = 'NOT_PASSED' AND ui.action = 'REWORK' AND NOT EXISTS (
              SELECT 1 FROM dbo.unit_inspections child
               WHERE child.parent_inspection_id = ui.id AND child.status <> 'CANCELLED'
            ) THEN 1 END) AS rework_count,
            COUNT(CASE WHEN ui.result = 'NOT_PASSED' AND ui.action = 'REJECT' THEN 1 END) AS reject_count,
            COUNT(CASE WHEN ui.status = 'IN_PROGRESS' THEN 1 END) AS in_progress_count
          FROM dbo.unit_inspections ui
          WHERE ui.plan_id = @planId AND ui.status <> 'CANCELLED'
        `);

      const row = res.recordset[0] ?? {};
      return {
        passCount: Number(row.pass_count ?? 0),
        reworkCount: Number(row.rework_count ?? 0),
        rejectCount: Number(row.reject_count ?? 0),
        inProgressCount: Number(row.in_progress_count ?? 0),
      };
    },

    async getPlanInspections(planId: number): Promise<PlanUnitInspectionItem[]> {
      const pool = await getPool();
      const res = await pool
        .request()
        .input("planId", sql.BigInt, planId)
        .query(`
          SELECT
            CAST(ui.id AS VARCHAR(36)) AS id,
            CAST(ui.work_order_id AS VARCHAR(36)) AS work_order_id,
            COALESCE(w.wo_no, '') AS wo_no,
            ui.role,
            ui.cycle_no,
            ui.round_no,
            ui.inspection_no,
            ui.serial_pump,
            ui.serial_motor,
            ui.serial_supplier,
            ui.result,
            ui.action AS failure_decision,
            CAST(ui.inspector_id AS VARCHAR(36)) AS inspector_id,
            COALESCE(u.full_name, u.employee_code, 'ผู้ตรวจ') AS inspector_name,
            CONVERT(VARCHAR(33), ui.started_at, 126) AS started_at,
            CONVERT(VARCHAR(33), ui.submitted_at, 126) AS submitted_at,
            ui.status,
            (
              SELECT COUNT(DISTINCT ir.item_id)
                FROM dbo.item_results ir
               WHERE ir.unit_inspection_id = ui.id AND ir.status = 'FAIL'
            ) AS failed_count,
            (
              SELECT STRING_AGG(d.name_th, N', ')
                FROM dbo.item_results ir
                JOIN dbo.item_defect_results idr ON idr.item_result_id = ir.id
                JOIN dbo.defects d ON d.id = idr.defect_id
               WHERE ir.unit_inspection_id = ui.id
            ) AS defect_names
          FROM dbo.unit_inspections ui
          LEFT JOIN dbo.work_orders w ON w.id = ui.work_order_id
          LEFT JOIN dbo.users u ON u.id = ui.inspector_id
          WHERE ui.plan_id = @planId AND ui.status <> 'CANCELLED'
          ORDER BY ui.round_no DESC, ui.inspection_no ASC, ui.started_at DESC
        `);

      return res.recordset.map((row) => ({
        id: String(row.id),
        workOrderId: String(row.work_order_id),
        woNo: String(row.wo_no ?? ""),
        role: row.role as InspectionRole,
        cycleNo: Number(row.cycle_no ?? 1),
        roundNo: Number(row.round_no ?? 1),
        inspectionNo: Number(row.inspection_no ?? 1),
        serialPump: row.serial_pump ? String(row.serial_pump) : null,
        serialMotor: row.serial_motor ? String(row.serial_motor) : null,
        serialSupplier: row.serial_supplier ? String(row.serial_supplier) : null,
        result: row.result ? (row.result as "PASS" | "NOT_PASSED") : null,
        failureDecision: row.failure_decision ? (row.failure_decision as "REWORK" | "REJECT" | "CHOOSE") : null,
        inspectorId: String(row.inspector_id),
        inspectorName: String(row.inspector_name),
        startedAt: String(row.started_at),
        submittedAt: row.submitted_at ? String(row.submitted_at) : null,
        status: row.status as "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
        failedItemCount: Number(row.failed_count ?? 0),
        defectNames: row.defect_names ? String(row.defect_names) : null,
      }));
    },
  };
}
