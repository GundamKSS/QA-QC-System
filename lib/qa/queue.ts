import "server-only";
import { getPool, sql } from "@/lib/db/pool";
import { QA_INSPECTORS_SQL } from "@/lib/db/plans";
import type { Inspector } from "@/lib/plans/store";
import {
  AQL_LEVEL_LABELS,
  AQL_LEVEL_SHORT_LABELS,
  calculateAqlSample,
  isValidAqlLevel,
  STANDARD_AQL_TABLE,
  type AqlLevel,
  type AqlRuleRow,
} from "./aql";

export type QaAssigneeProgress = {
  slot: number;
  userId: string;
  name: string;
  code: string;
  targetQty: number | null;
  doneQty: number;
  passedQty: number;
  reworkPending: number;
  rejectedQty: number;
  drafts: { inspectionId: string; serialPump: string }[];
};

export type QaFailedUnitItem = {
  inspectionId: string;
  serialPump: string;
  roundNo: number;
  role: "QC" | "QA";
  action: "REWORK" | "REJECT" | null;
  status: string;
  inspectorId: string;
  inspectorName: string;
  failedItemCount: number;
  defectNames: string | null;
  submittedAt: string | null;
};

export type QaQueueItem = {
  id: number;
  planNo: string;
  status: string;
  modelId: number;
  modelCode: string;
  modelDescription: string | null;
  pumpType: string | null;
  brandName: string;
  vendorName: string | null;
  lotQty: number;
  lotCalledTotal: number;
  qcRequired: number;
  qcDoneTotal: number;
  qcWorkOrderCount: number;
  qcWorkOrderNos: string[];
  aqlLevel: AqlLevel | null;
  aqlLevelLabel: string | null;
  aqlCodeLetter: string | null;
  aqlSampleSize: number | null;
  aqlAc: number | null;
  aqlRe: number | null;
  hasAql: boolean;
  qaRequired: number;
  qaDoneTotal: number;
  qaPassedTotal: number;
  qaReworkPending: number;
  qaRejectedTotal: number;
  qaWorkOrderId: string | null;
  qaWorkOrderNo: string | null;
  qaWorkOrderStatus: string | null;
  qaPending: boolean;
  qaAcceptedAt: string | null;
  qaAcceptedByName: string | null;
  qaConfirmedAt: string | null;
  qaConfirmedByName: string | null;
  assignees: QaAssigneeProgress[];
  failedUnits: QaFailedUnitItem[];
  docNo: string;
  docType: string;
  qcCompletedAt: string | null;
  openedAt: string;
};

export type QaQueuePayload = {
  queue: QaQueueItem[];
  inspectors: Inspector[];
  me: string | null;
  isHead: boolean;
  pendingCount: number;
  inProgressCount: number;
  readyToConfirmCount: number;
  reworkCount: number;
  completedTodayCount: number;
  missingAqlCount: number;
};

async function loadActiveAqlRules(pool: sql.ConnectionPool): Promise<readonly AqlRuleRow[]> {
  try {
    const res = await pool.request().query(`
      SELECT level, lot_min, lot_max, code_letter, sample_size, ac, re
        FROM dbo.aql_table
       WHERE is_active = 1
       ORDER BY level, lot_min
    `);
    if (res.recordset.length === 0) return STANDARD_AQL_TABLE;
    return res.recordset
      .filter((r) => isValidAqlLevel(r.level))
      .map((r) => ({
        level: r.level as AqlLevel,
        lotMin: Number(r.lot_min),
        lotMax: Number(r.lot_max),
        codeLetter: String(r.code_letter),
        sampleSize: Number(r.sample_size),
        ac: Number(r.ac ?? 0),
        re: Number(r.re ?? 1),
      }));
  } catch {
    return STANDARD_AQL_TABLE;
  }
}

/**
 * Ensures that a plan in QA_PENDING / QA_IN_PROGRESS with a valid AQL level has:
 * 1. `plans.aql_level` and `plans.qa_required` synced with the AQL table (calculated from `plans.lot_qty`)
 * 2. A QA work order (`work_orders.type = 'QA'`, `<plan_no>-QA`) created with `qty_need = qa_required`
 */
async function syncQaWorkOrderAndPlanAql(
  pool: sql.ConnectionPool,
  input: {
    planId: number;
    planNo: string;
    lotQty: number;
    aqlLevel: AqlLevel;
    qaRequired: number;
    currentPlanAql: string | null;
    currentPlanQaRequired: number | null;
    qaWorkOrderId: string | null;
    qaWorkOrderNeed: number | null;
  },
): Promise<{ qaWorkOrderId: string; qaWorkOrderNo: string; qaWorkOrderStatus: string }> {
  const woNo = `${input.planNo}-QA`;

  if (
    input.currentPlanAql !== input.aqlLevel ||
    input.currentPlanQaRequired !== input.qaRequired
  ) {
    await pool
      .request()
      .input("planId", sql.BigInt, input.planId)
      .input("aqlLevel", sql.VarChar(10), input.aqlLevel)
      .input("qaRequired", sql.Int, input.qaRequired)
      .query(`
        UPDATE dbo.plans
           SET aql_level = @aqlLevel,
               qa_required = @qaRequired,
               updated_at = SYSUTCDATETIME()
         WHERE id = @planId
      `);
  }

  if (!input.qaWorkOrderId) {
    const insertRes = await pool
      .request()
      .input("planId", sql.BigInt, input.planId)
      .input("woNo", sql.VarChar(24), woNo)
      .input("lotQty", sql.Int, input.lotQty)
      .input("qaRequired", sql.Int, input.qaRequired)
      .query<{ id: string; wo_no: string; status: string }>(`
        DECLARE @existing_id UNIQUEIDENTIFIER, @existing_no VARCHAR(24), @existing_status VARCHAR(16);
        SELECT TOP (1)
               @existing_id = id,
               @existing_no = wo_no,
               @existing_status = status
          FROM dbo.work_orders
         WHERE plan_id = @planId AND type = 'QA' AND status <> 'CANCELLED';

        IF @existing_id IS NULL
        BEGIN
            DECLARE @next_seq INT;
            SELECT @next_seq = ISNULL(MAX(seq), 0) + 1 FROM dbo.work_orders WHERE plan_id = @planId;
            INSERT INTO dbo.work_orders (plan_id, seq, wo_no, type, called_qty, called_date, qty_need, qty_done, status, remarks)
            OUTPUT CAST(INSERTED.id AS VARCHAR(36)) AS id, INSERTED.wo_no, INSERTED.status
            VALUES (
              @planId,
              @next_seq,
              @woNo,
              'QA',
              @lotQty,
              CONVERT(DATE, DATEADD(HOUR, 7, SYSUTCDATETIME())),
              @qaRequired,
              (SELECT COUNT(*) FROM dbo.unit_inspections WHERE plan_id = @planId AND role = 'QA' AND status = 'COMPLETED' AND parent_inspection_id IS NULL),
              'IN_PROGRESS',
              N'ใบงานสุ่มตรวจ QA ตามเกณฑ์ AQL'
            );
        END
        ELSE
        BEGIN
            SELECT CAST(@existing_id AS VARCHAR(36)) AS id, @existing_no AS wo_no, @existing_status AS status;
        END
      `);

    const row = insertRes.recordset[0];
    return {
      qaWorkOrderId: row.id,
      qaWorkOrderNo: row.wo_no,
      qaWorkOrderStatus: row.status,
    };
  }

  if (input.qaWorkOrderNeed !== input.qaRequired) {
    await pool
      .request()
      .input("woId", sql.UniqueIdentifier, input.qaWorkOrderId)
      .input("qaRequired", sql.Int, input.qaRequired)
      .query(`
        UPDATE dbo.work_orders
           SET qty_need = @qaRequired,
               updated_at = SYSUTCDATETIME()
         WHERE id = @woId
      `);
  }

  return {
    qaWorkOrderId: input.qaWorkOrderId,
    qaWorkOrderNo: woNo,
    qaWorkOrderStatus: "IN_PROGRESS",
  };
}

