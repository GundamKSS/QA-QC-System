import "server-only";
import { sql, getPool } from "./pool";
import {
  callInError, canOpenWorkOrder, DEADLINE_SOON_DAYS, DEFAULT_QC_DEADLINE_DAYS, DEFAULT_QC_PERCENT, formatWorkOrderNo, minCallIn, PLAN_STATUSES, planWorkOrder, workOrderBlock,
  type PlanStatus, type WorkOrderStatus, type WorkOrderType,
} from "@/lib/plans/rules";
import type {
  DocPlan, DocType, JobCard, ModelInfo, NewPlan, Origin, PlanDetail, PlanListFilter, PlanListRow, PlanStore, PlanSummary, ReceiptDoc, ReceiptDocKey,
  WorkOrder, WorkOrderAssignee,
} from "@/lib/plans/store";

/*
  Dates travel as 'YYYY-MM-DD' strings (CONVERT(..., 23)) and the percent as text: a DateTime2
  parameter failed inside the Next server (see audit-log.ts), so no date/decimal driver types here.
*/

type DocRow = {
  id: string; doc_type: DocType; doc_no: string; doc_no_normalized: string; vendor_id: number | null; vendor_name: string | null; origin: Origin;
  department: string | null; invoice_date: string | null; doc_date: string | null; expected_sku_count: number | null;
  qc_deadline: string | null; remarks: string | null; plan_count: number;
};

const DOC_SELECT = `
  SELECT CAST(d.id AS VARCHAR(20)) AS id, d.doc_type, d.doc_no, d.doc_no_normalized, d.vendor_id, v.name AS vendor_name, d.origin, d.department,
         CONVERT(CHAR(10), d.invoice_date, 23) AS invoice_date, CONVERT(CHAR(10), d.doc_date, 23) AS doc_date, d.expected_sku_count,
         CONVERT(CHAR(10), d.qc_deadline, 23) AS qc_deadline, d.remarks,
         (SELECT COUNT(*) FROM dbo.plans p WHERE p.receipt_doc_id = d.id AND p.status <> 'CANCELLED') AS plan_count
  FROM dbo.receipt_docs d LEFT JOIN dbo.vendors v ON v.id = d.vendor_id`;

const toDoc = (row: DocRow): ReceiptDoc => ({
  id: Number(row.id), docType: row.doc_type, docNo: row.doc_no, docNoNormalized: row.doc_no_normalized, vendorId: row.vendor_id,
  vendorName: row.vendor_name, origin: row.origin, department: row.department, invoiceDate: row.invoice_date, docDate: row.doc_date,
  expectedSkuCount: row.expected_sku_count, qcDeadline: row.qc_deadline, remarks: row.remarks, planCount: Number(row.plan_count),
});

type ModelRow = {
  id: number; code: string; description: string | null; brand_name: string; origin: Origin; is_active: boolean;
  pump_type: string | null; qc_checklist: string | null; qa_checklist: string | null;
};
const toModel = (row: ModelRow): ModelInfo => ({
  id: row.id, code: row.code, description: row.description, brandName: row.brand_name, origin: row.origin, isActive: Boolean(row.is_active),
  pumpType: row.pump_type, qcChecklist: row.qc_checklist, qaChecklist: row.qa_checklist,
});
const MODEL_SELECT = `
  SELECT m.id, m.code, m.description, b.name AS brand_name, m.origin, m.is_active, pt.name AS pump_type, qct.name AS qc_checklist, qat.name AS qa_checklist
    FROM dbo.models m
    JOIN dbo.brands b ON b.id = m.brand_id
    LEFT JOIN dbo.pump_types pt ON pt.id = m.pump_type_id
    LEFT JOIN dbo.checklist_templates qct ON qct.id = m.qc_template_id
    LEFT JOIN dbo.checklist_templates qat ON qat.id = m.qa_template_id`;

const OPEN_PLAN = `
SET XACT_ABORT ON;
DECLARE @doc_id BIGINT, @reused BIT = 1, @dup_id BIGINT, @dup_no VARCHAR(16), @run INT, @plan_id BIGINT, @plan_no VARCHAR(16);

SELECT @doc_id = id FROM dbo.receipt_docs WITH (UPDLOCK, HOLDLOCK)
 WHERE doc_type = @doc_type AND doc_no_normalized = @doc_no_n;

IF @doc_id IS NULL
BEGIN
    SET @reused = 0;
    INSERT INTO dbo.receipt_docs (doc_type, doc_no, doc_no_normalized, vendor_id, origin, department, invoice_date, doc_date,
                                  expected_sku_count, qc_deadline, remarks, created_by, updated_by)
    VALUES (@doc_type, @doc_no, @doc_no_n, @vendor_id, @origin, @department, CONVERT(DATE, @invoice_date, 23), CONVERT(DATE, @doc_date, 23),
            @expected_sku, CONVERT(DATE, @qc_deadline, 23), @doc_remarks, @by, @by);
    SET @doc_id = SCOPE_IDENTITY();
END
ELSE
    SELECT TOP (1) @dup_id = id, @dup_no = plan_no FROM dbo.plans WITH (UPDLOCK, HOLDLOCK)
     WHERE receipt_doc_id = @doc_id AND model_id = @model_id AND status <> 'CANCELLED';

IF @dup_id IS NOT NULL
BEGIN
    SELECT 'duplicate' AS kind, CAST(@dup_id AS VARCHAR(20)) AS plan_id, @dup_no AS plan_no, @reused AS reused;
    RETURN;
END

UPDATE dbo.doc_counters WITH (UPDLOCK, HOLDLOCK)
   SET @run = last_no = last_no + 1, updated_at = SYSUTCDATETIME()
 WHERE counter_key = 'QP' AND period = @period;
IF @run IS NULL
BEGIN
    INSERT INTO dbo.doc_counters (counter_key, period, last_no) VALUES ('QP', @period, 1);
    SET @run = 1;
END
IF @run > 9999
    THROW 51090, 'Plan run number exceeded 9999 this month.', 1;
SET @plan_no = CONCAT('QP-', @period, '-', RIGHT(CONCAT('0000', @run), 4));

INSERT INTO dbo.plans (plan_no, receipt_doc_id, model_id, description, manufacturer, lot_qty, receipt_date, opened_by,
                       qc_template_version_id, qa_template_version_id, qc_percent, qc_required, remarks, production_wo_no, created_by, updated_by)
SELECT @plan_no, @doc_id, m.id, @description, @manufacturer, @lot_qty, CONVERT(DATE, @receipt_date, 23), @by,
       qct.current_version_id, qat.current_version_id, CAST(@qc_percent AS DECIMAL(5,2)), @qc_required, @remarks, @production_wo_no, @by, @by
  FROM dbo.models m
  LEFT JOIN dbo.checklist_templates qct ON qct.id = m.qc_template_id
  LEFT JOIN dbo.checklist_templates qat ON qat.id = m.qa_template_id
 WHERE m.id = @model_id;
SET @plan_id = SCOPE_IDENTITY();

INSERT INTO dbo.plan_status_history (plan_id, from_status, to_status, by_user_id) VALUES (@plan_id, NULL, 'OPEN', @by);

SELECT 'opened' AS kind, CAST(@plan_id AS VARCHAR(20)) AS plan_id, @plan_no AS plan_no, @reused AS reused;`;

