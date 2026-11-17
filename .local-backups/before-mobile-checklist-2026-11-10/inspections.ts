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
  InspectionItem,
  InspectionRole,
  SelectedDefect,
  Severity,
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

      // 2. Fetch checklist items
      const itemsRes = await pool
        .request()
        .input("versionId", sql.Int, versionId)
        .query(`
          SELECT id, seq, topic_code, title, input_type, is_required, photo_rule, video_rule, help_text, example_image
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
              await new sql.Request(transaction)
                .input("itemResultId", sql.UniqueIdentifier, itemResultId)
                .input("itemDefectId", sql.Int, d.itemDefectId ?? null)
                .input("defectId", sql.Int, d.defectId)
                .input("disposition", sql.VarChar(10), d.disposition)
                .input("severity", sql.VarChar(8), d.severity)
                .input("causeTag", sql.VarChar(16), d.causeTag ?? null)
                .input("locationNote", sql.NVarChar(200), d.locationNote ?? null)
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
                .input("storageKey", sql.NVarChar(500), ph.uri)
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
              .input("storageKey", sql.NVarChar(500), answer.video.uri)
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
  };
}