/**
 * Loads lots that are awaiting or actively undergoing QA sampling inspection.
 * Computes `qaRequired` from `plans.lot_qty` against `dbo.aql_table`, loads QA assignees & their per-person progress,
 * and loads any QA failed / rework units.
 */
export async function loadQaQueueData(options?: {
  me?: string | null;
  isHead?: boolean;
}): Promise<QaQueuePayload> {
  const pool = await getPool();
  const aqlRules = await loadActiveAqlRules(pool);
  const me = options?.me ?? null;
  const isHead = options?.isHead ?? true;

  let inspectors: Inspector[] = [];
  try {
    const inspRes = await pool
      .request()
      .query<{
        id: string;
        code: string;
        name: string;
        open_count: number;
        open_units: number;
        open_models: number;
      }>(`${QA_INSPECTORS_SQL} ORDER BY u.full_name`);
    inspectors = inspRes.recordset.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      openWorkOrders: Number(r.open_count ?? 0),
      openUnits: Number(r.open_units ?? 0),
      openModels: Number(r.open_models ?? 0),
    }));
  } catch {
    inspectors = [];
  }

  const res = await pool.request().query(`
    SELECT
      p.id,
      p.plan_no,
      p.status,
      p.model_id,
      m.code AS model_code,
      m.description AS model_desc,
      m.default_aql_level AS model_aql_level,
      p.aql_level AS plan_aql_level,
      pt.name AS pump_type,
      b.name AS brand_name,
      v.name AS vendor_name,
      p.lot_qty,
      p.lot_called_total,
      p.qc_required,
      p.qc_done_total,
      p.qa_required AS plan_qa_required,
      CONVERT(VARCHAR(33), p.qa_accepted_at, 126) AS qa_accepted_at,
      acc_u.full_name AS qa_accepted_by_name,
      CONVERT(VARCHAR(33), p.qa_confirmed_at, 126) AS qa_confirmed_at,
      conf_u.full_name AS qa_confirmed_by_name,
      (
        SELECT COUNT(*)
          FROM dbo.unit_inspections ui
         WHERE ui.plan_id = p.id AND ui.role = 'QA' AND ui.status = 'COMPLETED' AND ui.parent_inspection_id IS NULL
      ) AS qa_done_total,
      (
        SELECT COUNT(*)
          FROM dbo.unit_inspections ui
         WHERE ui.plan_id = p.id
           AND ui.role = 'QA'
           AND ui.status = 'COMPLETED'
           AND ui.result IN ('PASS', 'CONCESSION')
           AND NOT EXISTS (
             SELECT 1 FROM dbo.unit_inspections child
              WHERE child.parent_inspection_id = ui.id AND child.status IN ('COMPLETED', 'IN_PROGRESS')
           )
      ) AS qa_passed_total,
      (
        SELECT COUNT(*)
          FROM dbo.unit_inspections ui
         WHERE ui.plan_id = p.id
           AND ui.status = 'COMPLETED'
           AND ui.result = 'NOT_PASSED'
           AND ui.action = 'REWORK'
           AND NOT EXISTS (
             SELECT 1 FROM dbo.unit_inspections child
              WHERE child.parent_inspection_id = ui.id AND child.status IN ('COMPLETED', 'IN_PROGRESS')
           )
      ) AS qa_rework_pending,
      (
        SELECT COUNT(*)
          FROM dbo.unit_inspections ui
         WHERE ui.plan_id = p.id
           AND ui.role = 'QA'
           AND ui.status = 'COMPLETED'
           AND ui.result = 'NOT_PASSED'
           AND (ui.action IS NULL OR ui.action = 'REJECT')
           AND NOT EXISTS (
             SELECT 1 FROM dbo.unit_inspections child
              WHERE child.parent_inspection_id = ui.id AND child.status IN ('COMPLETED', 'IN_PROGRESS')
           )
      ) AS qa_rejected_total,
      (
        SELECT COUNT(*)
          FROM dbo.work_orders w
         WHERE w.plan_id = p.id AND w.type <> 'QA' AND w.status NOT IN ('CANCELLED', 'FAILED')
      ) AS qc_wo_count,
      (
        SELECT STRING_AGG(w.wo_no, ',') WITHIN GROUP (ORDER BY w.seq)
          FROM dbo.work_orders w
         WHERE w.plan_id = p.id AND w.type <> 'QA' AND w.status NOT IN ('CANCELLED', 'FAILED')
      ) AS qc_wo_nos,
      qa_wo.id AS qa_wo_id,
      qa_wo.wo_no AS qa_wo_no,
      qa_wo.status AS qa_wo_status,
      qa_wo.qty_need AS qa_wo_need,
      rd.doc_no,
      rd.doc_type,
      CONVERT(VARCHAR(33), p.created_at, 126) AS opened_at,
      CONVERT(VARCHAR(33), (
        SELECT TOP (1) psh.at
          FROM dbo.plan_status_history psh
         WHERE psh.plan_id = p.id AND psh.to_status IN ('QA_PENDING', 'QA_IN_PROGRESS')
         ORDER BY psh.id DESC
      ), 126) AS qc_completed_at
    FROM dbo.plans p
    JOIN dbo.models m ON m.id = p.model_id
    JOIN dbo.brands b ON b.id = m.brand_id
    LEFT JOIN dbo.pump_types pt ON pt.id = m.pump_type_id
    LEFT JOIN dbo.receipt_docs rd ON rd.id = p.receipt_doc_id
    LEFT JOIN dbo.vendors v ON v.id = rd.vendor_id
    LEFT JOIN dbo.users acc_u ON acc_u.id = p.qa_accepted_by
    LEFT JOIN dbo.users conf_u ON conf_u.id = p.qa_confirmed_by
    OUTER APPLY (
      SELECT TOP (1)
             CAST(w.id AS VARCHAR(36)) AS id,
             w.wo_no,
             w.status,
             w.qty_need
        FROM dbo.work_orders w
       WHERE w.plan_id = p.id AND w.type = 'QA' AND w.status <> 'CANCELLED'
       ORDER BY w.seq DESC
    ) qa_wo
    WHERE p.status IN ('QA_PENDING', 'QA_IN_PROGRESS')
       OR (p.status = 'COMPLETED' AND DATEDIFF(day, p.updated_at, SYSUTCDATETIME()) <= 1)
    ORDER BY
      CASE p.status
        WHEN 'QA_IN_PROGRESS' THEN 1
        WHEN 'QA_PENDING' THEN 2
        ELSE 3
      END,
      p.updated_at DESC
  `);

  const queue: QaQueueItem[] = [];
  const qaWoIds: string[] = [];
  const planIds: number[] = [];

  for (const row of res.recordset) {
    const planId = Number(row.id);
    const planNo = String(row.plan_no);
    const lotQty = Number(row.lot_qty ?? 0);
    const rawLevel = row.plan_aql_level ?? row.model_aql_level ?? null;
    const aqlLevel: AqlLevel | null = isValidAqlLevel(rawLevel) ? rawLevel : null;
    const calc = calculateAqlSample(aqlLevel, lotQty, aqlRules);

    let qaWorkOrderId: string | null = row.qa_wo_id ? String(row.qa_wo_id) : null;
    let qaWorkOrderNo: string | null = row.qa_wo_no ? String(row.qa_wo_no) : null;
    let qaWorkOrderStatus: string | null = row.qa_wo_status ? String(row.qa_wo_status) : null;

    if (calc && aqlLevel && row.status !== "CANCELLED") {
      try {
        const synced = await syncQaWorkOrderAndPlanAql(pool, {
          planId,
          planNo,
          lotQty,
          aqlLevel,
          qaRequired: calc.qaRequired,
          currentPlanAql: row.plan_aql_level ? String(row.plan_aql_level) : null,
          currentPlanQaRequired: row.plan_qa_required != null ? Number(row.plan_qa_required) : null,
          qaWorkOrderId,
          qaWorkOrderNeed: row.qa_wo_need != null ? Number(row.qa_wo_need) : null,
        });
        qaWorkOrderId = synced.qaWorkOrderId;
        qaWorkOrderNo = synced.qaWorkOrderNo;
        qaWorkOrderStatus = row.qa_wo_status ? String(row.qa_wo_status) : synced.qaWorkOrderStatus;
      } catch {
        // Keep read resilient if DB write fails
      }
    }

    if (qaWorkOrderId) qaWoIds.push(qaWorkOrderId);
    planIds.push(planId);

    const qcWoNosRaw = row.qc_wo_nos ? String(row.qc_wo_nos) : "";
    const qcWorkOrderNos = qcWoNosRaw ? qcWoNosRaw.split(",").filter(Boolean) : [];

    queue.push({
      id: planId,
      planNo,
      status: String(row.status),
      modelId: Number(row.model_id),
      modelCode: String(row.model_code),
      modelDescription: row.model_desc ? String(row.model_desc) : null,
      pumpType: row.pump_type ? String(row.pump_type) : null,
      brandName: String(row.brand_name),
      vendorName: row.vendor_name ? String(row.vendor_name) : null,
      lotQty,
      lotCalledTotal: Number(row.lot_called_total ?? 0),
      qcRequired: Number(row.qc_required ?? 0),
      qcDoneTotal: Number(row.qc_done_total ?? 0),
      qcWorkOrderCount: Number(row.qc_wo_count ?? qcWorkOrderNos.length),
      qcWorkOrderNos,
      aqlLevel,
      aqlLevelLabel: aqlLevel ? AQL_LEVEL_SHORT_LABELS[aqlLevel] : null,
      aqlCodeLetter: calc?.codeLetter ?? null,
      aqlSampleSize: calc?.sampleSize ?? null,
      aqlAc: calc?.ac ?? null,
      aqlRe: calc?.re ?? null,
      hasAql: Boolean(aqlLevel && calc),
      qaRequired: calc ? calc.qaRequired : 0,
      qaDoneTotal: Number(row.qa_done_total ?? 0),
      qaPassedTotal: Number(row.qa_passed_total ?? 0),
      qaReworkPending: Number(row.qa_rework_pending ?? 0),
      qaRejectedTotal: Number(row.qa_rejected_total ?? 0),
      qaWorkOrderId,
      qaWorkOrderNo,
      qaWorkOrderStatus,
      qaPending: row.status === "QA_PENDING",
      qaAcceptedAt: row.qa_accepted_at ? String(row.qa_accepted_at) : null,
      qaAcceptedByName: row.qa_accepted_by_name ? String(row.qa_accepted_by_name) : null,
      qaConfirmedAt: row.qa_confirmed_at ? String(row.qa_confirmed_at) : null,
      qaConfirmedByName: row.qa_confirmed_by_name ? String(row.qa_confirmed_by_name) : null,
      assignees: [],
      failedUnits: [],
      docNo: String(row.doc_no ?? ""),
      docType: String(row.doc_type ?? ""),
      qcCompletedAt: row.qc_completed_at ? String(row.qc_completed_at) : null,
      openedAt: String(row.opened_at),
    });
  }

  // Load QA assignees and their progress
  if (qaWoIds.length > 0) {
    try {
      const req = pool.request();
      qaWoIds.forEach((id, idx) => req.input(`wo${idx}`, sql.UniqueIdentifier, id));
      const inClause = qaWoIds.map((_, idx) => `@wo${idx}`).join(", ");

      const assigneesRes = await req.query<{
        work_order_id: string;
        slot: number;
        user_id: string;
        full_name: string;
        employee_code: string;
        target_qty: number | null;
        done_qty: number;
        passed_qty: number;
        rework_pending: number;
        rejected_qty: number;
      }>(`
        SELECT
          CAST(a.work_order_id AS VARCHAR(36)) AS work_order_id,
          a.slot,
          CAST(a.user_id AS VARCHAR(20)) AS user_id,
          u.full_name,
          u.employee_code,
          a.target_qty,
          ISNULL(stats.done_qty, 0) AS done_qty,
          ISNULL(stats.passed_qty, 0) AS passed_qty,
          ISNULL(stats.rework_pending, 0) AS rework_pending,
          ISNULL(stats.rejected_qty, 0) AS rejected_qty
        FROM dbo.work_order_assignees a
        JOIN dbo.users u ON u.id = a.user_id
        OUTER APPLY (
          SELECT
            SUM(CASE WHEN ui.parent_inspection_id IS NULL THEN 1 ELSE 0 END) AS done_qty,
            SUM(CASE WHEN lf.is_leaf = 1 AND ui.result IN ('PASS', 'CONCESSION') THEN 1 ELSE 0 END) AS passed_qty,
            SUM(CASE WHEN lf.is_leaf = 1 AND ui.result = 'NOT_PASSED' AND ui.action = 'REWORK' THEN 1 ELSE 0 END) AS rework_pending,
            SUM(CASE WHEN lf.is_leaf = 1 AND ui.result = 'NOT_PASSED' AND (ui.action IS NULL OR ui.action <> 'REWORK') THEN 1 ELSE 0 END) AS rejected_qty
          FROM dbo.unit_inspections ui
          CROSS APPLY (
            SELECT CASE WHEN EXISTS (
              SELECT 1 FROM dbo.unit_inspections child
               WHERE child.parent_inspection_id = ui.id AND child.status IN ('COMPLETED', 'IN_PROGRESS')
            ) THEN 0 ELSE 1 END AS is_leaf
          ) lf
          WHERE ui.work_order_id = a.work_order_id
            AND ui.inspector_id = a.user_id
            AND ui.status = 'COMPLETED'
        ) stats
        WHERE a.work_order_id IN (${inClause})
        ORDER BY a.work_order_id, a.slot
      `);

      const draftReq = pool.request();
      qaWoIds.forEach((id, idx) => draftReq.input(`wo${idx}`, sql.UniqueIdentifier, id));
      const draftsRes = await draftReq.query<{
        id: string;
        work_order_id: string;
        inspector_id: string;
        serial_pump: string;
      }>(`
        SELECT
          CAST(ui.id AS VARCHAR(36)) AS id,
          CAST(ui.work_order_id AS VARCHAR(36)) AS work_order_id,
          CAST(ui.inspector_id AS VARCHAR(20)) AS inspector_id,
          ui.serial_pump
        FROM dbo.unit_inspections ui
        WHERE ui.work_order_id IN (${inClause})
          AND ui.status = 'IN_PROGRESS'
          AND ui.parent_inspection_id IS NULL
        ORDER BY ui.started_at ASC
      `);

      const byWo = new Map<string, QaAssigneeProgress[]>();
      for (const r of assigneesRes.recordset) {
        const list = byWo.get(r.work_order_id) ?? [];
        list.push({
          slot: Number(r.slot),
          userId: String(r.user_id),
          name: String(r.full_name),
          code: String(r.employee_code),
          targetQty: r.target_qty != null ? Number(r.target_qty) : null,
          doneQty: Number(r.done_qty ?? 0),
          passedQty: Number(r.passed_qty ?? 0),
          reworkPending: Number(r.rework_pending ?? 0),
          rejectedQty: Number(r.rejected_qty ?? 0),
          drafts: [],
        });
        byWo.set(r.work_order_id, list);
      }

      for (const d of draftsRes.recordset) {
        const list = byWo.get(d.work_order_id);
        if (!list) continue;
        const person = list.find((p) => String(p.userId) === String(d.inspector_id));
        if (person) {
          person.drafts.push({ inspectionId: d.id, serialPump: d.serial_pump });
        }
      }

      for (const item of queue) {
        if (item.qaWorkOrderId && byWo.has(item.qaWorkOrderId)) {
          item.assignees = byWo.get(item.qaWorkOrderId) ?? [];
        }
      }
    } catch {
      // Keep resilient
    }
  }

  // Load QA failed / pending rework units for each plan in the queue
  if (planIds.length > 0) {
    try {
      const req = pool.request();
      planIds.forEach((id, idx) => req.input(`p${idx}`, sql.BigInt, id));
      const inClause = planIds.map((_, idx) => `@p${idx}`).join(", ");
      const failedRes = await req.query<{
        id: string;
        plan_id: number;
        serial_pump: string;
        round_no: number;
        role: "QC" | "QA";
        action: "REWORK" | "REJECT" | null;
        status: string;
        inspector_id: string;
        inspector_name: string;
        failed_item_count: number;
        defect_names: string | null;
        submitted_at: string | null;
      }>(`
        SELECT
          CAST(ui.id AS VARCHAR(36)) AS id,
          ui.plan_id,
          ui.serial_pump,
          ui.round_no,
          ui.role,
          ui.action,
          ui.status,
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
          ) AS defect_names,
          CONVERT(VARCHAR(33), ui.submitted_at, 126) AS submitted_at
        FROM dbo.unit_inspections ui
        LEFT JOIN dbo.users u ON u.id = ui.inspector_id
        WHERE ui.plan_id IN (${inClause})
          AND ui.status = 'COMPLETED'
          AND ui.result = 'NOT_PASSED'
          AND NOT EXISTS (
            SELECT 1 FROM dbo.unit_inspections child
             WHERE child.parent_inspection_id = ui.id
               AND child.status IN ('COMPLETED', 'IN_PROGRESS')
          )
        ORDER BY ui.submitted_at DESC
      `);

      const byPlan = new Map<number, QaFailedUnitItem[]>();
      for (const r of failedRes.recordset) {
        const pid = Number(r.plan_id);
        const list = byPlan.get(pid) ?? [];
        list.push({
          inspectionId: String(r.id),
          serialPump: String(r.serial_pump),
          roundNo: Number(r.round_no ?? 1),
          role: r.role,
          action: r.action,
          status: String(r.status),
          inspectorId: String(r.inspector_id),
          inspectorName: String(r.inspector_name),
          failedItemCount: Number(r.failed_item_count ?? 0),
          defectNames: r.defect_names ? String(r.defect_names) : null,
          submittedAt: r.submitted_at ? String(r.submitted_at) : null,
        });
        byPlan.set(pid, list);
      }

      for (const item of queue) {
        item.failedUnits = byPlan.get(item.id) ?? [];
      }
    } catch {
      // Keep resilient
    }
  }

  const pendingCount = queue.filter((item) => item.status === "QA_PENDING").length;
  const inProgressCount = queue.filter((item) => item.status === "QA_IN_PROGRESS").length;
  const readyToConfirmCount = queue.filter(
    (item) =>
      item.status === "QA_IN_PROGRESS" &&
      item.hasAql &&
      item.qaRequired > 0 &&
      item.qaDoneTotal >= item.qaRequired &&
      item.qaReworkPending === 0,
  ).length;
  const reworkCount = queue.reduce((sum, item) => sum + item.failedUnits.length, 0);
  const completedTodayCount = queue.filter((item) => item.status === "COMPLETED").length;
  const missingAqlCount = queue.filter((item) => !item.hasAql && item.status !== "COMPLETED").length;

  return {
    queue,
    inspectors,
    me,
    isHead,
    pendingCount,
    inProgressCount,
    readyToConfirmCount,
    reworkCount,
    completedTodayCount,
    missingAqlCount,
  };
}