const CANCEL_PLAN = `
UPDATE dbo.plans
   SET status = 'CANCELLED', cancelled_at = SYSUTCDATETIME(), cancelled_by = @by, cancel_reason = @reason, updated_at = SYSUTCDATETIME(), updated_by = @by
 WHERE id = @id AND status = @from;
IF @@ROWCOUNT = 0
BEGIN
    SELECT CAST(0 AS BIT) AS done;
    RETURN;
END
INSERT INTO dbo.plan_status_history (plan_id, from_status, to_status, by_user_id, reason) VALUES (@id, @from, 'CANCELLED', @by, @reason);
UPDATE dbo.work_orders
   SET status = 'CANCELLED', cancelled_at = SYSUTCDATETIME(), cancelled_by = @by, cancel_reason = @reason, updated_at = SYSUTCDATETIME(), updated_by = @by
 WHERE plan_id = @id AND status IN ('IN_PROGRESS', 'SUBMITTED', 'RETURNED');
SELECT CAST(1 AS BIT) AS done;`;

/** Vendor of a plan's receipt document (user 23 Oct 2026): any time unless the plan is cancelled; all its plans follow. */
const SET_DOC_VENDOR = `
SET XACT_ABORT ON;
DECLARE @doc BIGINT, @status VARCHAR(16), @before INT;
SELECT @doc = p.receipt_doc_id, @status = p.status FROM dbo.plans p WHERE p.id = @plan;
IF @doc IS NULL RETURN;
IF @status = 'CANCELLED'
BEGIN
    SELECT 'plan_cancelled' AS kind, NULL AS doc_id, NULL AS doc_no, NULL AS before, NULL AS plan_nos;
    RETURN;
END
SELECT @before = vendor_id FROM dbo.receipt_docs WITH (UPDLOCK, HOLDLOCK) WHERE id = @doc;
UPDATE dbo.receipt_docs SET vendor_id = @vendor, updated_at = SYSUTCDATETIME(), updated_by = @by WHERE id = @doc;
SELECT 'saved' AS kind, CAST(d.id AS VARCHAR(20)) AS doc_id, d.doc_no, @before AS before,
       (SELECT STRING_AGG(p.plan_no, ',') WITHIN GROUP (ORDER BY p.plan_no) FROM dbo.plans p WHERE p.receipt_doc_id = d.id AND p.status <> 'CANCELLED') AS plan_nos
  FROM dbo.receipt_docs d WHERE d.id = @doc;`;

/**
 * docs/17 §1.5 — the same rule as lotSettled + failsWhenSettled: once True reaches the target and the whole
 * lot is called, open QC work orders with nothing inspected become FAILED. Needs @plan and @by; run it
 * inside the transaction that changed lot_called_total or qc_done_total, with the plan row locked.
 */
const SETTLE_LOT = `
IF EXISTS (SELECT 1 FROM dbo.plans WHERE id = @plan AND qc_done_total >= qc_required AND lot_called_total >= lot_qty)
    UPDATE dbo.work_orders
       SET status = 'FAILED', updated_at = SYSUTCDATETIME(), updated_by = @by
     WHERE plan_id = @plan AND status IN ('IN_PROGRESS', 'RETURNED') AND qty_need > 0 AND qty_done = 0;`;

const LIST_FROM = `
  FROM dbo.plans p
  JOIN dbo.receipt_docs d ON d.id = p.receipt_doc_id
  LEFT JOIN dbo.vendors v ON v.id = d.vendor_id
  JOIN dbo.models m ON m.id = p.model_id
  LEFT JOIN dbo.pump_types pt ON pt.id = m.pump_type_id`;

const LIST_ORDER: Record<NonNullable<PlanListFilter["sort"]>, string> = {
  opened: "p.opened_at DESC, p.id DESC",
  plan_no: "p.plan_no",
  deadline: "CASE WHEN d.qc_deadline IS NULL THEN 1 ELSE 0 END, d.qc_deadline, p.opened_at DESC, p.id DESC",
};

type ListParam = { name: string; type: sql.ISqlType | (() => sql.ISqlType); value: unknown };

/** WHERE for the plan list. Values go in as parameters; the Thai-date range becomes a UTC range so opened_at stays indexable. */
function listWhere(filter: PlanListFilter): { clause: string; params: ListParam[] } {
  const clauses: string[] = [];
  const params: ListParam[] = [];
  const statuses = filter.statuses?.filter((status) => PLAN_STATUSES.includes(status));
  if (!statuses) clauses.push("p.status <> 'CANCELLED'");
  else if (statuses.length === 0) clauses.push("1 = 0");
  else {
    statuses.forEach((status, index) => params.push({ name: `s${index}`, type: sql.VarChar(16), value: status }));
    clauses.push(`p.status IN (${statuses.map((_, index) => `@s${index}`).join(", ")})`);
  }
  const term = filter.q?.trim();
  if (term) {
    // Escape LIKE wildcards so a search for "50%" matches "50%", not everything (same as master/sql.ts).
    params.push({ name: "q", type: sql.NVarChar(120), value: `%${term.replace(/[\\%_[]/g, (char) => `\\${char}`)}%` });
    clauses.push("(p.plan_no LIKE @q ESCAPE '\\' OR d.doc_no LIKE @q ESCAPE '\\' OR m.code LIKE @q ESCAPE '\\' OR v.name LIKE @q ESCAPE '\\')");
  }
  if (filter.vendorId === "none") clauses.push("d.vendor_id IS NULL");
  else if (filter.vendorId) {
    params.push({ name: "vendor", type: sql.Int, value: filter.vendorId });
    clauses.push("d.vendor_id = @vendor");
  }
  if (filter.pumpType) {
    if (!/^\d{1,9}$/.test(filter.pumpType)) clauses.push("1 = 0");
    else {
      params.push({ name: "ptype", type: sql.Int, value: Number(filter.pumpType) });
      clauses.push("m.pump_type_id = @ptype");
    }
  }
  // Thailand is UTC+7 all year (no DST).
  if (filter.from) {
    params.push({ name: "from", type: sql.VarChar(10), value: filter.from });
    clauses.push("p.opened_at >= DATEADD(HOUR, -7, CONVERT(DATETIME2(0), @from, 23))");
  }
  if (filter.to) {
    params.push({ name: "to", type: sql.VarChar(10), value: filter.to });
    clauses.push("p.opened_at < DATEADD(HOUR, -7, DATEADD(DAY, 1, CONVERT(DATETIME2(0), @to, 23)))");
  }
  return { clause: ` WHERE ${clauses.join(" AND ")}`, params };
}

