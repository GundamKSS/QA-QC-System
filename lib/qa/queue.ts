import "server-only";
import { getPool } from "@/lib/db/pool";

export type QaQueueItem = {
  id: number;
  planNo: string;
  status: string;
  modelCode: string;
  modelDescription: string | null;
  pumpType: string | null;
  brandName: string;
  vendorName: string | null;
  lotQty: number;
  lotCalledTotal: number;
  qcDoneTotal: number;
  qaRequired: number;
  qaDoneTotal: number;
  qaPending: boolean;
  docNo: string;
  docType: string;
  qcCompletedAt: string | null;
  openedAt: string;
};

export type QaQueuePayload = {
  queue: QaQueueItem[];
  pendingCount: number;
  inProgressCount: number;
  completedTodayCount: number;
};

/**
 * Loads lots that are awaiting or actively undergoing QA sampling inspection.
 * (Screen S10 / docs/02 FR-NAV-02).
 */
export async function loadQaQueueData(): Promise<QaQueuePayload> {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT
      p.id,
      p.plan_no,
      p.status,
      m.code AS model_code,
      m.description AS model_desc,
      pt.name AS pump_type,
      b.name AS brand_name,
      v.name AS vendor_name,
      p.lot_qty,
      p.lot_called_total,
      p.qc_done_total,
      COALESCE(p.qa_required, 5) AS qa_required,
      (
        SELECT COUNT(*)
          FROM dbo.unit_inspections ui
         WHERE ui.plan_id = p.id AND ui.role = 'QA' AND ui.status = 'COMPLETED'
      ) AS qa_done_total,
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
    WHERE p.status IN ('QA_PENDING', 'QA_IN_PROGRESS', 'QC_COMPLETED')
       OR (p.status = 'COMPLETED' AND DATEDIFF(day, p.updated_at, SYSUTCDATETIME()) <= 1)
    ORDER BY
      CASE p.status
        WHEN 'QA_IN_PROGRESS' THEN 1
        WHEN 'QA_PENDING' THEN 2
        WHEN 'QC_COMPLETED' THEN 3
        ELSE 4
      END,
      p.updated_at DESC
  `);

  const queue: QaQueueItem[] = res.recordset.map((row) => ({
    id: Number(row.id),
    planNo: String(row.plan_no),
    status: String(row.status),
    modelCode: String(row.model_code),
    modelDescription: row.model_desc ? String(row.model_desc) : null,
    pumpType: row.pump_type ? String(row.pump_type) : null,
    brandName: String(row.brand_name),
    vendorName: row.vendor_name ? String(row.vendor_name) : null,
    lotQty: Number(row.lot_qty ?? 0),
    lotCalledTotal: Number(row.lot_called_total ?? 0),
    qcDoneTotal: Number(row.qc_done_total ?? 0),
    qaRequired: Number(row.qa_required ?? 5),
    qaDoneTotal: Number(row.qa_done_total ?? 0),
    qaPending: row.status === "QA_PENDING" || row.status === "QC_COMPLETED",
    docNo: String(row.doc_no ?? ""),
    docType: String(row.doc_type ?? ""),
    qcCompletedAt: row.qc_completed_at ? String(row.qc_completed_at) : null,
    openedAt: String(row.opened_at),
  }));

  const pendingCount = queue.filter((item) => item.status === "QA_PENDING" || item.status === "QC_COMPLETED").length;
  const inProgressCount = queue.filter((item) => item.status === "QA_IN_PROGRESS").length;
  const completedTodayCount = queue.filter((item) => item.status === "COMPLETED").length;

  return {
    queue,
    pendingCount,
    inProgressCount,
    completedTodayCount,
  };
}