export type UpdatePlanAndModelAqlInput = {
  planId: number;
  aqlLevel: AqlLevel;
  saveAsModelDefault?: boolean;
  actorId: string | null;
};

export type UpdatePlanAndModelAqlOutcome =
  | {
      kind: "updated";
      planId: number;
      planNo: string;
      modelId: number;
      modelCode: string;
      aqlLevel: AqlLevel;
      aqlLevelLabel: string;
      codeLetter: string;
      qaRequired: number;
      qaWorkOrderId: string;
      qaWorkOrderNo: string;
    }
  | { kind: "not_found" }
  | { kind: "invalid_level" };

/**
 * Sets or updates the AQL level for a plan (and optionally saves it as `models.default_aql_level`),
 * recalculates `qa_required` from `dbo.aql_table` using `plans.lot_qty`, and creates/updates `<plan_no>-QA`.
 */
export async function updatePlanAndModelAql(
  input: UpdatePlanAndModelAqlInput,
): Promise<UpdatePlanAndModelAqlOutcome> {
  if (!isValidAqlLevel(input.aqlLevel)) {
    return { kind: "invalid_level" };
  }

  const pool = await getPool();
  const aqlRules = await loadActiveAqlRules(pool);

  const planRes = await pool
    .request()
    .input("planId", sql.BigInt, input.planId)
    .query<{
      id: number;
      plan_no: string;
      lot_qty: number;
      model_id: number;
      model_code: string;
      qa_wo_id: string | null;
      qa_wo_need: number | null;
    }>(`
      SELECT p.id, p.plan_no, p.lot_qty, p.model_id, m.code AS model_code,
             (SELECT TOP 1 CAST(w.id AS VARCHAR(36)) FROM dbo.work_orders w WHERE w.plan_id = p.id AND w.type = 'QA' AND w.status <> 'CANCELLED' ORDER BY w.seq DESC) AS qa_wo_id,
             (SELECT TOP 1 w.qty_need FROM dbo.work_orders w WHERE w.plan_id = p.id AND w.type = 'QA' AND w.status <> 'CANCELLED' ORDER BY w.seq DESC) AS qa_wo_need
        FROM dbo.plans p
        JOIN dbo.models m ON m.id = p.model_id
       WHERE p.id = @planId
    `);

  if (planRes.recordset.length === 0) {
    return { kind: "not_found" };
  }

  const row = planRes.recordset[0];
  const lotQty = Number(row.lot_qty);
  const calc = calculateAqlSample(input.aqlLevel, lotQty, aqlRules);
  if (!calc) {
    return { kind: "invalid_level" };
  }

  if (input.saveAsModelDefault !== false) {
    await pool
      .request()
      .input("modelId", sql.Int, row.model_id)
      .input("aqlLevel", sql.VarChar(10), input.aqlLevel)
      .input("by", sql.BigInt, input.actorId ? Number(input.actorId) : null)
      .query(`
        UPDATE dbo.models
           SET default_aql_level = @aqlLevel,
               updated_at = SYSUTCDATETIME(),
               updated_by = COALESCE(@by, updated_by)
         WHERE id = @modelId
      `);
  }

  const synced = await syncQaWorkOrderAndPlanAql(pool, {
    planId: Number(row.id),
    planNo: String(row.plan_no),
    lotQty,
    aqlLevel: input.aqlLevel,
    qaRequired: calc.qaRequired,
    currentPlanAql: null,
    currentPlanQaRequired: null,
    qaWorkOrderId: row.qa_wo_id ? String(row.qa_wo_id) : null,
    qaWorkOrderNeed: row.qa_wo_need != null ? Number(row.qa_wo_need) : null,
  });

  return {
    kind: "updated",
    planId: Number(row.id),
    planNo: String(row.plan_no),
    modelId: Number(row.model_id),
    modelCode: String(row.model_code),
    aqlLevel: input.aqlLevel,
    aqlLevelLabel: AQL_LEVEL_LABELS[input.aqlLevel],
    codeLetter: calc.codeLetter,
    qaRequired: calc.qaRequired,
    qaWorkOrderId: synced.qaWorkOrderId,
    qaWorkOrderNo: synced.qaWorkOrderNo,
  };
}