/** Active users holding QC_INSPECTOR (docs/16 W2), with the work orders still in their hands. */
const INSPECTORS = `
  SELECT CAST(u.id AS VARCHAR(20)) AS id, u.employee_code AS code, u.full_name AS name,
         (SELECT COUNT(*) FROM dbo.work_order_assignees a JOIN dbo.work_orders w ON w.id = a.work_order_id
           WHERE a.user_id = u.id AND w.status IN ('IN_PROGRESS', 'RETURNED')) AS open_count
    FROM dbo.users u
   WHERE u.is_active = 1 AND EXISTS (SELECT 1 FROM dbo.user_roles r WHERE r.user_id = u.id AND r.role = 'QC_INSPECTOR')`;

const WO_SELECT = `
  SELECT CAST(w.id AS VARCHAR(36)) AS id, CAST(w.plan_id AS VARCHAR(20)) AS plan_id, w.seq, w.wo_no, w.type, w.called_qty,
         CONVERT(CHAR(10), w.called_date, 23) AS called_date, w.qty_need, w.qty_done, w.status, w.remarks, w.cancel_reason, w.created_at`;

type WorkOrderRow = {
  id: string; plan_id: string; seq: number; wo_no: string; type: WorkOrderType; called_qty: number; called_date: string; qty_need: number;
  qty_done: number; status: WorkOrderStatus; remarks: string | null; cancel_reason: string | null; created_at: Date;
};
type AssigneeRow = { wo: string; slot: number; user_id: string; name: string; code: string };

const ASSIGNEE_SELECT = `
  SELECT CAST(a.work_order_id AS VARCHAR(36)) AS wo, a.slot, CAST(u.id AS VARCHAR(20)) AS user_id, u.full_name AS name, u.employee_code AS code
    FROM dbo.work_order_assignees a JOIN dbo.users u ON u.id = a.user_id`;

function toWorkOrders(rows: WorkOrderRow[], assignees: AssigneeRow[]): WorkOrder[] {
  const byWorkOrder = new Map<string, WorkOrderAssignee[]>();
  for (const row of assignees) {
    const list = byWorkOrder.get(row.wo) ?? [];
    list.push({ slot: row.slot, userId: row.user_id, name: row.name, code: row.code });
    byWorkOrder.set(row.wo, list);
  }
  return rows.map((row) => ({
    id: row.id, planId: Number(row.plan_id), seq: row.seq, woNo: row.wo_no, type: row.type, calledQty: row.called_qty, calledDate: row.called_date,
    qtyNeed: row.qty_need, qtyDone: row.qty_done, status: row.status, remarks: row.remarks, cancelReason: row.cancel_reason, createdAt: row.created_at,
    assignees: (byWorkOrder.get(row.id) ?? []).sort((a, b) => a.slot - b.slot),
  }));
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ID = /^\d{1,18}$/;

/** Of `ids`, the ones that aren't active QC Inspectors right now (checked inside the caller's transaction). */
async function unavailableInspectors(tx: sql.Transaction, ids: readonly string[]): Promise<string[]> {
  const numeric = ids.filter((id) => USER_ID.test(id));
  if (numeric.length === 0) return [...ids];
  const request = new sql.Request(tx);
  numeric.forEach((id, index) => request.input(`u${index}`, sql.BigInt, id));
  const result = await request.query<{ id: string }>(`${INSPECTORS} AND u.id IN (${numeric.map((_, index) => `@u${index}`).join(", ")})`);
  const ok = new Set(result.recordset.map((row) => row.id));
  return ids.filter((id) => !ok.has(id));
}

/** Replace the people of a work order, slots 1..n in the given order. */
async function writeAssignees(tx: sql.Transaction, workOrderId: string, userIds: readonly string[], by: string) {
  const request = new sql.Request(tx).input("wo", sql.UniqueIdentifier, workOrderId).input("by", sql.BigInt, by);
  userIds.forEach((id, index) => request.input(`a${index}`, sql.BigInt, id));
  await request.query(`
    DELETE FROM dbo.work_order_assignees WHERE work_order_id = @wo;
    INSERT INTO dbo.work_order_assignees (work_order_id, slot, user_id, assigned_by)
    VALUES ${userIds.map((_, index) => `(@wo, ${index + 1}, @a${index}, @by)`).join(", ")};`);
}

const isDuplicateKey = (error: unknown) => {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const { number, originalError, cause } = current as { number?: unknown; originalError?: unknown; cause?: unknown };
    if (number === 2601 || number === 2627) return true;
    current = originalError ?? cause;
  }
  return false;
};