export type AcceptQaPlanOutcome =
  | {
      kind: "accepted";
      planId: number;
      planNo: string;
      status: "QA_IN_PROGRESS";
      qaWorkOrderId: string | null;
      qaWorkOrderNo: string;
    }
  | { kind: "not_found" }
  | { kind: "invalid_status"; status: string };

/**
 * Step 1: Head QA accepts the handed-over plan from QC (`QA_PENDING` -> `QA_IN_PROGRESS`),
 * recording `qa_accepted_by` and `qa_accepted_at` and writing to `dbo.plan_status_history`
 * so Head QC sees that QA has accepted the work.
 */
export async function acceptQaPlan(input: {
  planId: number;
  actorId: string | null;
  actorName: string;
}): Promise<AcceptQaPlanOutcome> {
  const pool = await getPool();
  const actorNum = input.actorId && /^\d+$/.test(input.actorId) ? Number(input.actorId) : null;

  const planRes = await pool
    .request()
    .input("planId", sql.BigInt, input.planId)
    .query<{
      id: number;
      plan_no: string;
      status: string;
      lot_qty: number;
      qa_required: number | null;
      qa_wo_id: string | null;
    }>(`
      SELECT p.id, p.plan_no, p.status, p.lot_qty, p.qa_required,
             (SELECT TOP 1 CAST(w.id AS VARCHAR(36)) FROM dbo.work_orders w WHERE w.plan_id = p.id AND w.type = 'QA' AND w.status <> 'CANCELLED' ORDER BY w.seq DESC) AS qa_wo_id
        FROM dbo.plans p
       WHERE p.id = @planId
    `);

  if (planRes.recordset.length === 0) return { kind: "not_found" };
  const row = planRes.recordset[0];
  if (row.status !== "QA_PENDING" && row.status !== "QA_IN_PROGRESS") {
    return { kind: "invalid_status", status: row.status };
  }

  const reason = `ฝ่าย QA รับงานแล้ว (โดย ${input.actorName})`;
  await pool
    .request()
    .input("planId", sql.BigInt, input.planId)
    .input("fromStatus", sql.VarChar(16), row.status)
    .input("by", sql.BigInt, actorNum)
    .input("reason", sql.NVarChar(400), reason)
    .query(`
      UPDATE dbo.plans
         SET status = 'QA_IN_PROGRESS',
             qa_accepted_by = COALESCE(qa_accepted_by, @by),
             qa_accepted_at = COALESCE(qa_accepted_at, SYSUTCDATETIME()),
             updated_at = SYSUTCDATETIME(),
             updated_by = COALESCE(@by, updated_by)
       WHERE id = @planId;

      IF @fromStatus <> 'QA_IN_PROGRESS'
      BEGIN
          INSERT INTO dbo.plan_status_history (plan_id, from_status, to_status, by_user_id, reason)
          VALUES (@planId, @fromStatus, 'QA_IN_PROGRESS', @by, @reason);
      END
    `);

  return {
    kind: "accepted",
    planId: Number(row.id),
    planNo: String(row.plan_no),
    status: "QA_IN_PROGRESS",
    qaWorkOrderId: row.qa_wo_id ? String(row.qa_wo_id) : null,
    qaWorkOrderNo: `${row.plan_no}-QA`,
  };
}

export type AssignQaInspectorsInput = {
  planId: number;
  assignees: readonly { userId: string; targetQty: number | null }[];
  actorId: string | null;
  actorName: string;
};

export type AssignQaInspectorsOutcome =
  | {
      kind: "assigned";
      planId: number;
      planNo: string;
      qaWorkOrderId: string;
      qaWorkOrderNo: string;
      assigneeIds: string[];
    }
  | { kind: "not_found" }
  | { kind: "missing_aql" }
  | { kind: "invalid_assignees"; message: string };

/**
 * Step 2: Head QA assigns 1..5 QA inspectors (with per-inspector target quantities) to the plan's QA work order.
 * Also marks the plan as accepted (`QA_IN_PROGRESS`) if it was still in `QA_PENDING`.
 */
export async function assignQaInspectors(
  input: AssignQaInspectorsInput,
): Promise<AssignQaInspectorsOutcome> {
  const clean = input.assignees.filter((a) => a.userId && /^\d+$/.test(String(a.userId).trim()));
  if (clean.length === 0) {
    return { kind: "invalid_assignees", message: "กรุณาเลือกผู้ตรวจ QA อย่างน้อย 1 คน" };
  }
  if (clean.length > 5) {
    return { kind: "invalid_assignees", message: "เลือกผู้ตรวจ QA ได้ไม่เกิน 5 คน" };
  }
  const uniqueIds = new Set(clean.map((a) => String(a.userId).trim()));
  if (uniqueIds.size !== clean.length) {
    return { kind: "invalid_assignees", message: "ห้ามเลือกผู้ตรวจซ้ำคนเดียวกัน" };
  }

  const pool = await getPool();
  const aqlRules = await loadActiveAqlRules(pool);
  const actorNum = input.actorId && /^\d+$/.test(input.actorId) ? Number(input.actorId) : null;

  // Verify every chosen user is an active QA_INSPECTOR
  const checkReq = pool.request();
  const checkIds = clean.map((a) => Number(a.userId));
  checkIds.forEach((uid, idx) => checkReq.input(`u${idx}`, sql.BigInt, uid));
  const validInspectorsRes = await checkReq.query<{ id: string }>(`
    SELECT CAST(u.id AS VARCHAR(20)) AS id
      FROM dbo.users u
     WHERE u.is_active = 1
       AND u.id IN (${checkIds.map((_, idx) => `@u${idx}`).join(", ")})
       AND EXISTS (
         SELECT 1 FROM dbo.user_roles r
          WHERE r.user_id = u.id AND r.role = 'QA_INSPECTOR'
       )
  `);
  const validSet = new Set(validInspectorsRes.recordset.map((r) => String(r.id)));
  if (clean.some((a) => !validSet.has(String(a.userId).trim()))) {
    return {
      kind: "invalid_assignees",
      message: "สามารถจ่ายงานให้ได้เฉพาะผู้ตรวจที่มีบทบาท QA Inspector ที่ยังเปิดใช้งานอยู่เท่านั้น",
    };
  }

  const planRes = await pool
    .request()
    .input("planId", sql.BigInt, input.planId)
    .query<{
      id: number;
      plan_no: string;
      status: string;
      lot_qty: number;
      plan_aql_level: string | null;
      model_aql_level: string | null;
      qa_required: number | null;
      qa_wo_id: string | null;
      qa_wo_need: number | null;
    }>(`
      SELECT p.id, p.plan_no, p.status, p.lot_qty,
             p.aql_level AS plan_aql_level,
             m.default_aql_level AS model_aql_level,
             p.qa_required,
             (SELECT TOP 1 CAST(w.id AS VARCHAR(36)) FROM dbo.work_orders w WHERE w.plan_id = p.id AND w.type = 'QA' AND w.status <> 'CANCELLED' ORDER BY w.seq DESC) AS qa_wo_id,
             (SELECT TOP 1 w.qty_need FROM dbo.work_orders w WHERE w.plan_id = p.id AND w.type = 'QA' AND w.status <> 'CANCELLED' ORDER BY w.seq DESC) AS qa_wo_need
        FROM dbo.plans p
        JOIN dbo.models m ON m.id = p.model_id
       WHERE p.id = @planId
    `);

  if (planRes.recordset.length === 0) return { kind: "not_found" };
  const row = planRes.recordset[0];
  const lotQty = Number(row.lot_qty);
  const rawLevel = row.plan_aql_level ?? row.model_aql_level ?? null;
  const aqlLevel: AqlLevel | null = isValidAqlLevel(rawLevel) ? rawLevel : null;
  const calc = calculateAqlSample(aqlLevel, lotQty, aqlRules);
  if (!aqlLevel || !calc) {
    return { kind: "missing_aql" };
  }

  const hasTargets = clean.some((a) => a.targetQty !== null && a.targetQty !== undefined);
  if (hasTargets) {
    for (const a of clean) {
      if (a.targetQty === null || !Number.isInteger(a.targetQty) || a.targetQty < 1) {
        return { kind: "invalid_assignees", message: "กรุณาระบุจำนวนเครื่องที่มอบหมายให้ครบทุกคน (ตั้งแต่ 1 เครื่องขึ้นไป)" };
      }
    }
    const sum = clean.reduce((acc, a) => acc + (a.targetQty ?? 0), 0);
    if (sum !== calc.qaRequired) {
      return {
        kind: "invalid_assignees",
        message: `ยอดรวมที่จ่ายให้ผู้ตรวจ (${sum} เครื่อง) ต้องตรงกับยอดสุ่มตรวจ AQL (${calc.qaRequired} เครื่อง)`,
      };
    }
  }

  const synced = await syncQaWorkOrderAndPlanAql(pool, {
    planId: Number(row.id),
    planNo: String(row.plan_no),
    lotQty,
    aqlLevel,
    qaRequired: calc.qaRequired,
    currentPlanAql: row.plan_aql_level,
    currentPlanQaRequired: row.qa_required,
    qaWorkOrderId: row.qa_wo_id,
    qaWorkOrderNeed: row.qa_wo_need,
  });

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input("woId", sql.UniqueIdentifier, synced.qaWorkOrderId)
      .query("DELETE FROM dbo.work_order_assignees WHERE work_order_id = @woId");

    for (let i = 0; i < clean.length; i++) {
      const item = clean[i];
      await new sql.Request(tx)
        .input("woId", sql.UniqueIdentifier, synced.qaWorkOrderId)
        .input("userId", sql.BigInt, Number(item.userId))
        .input("slot", sql.TinyInt, i + 1)
        .input("targetQty", sql.Int, item.targetQty)
        .input("by", sql.BigInt, actorNum)
        .query(`
          INSERT INTO dbo.work_order_assignees (work_order_id, user_id, slot, target_qty, assigned_by)
          VALUES (@woId, @userId, @slot, @targetQty, @by)
        `);
    }

    const reason = `ฝ่าย QA รับงานและจ่ายงานผู้ตรวจ ${clean.length} คน (โดย ${input.actorName})`;
    await new sql.Request(tx)
      .input("planId", sql.BigInt, input.planId)
      .input("fromStatus", sql.VarChar(16), row.status)
      .input("by", sql.BigInt, actorNum)
      .input("reason", sql.NVarChar(400), reason)
      .query(`
        UPDATE dbo.plans
           SET status = CASE WHEN status = 'QA_PENDING' THEN 'QA_IN_PROGRESS' ELSE status END,
               qa_accepted_by = COALESCE(qa_accepted_by, @by),
               qa_accepted_at = COALESCE(qa_accepted_at, SYSUTCDATETIME()),
               updated_at = SYSUTCDATETIME(),
               updated_by = COALESCE(@by, updated_by)
         WHERE id = @planId;

        IF @fromStatus = 'QA_PENDING'
        BEGIN
            INSERT INTO dbo.plan_status_history (plan_id, from_status, to_status, by_user_id, reason)
            VALUES (@planId, 'QA_PENDING', 'QA_IN_PROGRESS', @by, @reason);
        END
      `);

    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }

  return {
    kind: "assigned",
    planId: Number(row.id),
    planNo: String(row.plan_no),
    qaWorkOrderId: synced.qaWorkOrderId,
    qaWorkOrderNo: synced.qaWorkOrderNo,
    assigneeIds: clean.map((a) => String(a.userId)),
  };
}