/** SQL Server store for plans (db/009_plans_work_orders.sql). UNVERIFIED against a live server. */
export function createSqlPlanStore(): PlanStore {
  const store: PlanStore = {
    async qcSettings() {
      const pool = await getPool();
      const result = await pool.request().query<{ qc_percent: string | null; deadline_days: string | null }>(`
        SELECT (SELECT TOP (1) CAST(qc_percent AS VARCHAR(8)) FROM dbo.qc_sampling_rates
                 WHERE is_active = 1 AND effective_from <= SYSUTCDATETIME() ORDER BY effective_from DESC, id DESC) AS qc_percent,
               (SELECT setting_value FROM dbo.settings WHERE setting_key = 'invoice_qc_deadline_days' AND is_active = 1) AS deadline_days`);
      const row = result.recordset[0];
      const percent = Number(row?.qc_percent);
      const days = Number(row?.deadline_days);
      return {
        qcPercent: percent > 0 && percent <= 100 ? percent : DEFAULT_QC_PERCENT,
        deadlineDays: Number.isInteger(days) && days >= 0 ? days : DEFAULT_QC_DEADLINE_DAYS,
      };
    },

    async findVendor(id) {
      const pool = await getPool();
      const result = await pool.request().input("id", sql.Int, id).query<{ id: number; name: string; is_active: boolean }>("SELECT id, name, is_active FROM dbo.vendors WHERE id = @id");
      const row = result.recordset[0];
      return row ? { id: row.id, name: row.name, isActive: Boolean(row.is_active) } : null;
    },

    async findModel(id) {
      const pool = await getPool();
      const result = await pool.request().input("id", sql.Int, id).query<ModelRow>(`${MODEL_SELECT} WHERE m.id = @id`);
      return result.recordset[0] ? toModel(result.recordset[0]) : null;
    },

    async findReceiptDoc(key: ReceiptDocKey) {
      const pool = await getPool();
      const result = await pool
        .request()
        .input("doc_type", sql.VarChar(8), key.docType)
        .input("doc_no_n", sql.NVarChar(64), key.docNoNormalized)
        .query<DocRow>(`${DOC_SELECT} WHERE d.doc_type = @doc_type AND d.doc_no_normalized = @doc_no_n`);
      return result.recordset[0] ? toDoc(result.recordset[0]) : null;
    },

    async docPlans(docId): Promise<DocPlan[]> {
      const pool = await getPool();
      const result = await pool.request().input("doc", sql.BigInt, docId).query<{ id: string; plan_no: string; model_id: number; model_code: string }>(`
        SELECT CAST(p.id AS VARCHAR(20)) AS id, p.plan_no, p.model_id, m.code AS model_code
          FROM dbo.plans p JOIN dbo.models m ON m.id = p.model_id
         WHERE p.receipt_doc_id = @doc AND p.status <> 'CANCELLED'
         ORDER BY p.plan_no`);
      return result.recordset.map((row) => ({ id: Number(row.id), planNo: row.plan_no, modelId: row.model_id, modelCode: row.model_code }));
    },

    async listOpenOptions() {
      const pool = await getPool();
      // Sequential: one connection is enough and keeps the pool free for other requests.
      const vendors = await pool.request().query<{ id: number; name: string }>("SELECT id, name FROM dbo.vendors WHERE is_active = 1 ORDER BY name");
      const models = await pool.request().query<ModelRow>(`${MODEL_SELECT} WHERE m.is_active = 1 ORDER BY m.code`);
      return {
        vendors: vendors.recordset.map((row) => ({ id: row.id, name: row.name, isActive: true })),
        models: models.recordset.map(toModel),
      };
    },

    async openPlan(plan: NewPlan) {
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
      try {
        const { header } = plan.doc;
        const result = await new sql.Request(tx)
          .input("doc_type", sql.VarChar(8), plan.doc.docType)
          .input("doc_no", sql.NVarChar(64), plan.doc.docNo)
          .input("doc_no_n", sql.NVarChar(64), plan.doc.docNoNormalized)
          .input("vendor_id", sql.Int, plan.doc.vendorId)
          .input("origin", sql.VarChar(10), plan.doc.docType === "INVOICE" ? "IMPORTED" : "DOMESTIC")
          .input("department", sql.VarChar(8), header.department)
          .input("invoice_date", sql.VarChar(10), header.invoiceDate)
          .input("doc_date", sql.VarChar(10), header.docDate)
          .input("expected_sku", sql.Int, header.expectedSkuCount)
          .input("qc_deadline", sql.VarChar(10), header.qcDeadline)
          .input("doc_remarks", sql.NVarChar(1000), header.remarks)
          .input("model_id", sql.Int, plan.modelId)
          .input("description", sql.NVarChar(400), plan.description)
          .input("manufacturer", sql.NVarChar(200), plan.manufacturer)
          .input("lot_qty", sql.Int, plan.lotQty)
          .input("receipt_date", sql.VarChar(10), plan.receiptDate)
          .input("remarks", sql.NVarChar(1000), plan.remarks)
          .input("production_wo_no", sql.NVarChar(64), plan.productionWoNo)
          .input("qc_percent", sql.VarChar(8), plan.qcPercent.toFixed(2))
          .input("qc_required", sql.Int, plan.qcRequired)
          .input("period", sql.Char(4), plan.period)
          .input("by", sql.BigInt, plan.openedBy)
          .query<{ kind: "opened" | "duplicate"; plan_id: string; plan_no: string; reused: boolean }>(OPEN_PLAN);
        await tx.commit();
        const row = result.recordset[0];
        return row.kind === "duplicate"
          ? { kind: "duplicate", planId: Number(row.plan_id), planNo: row.plan_no }
          : { kind: "opened", planId: Number(row.plan_id), planNo: row.plan_no, headerReused: Boolean(row.reused) };
      } catch (error) {
        await tx.rollback().catch(() => undefined);
        // Lost a race against someone opening the same (document, model): report their plan.
        if (isDuplicateKey(error)) {
          const doc = await store.findReceiptDoc(plan.doc);
          const existing = doc && (await livePlanOf(doc.id, plan.modelId));
          if (existing) return { kind: "duplicate", ...existing };
        }
        throw error;
      }
    },

    async getPlan(id) {
      const pool = await getPool();
      const result = await pool.request().input("id", sql.BigInt, id).query<{
        id: string; plan_no: string; status: PlanStatus; receipt_doc_id: string; model_id: number; description: string | null; manufacturer: string | null;
        lot_qty: number; lot_called_total: number; qc_done_total: number; qc_percent: string; qc_required: number; receipt_date: string | null;
        remarks: string | null; production_wo_no: string | null; waiting_goods: boolean; opened_at: Date; opened_by_name: string | null;
        cancelled_at: Date | null; cancel_reason: string | null; responsible_name: string | null;
      }>(`
        SELECT CAST(p.id AS VARCHAR(20)) AS id, p.plan_no, p.status, CAST(p.receipt_doc_id AS VARCHAR(20)) AS receipt_doc_id, p.model_id,
               p.description, p.manufacturer, p.lot_qty, p.lot_called_total, p.qc_done_total, CAST(p.qc_percent AS VARCHAR(8)) AS qc_percent,
               p.qc_required, CONVERT(CHAR(10), p.receipt_date, 23) AS receipt_date, p.remarks, p.production_wo_no, p.waiting_goods, p.opened_at,
               COALESCE(u.full_name, u.employee_code) AS opened_by_name, p.cancelled_at, p.cancel_reason,
               COALESCE(r.full_name, r.employee_code) AS responsible_name
          FROM dbo.plans p LEFT JOIN dbo.users u ON u.id = p.opened_by LEFT JOIN dbo.users r ON r.id = p.responsible_qc_id
         WHERE p.id = @id`);
      const row = result.recordset[0];
      if (!row) return null;
      const docResult = await pool.request().input("id", sql.BigInt, row.receipt_doc_id).query<DocRow>(`${DOC_SELECT} WHERE d.id = @id`);
      const modelResult = await pool.request().input("id", sql.Int, row.model_id).query<ModelRow>(`${MODEL_SELECT} WHERE m.id = @id`);
      const detail: PlanDetail = {
        id: Number(row.id), planNo: row.plan_no, status: row.status, doc: toDoc(docResult.recordset[0]), model: toModel(modelResult.recordset[0]),
        description: row.description, manufacturer: row.manufacturer, lotQty: row.lot_qty, lotCalledTotal: row.lot_called_total,
        qcDoneTotal: row.qc_done_total, qcPercent: Number(row.qc_percent), qcRequired: row.qc_required, receiptDate: row.receipt_date,
        remarks: row.remarks, productionWoNo: row.production_wo_no, waitingGoods: Boolean(row.waiting_goods), openedAt: row.opened_at, openedBy: row.opened_by_name,
        cancelledAt: row.cancelled_at, cancelReason: row.cancel_reason, responsibleQc: row.responsible_name,
      };
      return detail;
    },

    async listPlans(filter) {
      const pool = await getPool();
      const { clause, params } = listWhere(filter);
      const request = () => {
        const req = pool.request();
        for (const param of params) req.input(param.name, param.type, param.value);
        return req;
      };
      const total = await request().query<{ total: number }>(`SELECT COUNT(*) AS total${LIST_FROM}${clause}`);
      const rows = await request()
        .input("offset", sql.Int, (filter.page - 1) * filter.pageSize)
        .input("limit", sql.Int, filter.pageSize)
        .query<{
          id: string; plan_no: string; status: PlanStatus; doc_type: DocType; doc_no: string; vendor_name: string | null; model_code: string;
          pump_type: string | null; lot_qty: number; qc_done_total: number; qc_required: number; qc_deadline: string | null;
          waiting_goods: boolean; opened_at: Date;
        }>(`
          SELECT CAST(p.id AS VARCHAR(20)) AS id, p.plan_no, p.status, d.doc_type, d.doc_no, v.name AS vendor_name, m.code AS model_code,
                 pt.name AS pump_type, p.lot_qty, p.qc_done_total, p.qc_required, CONVERT(CHAR(10), d.qc_deadline, 23) AS qc_deadline,
                 p.waiting_goods, p.opened_at
          ${LIST_FROM}${clause}
          ORDER BY ${LIST_ORDER[filter.sort ?? "opened"]}
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
      return {
        total: Number(total.recordset[0]?.total ?? 0),
        rows: rows.recordset.map((row): PlanListRow => ({
          id: Number(row.id), planNo: row.plan_no, status: row.status, docType: row.doc_type, docNo: row.doc_no, vendorName: row.vendor_name,
          modelCode: row.model_code, pumpType: row.pump_type, lotQty: row.lot_qty, qcDoneTotal: row.qc_done_total, qcRequired: row.qc_required,
          qcDeadline: row.qc_deadline, waitingGoods: Boolean(row.waiting_goods), openedAt: row.opened_at,
        })),
      };
    },

    async planFilterOptions() {
      const pool = await getPool();
      // Inactive rows stay listed while plans still point at them.
      const vendors = await pool.request().query<{ id: number; name: string }>(`
        SELECT id, name FROM dbo.vendors v
         WHERE v.is_active = 1 OR EXISTS (SELECT 1 FROM dbo.receipt_docs d WHERE d.vendor_id = v.id)
         ORDER BY name`);
      const pumpTypes = await pool.request().query<{ id: number; name: string }>(`
        SELECT id, name FROM dbo.pump_types pt
         WHERE pt.is_active = 1 OR EXISTS (SELECT 1 FROM dbo.models m JOIN dbo.plans p ON p.model_id = m.id WHERE m.pump_type_id = pt.id)
         ORDER BY name`);
      return {
        vendors: vendors.recordset.map((row) => ({ id: row.id, name: row.name })),
        pumpTypes: pumpTypes.recordset.map((row) => ({ value: String(row.id), label: row.name })),
      };
    },

    async planSummary(today) {
      const pool = await getPool();
      // SUM over INT can't overflow here; ISNULL because SUM of no rows is NULL.
      const result = await pool.request()
        .input("today", sql.VarChar(10), today)
        .input("soon", sql.Int, DEADLINE_SOON_DAYS)
        .query<Record<keyof PlanSummary, number | null>>(`
          DECLARE @d DATE = CONVERT(DATE, @today, 23);
          SELECT
            ISNULL(SUM(CASE WHEN live = 1 THEN 1 ELSE 0 END), 0) AS live,
            ISNULL(SUM(CASE WHEN live = 1 AND p.qc_done_total = 0 THEN 1 ELSE 0 END), 0) AS notStarted,
            ISNULL(SUM(CASE WHEN p.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed,
            ISNULL(SUM(CASE WHEN live = 1 AND p.waiting_goods = 1 THEN 1 ELSE 0 END), 0) AS waitingGoods,
            ISNULL(SUM(CASE WHEN live = 1 THEN p.qc_done_total ELSE 0 END), 0) AS qcDone,
            ISNULL(SUM(CASE WHEN live = 1 THEN p.qc_required ELSE 0 END), 0) AS qcRequired,
            ISNULL(SUM(CASE WHEN live = 1 AND d.qc_deadline >= @d AND d.qc_deadline <= DATEADD(DAY, @soon, @d) THEN 1 ELSE 0 END), 0) AS deadlineSoon,
            ISNULL(SUM(CASE WHEN live = 1 AND d.qc_deadline < @d THEN 1 ELSE 0 END), 0) AS overdue
          FROM dbo.plans p
          JOIN dbo.receipt_docs d ON d.id = p.receipt_doc_id
          CROSS APPLY (SELECT CASE WHEN p.status IN ('CANCELLED', 'COMPLETED') THEN 0 ELSE 1 END AS live) l`);
      const row = result.recordset[0];
      const n = (key: keyof PlanSummary) => Number(row?.[key] ?? 0);
      return {
        live: n("live"), notStarted: n("notStarted"), completed: n("completed"), waitingGoods: n("waitingGoods"),
        qcDone: n("qcDone"), qcRequired: n("qcRequired"), deadlineSoon: n("deadlineSoon"), overdue: n("overdue"),
      };
    },

    async planHistory(id) {
      const pool = await getPool();
      const result = await pool.request().input("id", sql.BigInt, id).query<{
        from_status: PlanStatus | null; to_status: PlanStatus; at: Date; by_name: string | null; reason: string | null;
      }>(`
        SELECT h.from_status, h.to_status, h.at, COALESCE(u.full_name, u.employee_code) AS by_name, h.reason
          FROM dbo.plan_status_history h LEFT JOIN dbo.users u ON u.id = h.by_user_id
         WHERE h.plan_id = @id
         ORDER BY h.at, h.id`);
      return result.recordset.map((row) => ({ from: row.from_status, to: row.to_status, at: row.at, by: row.by_name, reason: row.reason }));
    },

    async cancelPlan(id, change) {
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
      try {
        const result = await new sql.Request(tx)
          .input("id", sql.BigInt, id)
          .input("from", sql.VarChar(16), change.from)
          .input("by", sql.BigInt, change.by)
          .input("reason", sql.NVarChar(400), change.reason)
          .query<{ done: boolean }>(CANCEL_PLAN);
        await tx.commit();
        return Boolean(result.recordset[0]?.done);
      } catch (error) {
        await tx.rollback().catch(() => undefined);
        throw error;
      }
    },

    async setDocVendor(planId, change) {
      const pool = await getPool();
      const result = await pool
        .request()
        .input("plan", sql.BigInt, planId)
        .input("vendor", sql.Int, change.vendorId)
        .input("by", sql.BigInt, change.by)
        .query<{ kind: "saved" | "plan_cancelled"; doc_id: string | null; doc_no: string | null; before: number | null; plan_nos: string | null }>(SET_DOC_VENDOR);
      const row = result.recordset[0];
      if (!row) return { kind: "not_found" };
      if (row.kind === "plan_cancelled") return { kind: "plan_cancelled" };
      return { kind: "saved", docId: Number(row.doc_id), docNo: row.doc_no ?? "", before: row.before, planNos: row.plan_nos ? row.plan_nos.split(",") : [] };
    },

    async setWaitingGoods(id, value, by) {
      const pool = await getPool();
      const result = await pool
        .request()
        .input("id", sql.BigInt, id)
        .input("value", sql.Bit, value)
        .input("by", sql.BigInt, by)
        .query(`
          UPDATE dbo.plans SET waiting_goods = @value, updated_at = SYSUTCDATETIME(), updated_by = @by
           WHERE id = @id AND status NOT IN ('CANCELLED', 'COMPLETED')`);
      return result.rowsAffected[0] === 1;
    },

    async listInspectors() {
      const pool = await getPool();
      const result = await pool.request().query<{ id: string; code: string; name: string; open_count: number }>(`${INSPECTORS} ORDER BY u.full_name`);
      return result.recordset.map((row) => ({ id: row.id, code: row.code, name: row.name, openWorkOrders: Number(row.open_count) }));
    },

    async openWorkOrder(input) {
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
      const stop = async <T,>(result: T) => {
        await tx.rollback();
        return result;
      };
      try {
        // The plan row lock serialises call-ins of one plan, so seq, the lot left and Need stay consistent.
        const locked = await new sql.Request(tx).input("plan", sql.BigInt, input.planId).input("called_date", sql.VarChar(10), input.calledDate).query<{
          status: PlanStatus; plan_no: string; lot_qty: number; lot_called_total: number; qc_done_total: number; qc_required: number;
          last_seq: number; same_day_wo: string | null;
        }>(`
          SELECT p.status, p.plan_no, p.lot_qty, p.lot_called_total, p.qc_done_total, p.qc_required,
                 (SELECT ISNULL(MAX(w.seq), 0) FROM dbo.work_orders w WHERE w.plan_id = p.id) AS last_seq,
                 (SELECT TOP (1) w.wo_no FROM dbo.work_orders w
                   WHERE w.plan_id = p.id AND w.status <> 'CANCELLED' AND w.called_date = CONVERT(DATE, @called_date, 23)) AS same_day_wo
            FROM dbo.plans p WITH (UPDLOCK, HOLDLOCK)
           WHERE p.id = @plan`);
        const plan = locked.recordset[0];
        if (!plan) return await stop({ kind: "plan_not_found" as const });
        if (!canOpenWorkOrder(plan.status)) return await stop({ kind: "plan_closed" as const, status: plan.status });
        // docs/17 §1.4: one work order per plan per call-in date (the same rule as takesCallInDate).
        if (plan.same_day_wo) return await stop({ kind: "same_day" as const, woNo: plan.same_day_wo });
        const lot = { lotQty: plan.lot_qty, lotCalledTotal: plan.lot_called_total, qcRequired: plan.qc_required, qcDoneBefore: plan.qc_done_total };
        const error = callInError({ ...lot, calledQty: input.calledQty });
        if (error) return await stop({ kind: "call_in" as const, error, remaining: plan.lot_qty - plan.lot_called_total, minimum: minCallIn(lot) });
        const missing = await unavailableInspectors(tx, input.assigneeIds);
        if (missing.length > 0) return await stop({ kind: "assignees_unavailable" as const, userIds: missing });

        const { type, need } = planWorkOrder({ calledQty: input.calledQty, qcRequired: plan.qc_required, qcDoneBefore: plan.qc_done_total });
        const seq = plan.last_seq + 1;
        const woNo = formatWorkOrderNo(plan.plan_no, seq);
        const inserted = await new sql.Request(tx)
          .input("plan", sql.BigInt, input.planId)
          .input("seq", sql.Int, seq)
          .input("wo_no", sql.VarChar(24), woNo)
          .input("type", sql.VarChar(10), type)
          .input("called", sql.Int, input.calledQty)
          .input("called_date", sql.VarChar(10), input.calledDate)
          .input("need", sql.Int, need)
          .input("remarks", sql.NVarChar(1000), input.remarks)
          .input("by", sql.BigInt, input.by)
          .query<{ id: string }>(`
            INSERT INTO dbo.work_orders (plan_id, seq, wo_no, type, called_qty, called_date, qty_need, remarks, created_by, updated_by)
            OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
            VALUES (@plan, @seq, @wo_no, @type, @called, CONVERT(DATE, @called_date, 23), @need, @remarks, @by, @by);`);
        const id = inserted.recordset[0].id;
        await writeAssignees(tx, id, input.assigneeIds, input.by);
        await new sql.Request(tx)
          .input("plan", sql.BigInt, input.planId)
          .input("called", sql.Int, input.calledQty)
          .input("first", sql.BigInt, input.assigneeIds[0])
          .input("by", sql.BigInt, input.by)
          .query(`
            IF EXISTS (SELECT 1 FROM dbo.plans WHERE id = @plan AND status = 'OPEN')
                INSERT INTO dbo.plan_status_history (plan_id, from_status, to_status, by_user_id) VALUES (@plan, 'OPEN', 'ASSIGNED', @by);
            UPDATE dbo.plans
               SET lot_called_total = lot_called_total + @called,
                   status = CASE WHEN status = 'OPEN' THEN 'ASSIGNED' ELSE status END,
                   responsible_qc_id = COALESCE(responsible_qc_id, @first),
                   updated_at = SYSUTCDATETIME(), updated_by = @by
             WHERE id = @plan;
            ${SETTLE_LOT}`);
        await tx.commit();
        return { kind: "opened", id, woNo, seq, type, need };
      } catch (error) {
        await tx.rollback().catch(() => undefined);
        throw error;
      }
    },

    async workOrdersOf(planId) {
      const pool = await getPool();
      const rows = await pool.request().input("plan", sql.BigInt, planId).query<WorkOrderRow>(`${WO_SELECT} FROM dbo.work_orders w WHERE w.plan_id = @plan ORDER BY w.seq`);
      const people = await pool.request().input("plan", sql.BigInt, planId).query<AssigneeRow>(
        `${ASSIGNEE_SELECT} JOIN dbo.work_orders w ON w.id = a.work_order_id WHERE w.plan_id = @plan`,
      );
      return toWorkOrders(rows.recordset, people.recordset);
    },

    async getWorkOrder(id) {
      if (!GUID.test(id)) return null;
      const pool = await getPool();
      const rows = await pool.request().input("id", sql.UniqueIdentifier, id).query<WorkOrderRow>(`${WO_SELECT} FROM dbo.work_orders w WHERE w.id = @id`);
      if (!rows.recordset[0]) return null;
      const people = await pool.request().input("id", sql.UniqueIdentifier, id).query<AssigneeRow>(`${ASSIGNEE_SELECT} WHERE a.work_order_id = @id`);
      return toWorkOrders(rows.recordset, people.recordset)[0];
    },

    async jobs(userId, options) {
      if (userId !== null && !USER_ID.test(userId)) return [];
      const pool = await getPool();
      const mine = userId === null ? "" : " AND EXISTS (SELECT 1 FROM dbo.work_order_assignees m WHERE m.work_order_id = w.id AND m.user_id = @user)";
      const live = options?.activeOnly
        ? `w.status IN ('IN_PROGRESS', 'RETURNED') AND p.status NOT IN ('CANCELLED', 'COMPLETED')${mine}`
        : `w.status <> 'CANCELLED' AND p.status <> 'CANCELLED'${mine}`;
      const request = () => (userId === null ? pool.request() : pool.request().input("user", sql.BigInt, userId));
      const rows = await request().query<WorkOrderRow & { plan_no: string; model_code: string; description: string | null; doc_type: DocType; doc_no: string; vendor_name: string | null }>(`
        ${WO_SELECT}, p.plan_no, m.code AS model_code, p.description, d.doc_type, d.doc_no, v.name AS vendor_name
          FROM dbo.work_orders w
          JOIN dbo.plans p ON p.id = w.plan_id
          JOIN dbo.models m ON m.id = p.model_id
          JOIN dbo.receipt_docs d ON d.id = p.receipt_doc_id
          LEFT JOIN dbo.vendors v ON v.id = d.vendor_id
         WHERE ${live}
         ORDER BY CASE WHEN w.status IN ('IN_PROGRESS', 'RETURNED') THEN 0 ELSE 1 END, w.called_date, w.seq
         ${options?.activeOnly ? "" : "OFFSET 0 ROWS FETCH NEXT 200 ROWS ONLY"}`);
      const people = await request().query<AssigneeRow>(
        `${ASSIGNEE_SELECT} WHERE a.work_order_id IN (SELECT w.id FROM dbo.work_orders w JOIN dbo.plans p ON p.id = w.plan_id WHERE ${live})`,
      );
      const workOrders = toWorkOrders(rows.recordset, people.recordset);
      return rows.recordset.map((row, index): JobCard => ({
        ...workOrders[index], planNo: row.plan_no, modelCode: row.model_code, description: row.description, docType: row.doc_type,
        docNo: row.doc_no, vendorName: row.vendor_name,
      }));
    },

    async jobHistory(filter) {
      if (filter.userId !== null && !USER_ID.test(filter.userId)) return { rows: [], total: 0 };
      const pool = await getPool();
      const clauses = ["w.status NOT IN ('IN_PROGRESS', 'RETURNED')"];
      if (filter.kind === "cancelled") clauses.push("w.status = 'CANCELLED'");
      if (filter.kind === "done") clauses.push("w.status <> 'CANCELLED'");
      if (filter.userId !== null) clauses.push("EXISTS (SELECT 1 FROM dbo.work_order_assignees m WHERE m.work_order_id = w.id AND m.user_id = @user)");
      if (filter.fromDate) clauses.push("w.called_date >= CONVERT(DATE, @from, 23)");
      const where = clauses.join(" AND ");
      const request = () => {
        const req = pool.request();
        if (filter.userId !== null) req.input("user", sql.BigInt, filter.userId);
        if (filter.fromDate) req.input("from", sql.VarChar(10), filter.fromDate);
        return req;
      };
      const total = await request().query<{ total: number }>(`SELECT COUNT(*) AS total FROM dbo.work_orders w WHERE ${where}`);
      const rows = await request()
        .input("offset", sql.Int, (filter.page - 1) * filter.pageSize)
        .input("limit", sql.Int, filter.pageSize)
        .query<WorkOrderRow & { plan_no: string; model_code: string; description: string | null; doc_type: DocType; doc_no: string; vendor_name: string | null }>(`
          ${WO_SELECT}, p.plan_no, m.code AS model_code, p.description, d.doc_type, d.doc_no, v.name AS vendor_name
            FROM dbo.work_orders w
            JOIN dbo.plans p ON p.id = w.plan_id
            JOIN dbo.models m ON m.id = p.model_id
            JOIN dbo.receipt_docs d ON d.id = p.receipt_doc_id
            LEFT JOIN dbo.vendors v ON v.id = d.vendor_id
           WHERE ${where}
           ORDER BY w.called_date DESC, w.seq DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
      const ids = rows.recordset.map((row) => row.id).filter((id) => GUID.test(id));
      const people = ids.length === 0 ? { recordset: [] as AssigneeRow[] } : await (() => {
        const req = pool.request();
        ids.forEach((id, index) => req.input(`w${index}`, sql.UniqueIdentifier, id));
        return req.query<AssigneeRow>(`${ASSIGNEE_SELECT} WHERE a.work_order_id IN (${ids.map((_, index) => `@w${index}`).join(", ")})`);
      })();
      const workOrders = toWorkOrders(rows.recordset, people.recordset);
      return {
        total: Number(total.recordset[0]?.total ?? 0),
        rows: rows.recordset.map((row, index): JobCard => ({
          ...workOrders[index], planNo: row.plan_no, modelCode: row.model_code, description: row.description, docType: row.doc_type,
          docNo: row.doc_no, vendorName: row.vendor_name,
        })),
      };
    },

    async setAssignees(id, change) {
      if (!GUID.test(id)) return { kind: "not_found" };
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
      try {
        const locked = await new sql.Request(tx).input("id", sql.UniqueIdentifier, id).query<{ status: WorkOrderStatus; qty_done: number; plan_id: string; wo_no: string }>(
          "SELECT status, qty_done, CAST(plan_id AS VARCHAR(20)) AS plan_id, wo_no FROM dbo.work_orders WITH (UPDLOCK, HOLDLOCK) WHERE id = @id",
        );
        const wo = locked.recordset[0];
        if (!wo || workOrderBlock({ status: wo.status, qtyDone: wo.qty_done }, "assignees")) {
          await tx.rollback();
          return wo ? { kind: "locked" } : { kind: "not_found" };
        }
        const current = await new sql.Request(tx).input("id", sql.UniqueIdentifier, id).query<{ user_id: string }>(
          "SELECT CAST(user_id AS VARCHAR(20)) AS user_id FROM dbo.work_order_assignees WHERE work_order_id = @id ORDER BY slot",
        );
        const before = current.recordset.map((row) => row.user_id);
        // People already on the work order may stay even if deactivated since; newcomers must be active QC.
        const newcomers = change.assigneeIds.filter((userId) => !before.includes(userId));
        const missing = newcomers.length > 0 ? await unavailableInspectors(tx, newcomers) : [];
        if (missing.length > 0) {
          await tx.rollback();
          return { kind: "assignees_unavailable", userIds: missing };
        }
        await writeAssignees(tx, id, change.assigneeIds, change.by);
        await new sql.Request(tx)
          .input("id", sql.UniqueIdentifier, id)
          .input("by", sql.BigInt, change.by)
          .query("UPDATE dbo.work_orders SET updated_at = SYSUTCDATETIME(), updated_by = @by WHERE id = @id");
        await tx.commit();
        return { kind: "saved", planId: Number(wo.plan_id), woNo: wo.wo_no, before };
      } catch (error) {
        await tx.rollback().catch(() => undefined);
        throw error;
      }
    },

    async cancelWorkOrder(id, change) {
      if (!GUID.test(id)) return { kind: "not_found" };
      const pool = await getPool();
      const found = await pool.request().input("id", sql.UniqueIdentifier, id).query<{ plan_id: string }>(
        "SELECT CAST(plan_id AS VARCHAR(20)) AS plan_id FROM dbo.work_orders WHERE id = @id",
      );
      if (!found.recordset[0]) return { kind: "not_found" };
      const planId = Number(found.recordset[0].plan_id);
      const tx = new sql.Transaction(pool);
      await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
      try {
        // Plan first, then the work order — the same order as openWorkOrder, so the two can't deadlock.
        await new sql.Request(tx).input("plan", sql.BigInt, planId).query("SELECT id FROM dbo.plans WITH (UPDLOCK, HOLDLOCK) WHERE id = @plan");
        const locked = await new sql.Request(tx).input("id", sql.UniqueIdentifier, id).query<{ status: WorkOrderStatus; qty_done: number; called_qty: number; wo_no: string }>(
          "SELECT status, qty_done, called_qty, wo_no FROM dbo.work_orders WITH (UPDLOCK, HOLDLOCK) WHERE id = @id",
        );
        const wo = locked.recordset[0];
        const block = wo ? workOrderBlock({ status: wo.status, qtyDone: wo.qty_done }, "cancel") : null;
        if (!wo || block) {
          await tx.rollback();
          return wo && block ? { kind: "locked", block } : { kind: "not_found" };
        }
        await new sql.Request(tx)
          .input("id", sql.UniqueIdentifier, id)
          .input("plan", sql.BigInt, planId)
          .input("called", sql.Int, wo.called_qty)
          .input("by", sql.BigInt, change.by)
          .input("reason", sql.NVarChar(400), change.reason)
          .query(`
            UPDATE dbo.work_orders
               SET status = 'CANCELLED', cancelled_at = SYSUTCDATETIME(), cancelled_by = @by, cancel_reason = @reason,
                   updated_at = SYSUTCDATETIME(), updated_by = @by
             WHERE id = @id;
            UPDATE dbo.plans SET lot_called_total = lot_called_total - @called, updated_at = SYSUTCDATETIME(), updated_by = @by WHERE id = @plan;
            IF NOT EXISTS (SELECT 1 FROM dbo.work_orders WHERE plan_id = @plan AND status <> 'CANCELLED')
               AND EXISTS (SELECT 1 FROM dbo.plans WHERE id = @plan AND status = 'ASSIGNED')
            BEGIN
                UPDATE dbo.plans SET status = 'OPEN', updated_at = SYSUTCDATETIME(), updated_by = @by WHERE id = @plan;
                INSERT INTO dbo.plan_status_history (plan_id, from_status, to_status, by_user_id, reason) VALUES (@plan, 'ASSIGNED', 'OPEN', @by, @reason);
            END`);
        await tx.commit();
        return { kind: "cancelled", planId, woNo: wo.wo_no, calledQty: wo.called_qty };
      } catch (error) {
        await tx.rollback().catch(() => undefined);
        throw error;
      }
    },
  };

  async function livePlanOf(docId: number, modelId: number) {
    const pool = await getPool();
    const result = await pool.request().input("doc", sql.BigInt, docId).input("model", sql.Int, modelId).query<{ id: string; plan_no: string }>(
      "SELECT TOP (1) CAST(id AS VARCHAR(20)) AS id, plan_no FROM dbo.plans WHERE receipt_doc_id = @doc AND model_id = @model AND status <> 'CANCELLED'",
    );
    const row = result.recordset[0];
    return row ? { planId: Number(row.id), planNo: row.plan_no } : null;
  }

  return store;
}