export type ConfirmQaPlanOutcome =
  | {
      kind: "confirmed";
      planId: number;
      planNo: string;
      qaDoneTotal: number;
      qaRequired: number;
    }
  | { kind: "not_found" }
  | { kind: "quota_not_met"; qaDone: number; qaRequired: number }
  | { kind: "rework_pending"; reworkCount: number }
  | { kind: "invalid_status"; status: string };

/**
 * Step 5: Head QA reviews the completed QA sampling results and confirms/signs off to close the plan (`COMPLETED`).
 */
export async function confirmQaPlan(input: {
  planId: number;
  remarks: string | null;
  actorId: string | null;
  actorName: string;
}): Promise<ConfirmQaPlanOutcome> {
  const pool = await getPool();
  const actorNum = input.actorId && /^\d+$/.test(input.actorId) ? Number(input.actorId) : null;

  const planRes = await pool
    .request()
    .input("planId", sql.BigInt, input.planId)
    .query<{
      id: number;
      plan_no: string;
      status: string;
      qa_required: number | null;
      qa_done: number;
      rework_count: number;
    }>(`
      SELECT
        p.id,
        p.plan_no,
        p.status,
        COALESCE(p.qa_required, (SELECT TOP 1 qty_need FROM dbo.work_orders WHERE plan_id = p.id AND type = 'QA' AND status <> 'CANCELLED'), 0) AS qa_required,
        (
          SELECT COUNT(*)
            FROM dbo.unit_inspections ui
           WHERE ui.plan_id = p.id AND ui.role = 'QA' AND ui.status = 'COMPLETED' AND ui.parent_inspection_id IS NULL
        ) AS qa_done,
        (
          SELECT COUNT(*)
            FROM dbo.unit_inspections ui
           WHERE ui.plan_id = p.id
             AND ui.status = 'COMPLETED'
             AND ui.result = 'NOT_PASSED'
             AND ui.action = 'REWORK'
             AND NOT EXISTS (
               SELECT 1 FROM dbo.unit_inspections child
                WHERE child.parent_inspection_id = ui.id
                  AND child.status IN ('COMPLETED', 'IN_PROGRESS')
             )
        ) AS rework_count
      FROM dbo.plans p
      WHERE p.id = @planId
    `);

  if (planRes.recordset.length === 0) return { kind: "not_found" };
  const row = planRes.recordset[0];

  if (row.status !== "QA_IN_PROGRESS" && row.status !== "QA_PENDING") {
    return { kind: "invalid_status", status: row.status };
  }

  const qaRequired = Number(row.qa_required ?? 0);
  const qaDone = Number(row.qa_done ?? 0);
  const reworkCount = Number(row.rework_count ?? 0);

  if (qaRequired <= 0 || qaDone < qaRequired) {
    return { kind: "quota_not_met", qaDone, qaRequired };
  }
  if (reworkCount > 0) {
    return { kind: "rework_pending", reworkCount };
  }

  const reason = input.remarks
    ? `Head QA ยืนยันผลการสุ่มตรวจ (${qaDone}/${qaRequired} เครื่อง): ${input.remarks}`
    : `Head QA ยืนยันผลการสุ่มตรวจเรียบร้อย (${qaDone}/${qaRequired} เครื่อง)`;

  await pool
    .request()
    .input("planId", sql.BigInt, input.planId)
    .input("fromStatus", sql.VarChar(16), row.status)
    .input("by", sql.BigInt, actorNum)
    .input("reason", sql.NVarChar(400), reason)
    .query(`
      UPDATE dbo.work_orders
         SET status = 'CLOSED',
             updated_at = SYSUTCDATETIME(),
             updated_by = COALESCE(@by, updated_by)
       WHERE plan_id = @planId AND type = 'QA' AND status <> 'CANCELLED';

      UPDATE dbo.plans
         SET status = 'COMPLETED',
             qa_confirmed_by = @by,
             qa_confirmed_at = SYSUTCDATETIME(),
             updated_at = SYSUTCDATETIME(),
             updated_by = COALESCE(@by, updated_by)
       WHERE id = @planId;

      INSERT INTO dbo.plan_status_history (plan_id, from_status, to_status, by_user_id, reason)
      VALUES (@planId, @fromStatus, 'COMPLETED', @by, @reason);
    `);

  return {
    kind: "confirmed",
    planId: Number(row.id),
    planNo: String(row.plan_no),
    qaDoneTotal: qaDone,
    qaRequired,
  };
}

export type ReturnUnitToQcOutcome =
  | { kind: "returned"; inspectionId: string; serialPump: string; planId: number; planNo: string }
  | { kind: "not_found" };

/**
 * Step 6: Converts a QA-failed unit (`result = 'NOT_PASSED'`) to `action = 'REWORK'` (if it was `REJECT`),
 * and optionally assigns it to a specific inspector so QC can fix only the failed items in `/inspections/[id]/rework`.
 */
export async function returnQaUnitToQc(input: {
  inspectionId: string;
  qcInspectorId?: string | null;
  actorId: string | null;
  actorName: string;
}): Promise<ReturnUnitToQcOutcome> {
  const pool = await getPool();
  const actorNum = input.actorId && /^\d+$/.test(input.actorId) ? Number(input.actorId) : null;
  const targetInspector =
    input.qcInspectorId && /^\d+$/.test(input.qcInspectorId) ? Number(input.qcInspectorId) : null;

  const res = await pool
    .request()
    .input("id", sql.UniqueIdentifier, input.inspectionId)
    .input("targetInspector", sql.BigInt, targetInspector)
    .input("by", sql.BigInt, actorNum)
    .query<{ id: string; serial_pump: string; plan_id: number; plan_no: string }>(`
      UPDATE ui
         SET ui.action = 'REWORK',
             ui.inspector_id = COALESCE(@targetInspector, ui.inspector_id),
             ui.updated_at = SYSUTCDATETIME(),
             ui.updated_by = COALESCE(@by, ui.updated_by)
      OUTPUT CAST(INSERTED.id AS VARCHAR(36)) AS id,
             INSERTED.serial_pump,
             INSERTED.plan_id,
             (SELECT plan_no FROM dbo.plans WHERE id = INSERTED.plan_id) AS plan_no
        FROM dbo.unit_inspections ui
       WHERE ui.id = @id AND ui.result = 'NOT_PASSED'
    `);

  if (res.recordset.length === 0) return { kind: "not_found" };
  const row = res.recordset[0];
  return {
    kind: "returned",
    inspectionId: String(row.id),
    serialPump: String(row.serial_pump),
    planId: Number(row.plan_id),
    planNo: String(row.plan_no ?? ""),
  };
}
