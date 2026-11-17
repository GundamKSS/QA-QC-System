import "server-only";
import { getPool, sql } from "@/lib/db/pool";
import type {
  InspectionReportData,
  ReportApproval,
  ReportDefectItem,
  ReportPhoto,
  ReportsListItem,
  ReportsListResponse,
  ReportUnitItem,
} from "./types";

/**
 * Loads the complete Official QC/QA Inspection Report for a given plan (Screen S15).
 */
export async function loadInspectionReport(planId: number): Promise<InspectionReportData | null> {
  const pool = await getPool();

  // 1. Plan, Document, Model, and Vendor Metadata
  const planRes = await pool
    .request()
    .input("planId", sql.BigInt, planId)
    .query(`
      SELECT
        p.id,
        p.plan_no,
        p.status,
        CONVERT(VARCHAR(33), p.created_at, 126) AS created_at,
        CONVERT(VARCHAR(33), p.updated_at, 126) AS updated_at,
        rd.doc_no,
        rd.doc_type,
        rd.department,
        v.name AS vendor_name,
        v.country AS vendor_code,
        m.code AS model_code,
        m.description AS model_desc,
        b.name AS brand_name,
        b.brand_group,
        pt.name AS pump_type,
        p.lot_qty,
        COALESCE(p.qc_required, 0) AS qc_required,
        p.qc_done_total,
        COALESCE(p.qa_required, 5) AS qa_required,
        (
          SELECT COUNT(*)
            FROM dbo.unit_inspections ui
           WHERE ui.plan_id = p.id AND ui.role = 'QA' AND ui.status = 'COMPLETED'
        ) AS qa_done_total,
        COALESCE(p.aql_level, 'II') AS aql_level
      FROM dbo.plans p
      JOIN dbo.models m ON m.id = p.model_id
      JOIN dbo.brands b ON b.id = m.brand_id
      LEFT JOIN dbo.pump_types pt ON pt.id = m.pump_type_id
      LEFT JOIN dbo.receipt_docs rd ON rd.id = p.receipt_doc_id
      LEFT JOIN dbo.vendors v ON v.id = rd.vendor_id
      WHERE p.id = @planId
    `);

  if (planRes.recordset.length === 0) return null;
  const pRow = planRes.recordset[0];

  // 2. Unit Inspections Log
  const unitsRes = await pool
    .request()
    .input("planId", sql.BigInt, planId)
    .query(`
      SELECT
        CAST(ui.id AS VARCHAR(36)) AS id,
        ui.serial_pump,
        ui.serial_motor,
        ui.serial_supplier,
        ui.role,
        ui.cycle_no,
        ui.round_no,
        ui.result,
        ui.action AS failure_decision,
        COALESCE(u.full_name, u.employee_code, 'ผู้ตรวจ') AS inspector_name,
        CONVERT(VARCHAR(33), ui.submitted_at, 126) AS completed_at,
        (
          SELECT STRING_AGG(d.name_th, N', ')
            FROM dbo.item_results ir
            JOIN dbo.item_defect_results idr ON idr.item_result_id = ir.id
            JOIN dbo.defects d ON d.id = idr.defect_id
           WHERE ir.unit_inspection_id = ui.id
        ) AS defects_list
      FROM dbo.unit_inspections ui
      LEFT JOIN dbo.users u ON u.id = ui.inspector_id
      WHERE ui.plan_id = @planId
      ORDER BY ui.round_no ASC, ui.cycle_no ASC, ui.started_at ASC
    `);

  const inspectedUnits: ReportUnitItem[] = unitsRes.recordset.map((row) => ({
    id: String(row.id),
    serialPump: String(row.serial_pump ?? "-"),
    serialMotor: String(row.serial_motor ?? "-"),
    serialSupplier: row.serial_supplier ? String(row.serial_supplier) : null,
    role: row.role === "QA" ? "QA" : "QC",
    cycleNo: Number(row.cycle_no ?? 1),
    roundNo: Number(row.round_no ?? 1),
    result: String(row.result ?? "IN_PROGRESS"),
    failureDecision: row.failure_decision ? String(row.failure_decision) : null,
    inspectorName: String(row.inspector_name),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    defectsList: row.defects_list ? String(row.defects_list) : null,
  }));

  // 3. Defect Analysis Breakdown
  const defectsRes = await pool
    .request()
    .input("planId", sql.BigInt, planId)
    .query(`
      SELECT
        d.code AS defect_code,
        d.name_th AS defect_name,
        d.category,
        idr.severity,
        idr.cause_tag,
        idr.disposition_applied,
        ui.role AS discovered_by_role,
        COUNT(DISTINCT ui.id) AS affected_units_count
      FROM dbo.item_defect_results idr
      JOIN dbo.item_results ir ON ir.id = idr.item_result_id
      JOIN dbo.unit_inspections ui ON ui.id = ir.unit_inspection_id
      JOIN dbo.defects d ON d.id = idr.defect_id
      WHERE ui.plan_id = @planId
      GROUP BY d.code, d.name_th, d.category, idr.severity, idr.cause_tag, idr.disposition_applied, ui.role
      ORDER BY COUNT(DISTINCT ui.id) DESC, d.code ASC
    `);

  const lotQty = Number(pRow.lot_qty ?? 1);
  const defectBreakdown: ReportDefectItem[] = defectsRes.recordset.map((row) => ({
    defectCode: String(row.defect_code),
    defectName: String(row.defect_name),
    category: row.category ? String(row.category) : null,
    severity: (["CRITICAL", "MAJOR", "MINOR"].includes(row.severity) ? row.severity : "MAJOR") as "CRITICAL" | "MAJOR" | "MINOR",
    causeTag: row.cause_tag ? (row.cause_tag as "SUPPLIER" | "TRANSPORT" | "INTERNAL" | "UNKNOWN") : null,
    affectedUnitsCount: Number(row.affected_units_count),
    percentOfLot: Number(((Number(row.affected_units_count) / Math.max(lotQty, 1)) * 100).toFixed(1)),
    dispositionApplied: String(row.disposition_applied ?? "REWORK"),
    discoveredByRole: row.discovered_by_role === "QA" ? "QA" : "QC",
  }));

  // 4. Defect Photos & Videos from dbo.media with full inspection context
  const photosRes = await pool
    .request()
    .input("planId", sql.BigInt, planId)
    .query(`
      SELECT TOP (100)
        CAST(m.id AS VARCHAR(36)) AS id,
        CAST(ui.id AS VARCHAR(36)) AS unit_id,
        m.kind,
        ui.role,
        ui.round_no,
        ui.cycle_no,
        ui.serial_pump,
        ui.serial_motor,
        ci.seq AS item_seq,
        ci.topic_code,
        ci.title AS item_title,
        ir.remark AS item_remark,
        COALESCE(d.code, def_info.code) AS defect_code,
        COALESCE(d.name_th, def_info.name_th, N'พบข้อบกพร่อง') AS defect_name,
        COALESCE(m.part, def_info.part, def_info.location_note) AS part,
        COALESCE(def_info.severity, 'MAJOR') AS severity,
        def_info.disposition_applied,
        m.storage_key AS uri,
        m.mime,
        CONVERT(VARCHAR(33), m.captured_at, 126) AS captured_at,
        COALESCE(u.full_name, u.employee_code, N'ผู้ตรวจ') AS inspector_name
      FROM dbo.media m
      JOIN dbo.item_results ir ON ir.id = m.owner_id
      JOIN dbo.unit_inspections ui ON ui.id = ir.unit_inspection_id
      LEFT JOIN dbo.checklist_items ci ON ci.id = ir.item_id
      LEFT JOIN dbo.defects d ON d.id = m.defect_id
      OUTER APPLY (
        SELECT TOP (1)
          d2.code,
          d2.name_th,
          idr2.severity,
          idr2.disposition_applied,
          idf2.part,
          idr2.location_note
        FROM dbo.item_defect_results idr2
        JOIN dbo.defects d2 ON d2.id = idr2.defect_id
        LEFT JOIN dbo.item_defects idf2 ON idf2.id = idr2.item_defect_id
        WHERE (
          idr2.item_result_id = ir.id
          OR (
            ui.parent_inspection_id IS NOT NULL
            AND idr2.item_result_id IN (
              SELECT pir.id
              FROM dbo.item_results pir
              WHERE pir.unit_inspection_id = ui.parent_inspection_id
                AND pir.item_id = ir.item_id
            )
          )
        )
          AND (m.defect_id IS NULL OR idr2.defect_id = m.defect_id)
        ORDER BY
          CASE WHEN idr2.item_result_id = ir.id THEN 0 ELSE 1 END,
          CASE WHEN idr2.defect_id = m.defect_id THEN 0 ELSE 1 END
      ) def_info
      LEFT JOIN dbo.users u ON u.id = m.created_by
      WHERE ui.plan_id = @planId
        AND m.kind IN ('PHOTO', 'VIDEO')
        AND m.status = 'ACTIVE'
      ORDER BY ui.round_no ASC, ui.cycle_no ASC, ci.seq ASC, m.captured_at ASC
    `);

  const modelCodeStr = String(pRow.model_code ?? "-");
  const defectPhotos: ReportPhoto[] = photosRes.recordset.map((row) => ({
    id: String(row.id),
    unitId: row.unit_id ? String(row.unit_id) : undefined,
    kind: row.kind === "VIDEO" ? "VIDEO" : "PHOTO",
    role: row.role === "QA" ? "QA" : "QC",
    roundNo: Number(row.round_no ?? 1),
    cycleNo: Number(row.cycle_no ?? 1),
    modelCode: modelCodeStr,
    serialPump: String(row.serial_pump ?? "-"),
    serialMotor: String(row.serial_motor ?? "-"),
    itemSeq: row.item_seq != null ? Number(row.item_seq) : null,
    topicCode: row.topic_code ? String(row.topic_code) : null,
    itemTitle: row.item_title ? String(row.item_title) : null,
    itemRemark: row.item_remark ? String(row.item_remark) : null,
    defectCode: row.defect_code ? String(row.defect_code) : null,
    defectName: String(row.defect_name),
    part: row.part ? String(row.part) : null,
    severity: (["CRITICAL", "MAJOR", "MINOR"].includes(row.severity) ? row.severity : "MAJOR") as "CRITICAL" | "MAJOR" | "MINOR",
    dispositionApplied: row.disposition_applied ? String(row.disposition_applied) : null,
    uri: String(row.uri),
    mime: String(row.mime ?? (row.kind === "VIDEO" ? "video/mp4" : "image/jpeg")),
    capturedAt: String(row.captured_at),
    inspectorName: String(row.inspector_name),
  }));

  // 5. Calculate QC Metrics
  const qcUnits = inspectedUnits.filter((u) => u.role === "QC" && u.roundNo === 1);
  const totalInspected = qcUnits.length;
  const passCount = qcUnits.filter((u) => u.result === "PASS").length;
  const concessionCount = qcUnits.filter((u) => u.result === "CONCESSION" || u.failureDecision === "CONCESSION").length;
  const reworkCount = qcUnits.filter((u) => u.failureDecision === "REWORK").length;
  const rejectCount = qcUnits.filter((u) => u.failureDecision === "REJECT").length;
  const firstTimePassRate = totalInspected > 0 ? Number(((passCount / totalInspected) * 100).toFixed(1)) : 100;

  // 6. Calculate QA Metrics
  const qaUnits = inspectedUnits.filter((u) => u.role === "QA");
  const qaSampledCount = qaUnits.length;
  const qaPassCount = qaUnits.filter((u) => u.result === "PASS").length;
  const qaRejectCount = qaUnits.filter((u) => u.result === "NOT_PASSED" || u.failureDecision === "REJECT").length;
  const qaRequired = Number(pRow.qa_required ?? 5);

  let qaDecision: "ACCEPT" | "REJECT" | "PENDING" = "PENDING";
  if (qaSampledCount >= qaRequired) {
    qaDecision = qaRejectCount > 0 ? "REJECT" : "ACCEPT";
  } else if (pRow.status === "COMPLETED") {
    qaDecision = qaRejectCount > 0 ? "REJECT" : "ACCEPT";
  }

  // 7. Approvals & Signatures from plan_status_history and inspection creators
  const historyRes = await pool
    .request()
    .input("planId", sql.BigInt, planId)
    .query(`
      SELECT
        psh.to_status,
        CONVERT(VARCHAR(33), psh.at, 126) AS at,
        COALESCE(u.full_name, u.employee_code, 'เจ้าหน้าที่') AS user_name,
        COALESCE(u.employee_code, '') AS employee_code
      FROM dbo.plan_status_history psh
      LEFT JOIN dbo.users u ON u.id = psh.by_user_id
      WHERE psh.plan_id = @planId
      ORDER BY psh.id ASC
    `);

  const primaryQcInspector = inspectedUnits.find((u) => u.role === "QC")?.inspectorName ?? "เจ้าหน้าที่ตรวจสอบ QC";
  const qcReviewEntry = historyRes.recordset.findLast((r) => r.to_status === "QA_PENDING" || r.to_status === "QA_IN_PROGRESS" || r.to_status === "QC_COMPLETED");
  const qaApprovalEntry = historyRes.recordset.findLast((r) => r.to_status === "COMPLETED");

  const approvals: ReportApproval[] = [
    {
      role: "PREPARED_BY",
      title: "ผู้ตรวจสอบคุณภาพ (QC Inspector)",
      name: primaryQcInspector,
      employeeCode: "QC Team",
      signedAt: pRow.created_at,
      status: "APPROVED",
    },
    {
      role: "REVIEWED_BY",
      title: "หัวหน้าฝ่ายควบคุมคุณภาพ (QC Head)",
      name: qcReviewEntry?.user_name ?? "รอการตรวจทาน",
      employeeCode: qcReviewEntry?.employee_code ?? "-",
      signedAt: qcReviewEntry?.at ?? null,
      status: qcReviewEntry ? "APPROVED" : "PENDING",
    },
    {
      role: "APPROVED_BY",
      title: "หัวหน้าฝ่ายประกันคุณภาพ (QA Head)",
      name: qaApprovalEntry?.user_name ?? (qaDecision === "ACCEPT" ? "ฝ่ายประกันคุณภาพ (QA)" : "รอการอนุมัติ"),
      employeeCode: qaApprovalEntry?.employee_code ?? "-",
      signedAt: qaApprovalEntry?.at ?? null,
      status: qaApprovalEntry ? "APPROVED" : qaDecision === "ACCEPT" ? "APPROVED" : "PENDING",
    },
  ];

  return {
    plan: {
      id: Number(pRow.id),
      planNo: String(pRow.plan_no),
      status: String(pRow.status),
      createdAt: String(pRow.created_at),
      updatedAt: String(pRow.updated_at),
      docNo: String(pRow.doc_no ?? "-"),
      docType: String(pRow.doc_type ?? "INVOICE"),
      department: pRow.department ? String(pRow.department) : null,
      vendorName: pRow.vendor_name ? String(pRow.vendor_name) : null,
      vendorCode: pRow.vendor_code ? String(pRow.vendor_code) : null,
      modelCode: String(pRow.model_code),
      modelDescription: pRow.model_desc ? String(pRow.model_desc) : null,
      brandName: String(pRow.brand_name),
      brandGroup: String(pRow.brand_group ?? "OTHER"),
      pumpType: pRow.pump_type ? String(pRow.pump_type) : null,
      lotQty,
      qcRequired: Number(pRow.qc_required),
      qcDoneTotal: Number(pRow.qc_done_total ?? 0),
      qaRequired,
      qaDoneTotal: Number(pRow.qa_done_total ?? 0),
      aqlLevel: String(pRow.aql_level),
      aqlSampleSize: qaRequired,
      aqlAcceptNum: 0,
      aqlRejectNum: 1,
    },
    qcSummary: {
      totalInspected,
      passCount,
      concessionCount,
      reworkCount,
      rejectCount,
      firstTimePassRate,
    },
    qaSummary: {
      totalSampled: qaSampledCount,
      passCount: qaPassCount,
      rejectCount: qaRejectCount,
      decision: qaDecision,
      sampledSerials: qaUnits.map((u) => u.serialPump).filter(Boolean),
    },
    defectBreakdown,
    defectPhotos,
    inspectedUnits,
    approvals,
  };
}

export type ReportFilterParams = {
  q?: string;
  status?: string;
  vendorId?: number;
  modelId?: number;
  limit?: number;
  offset?: number;
};

/**
 * Loads the list of reports across all plans with filtering & search (Screen S15 index /docs/02 FR-RPT-08).
 */
export async function loadReportsList(filters: ReportFilterParams = {}): Promise<ReportsListResponse> {
  const pool = await getPool();

  const whereConditions: string[] = ["1=1"];
  const req = pool.request();

  if (filters.q && filters.q.trim()) {
    const search = `%${filters.q.trim()}%`;
    req.input("search", sql.NVarChar(100), search);
    whereConditions.push(`(
      p.plan_no LIKE @search
      OR rd.doc_no LIKE @search
      OR m.code LIKE @search
      OR EXISTS (
        SELECT 1 FROM dbo.unit_inspections ui
         WHERE ui.plan_id = p.id
           AND (ui.serial_pump LIKE @search OR ui.serial_motor LIKE @search)
      )
    )`);
  }

  if (filters.status && filters.status !== "ALL") {
    if (filters.status === "QA" || filters.status === "QA_IN_PROGRESS") {
      whereConditions.push("p.status IN ('QA_PENDING', 'QA_IN_PROGRESS')");
    } else if (filters.status === "QC" || filters.status === "QC_IN_PROGRESS") {
      whereConditions.push("p.status IN ('ASSIGNED', 'QC_IN_PROGRESS', 'QC_REVIEW')");
    } else {
      req.input("status", sql.VarChar(24), filters.status);
      whereConditions.push("p.status = @status");
    }
  }

  if (filters.vendorId) {
    req.input("vendorId", sql.Int, filters.vendorId);
    whereConditions.push("rd.vendor_id = @vendorId");
  }

  if (filters.modelId) {
    req.input("modelId", sql.Int, filters.modelId);
    whereConditions.push("p.model_id = @modelId");
  }

  const whereClause = whereConditions.join(" AND ");

  // Count metrics for tabs
  const countsRes = await pool.request().query(`
    SELECT
      COUNT(*) AS all_count,
      COUNT(CASE WHEN p.status = 'COMPLETED' THEN 1 END) AS completed_count,
      COUNT(CASE WHEN p.status IN ('QA_PENDING', 'QA_IN_PROGRESS') THEN 1 END) AS qa_pending_count,
      COUNT(CASE WHEN p.status IN ('ASSIGNED', 'QC_IN_PROGRESS', 'QC_REVIEW') THEN 1 END) AS qc_in_progress_count
    FROM dbo.plans p
    LEFT JOIN dbo.receipt_docs rd ON rd.id = p.receipt_doc_id
    LEFT JOIN dbo.models m ON m.id = p.model_id
  `);

  const countsRow = countsRes.recordset[0] ?? {};

  const query = `
    SELECT
      p.id,
      p.plan_no,
      rd.doc_no,
      rd.doc_type,
      v.name AS vendor_name,
      m.code AS model_code,
      b.name AS brand_name,
      pt.name AS pump_type,
      p.lot_qty,
      p.qc_done_total,
      COALESCE(p.qc_required, 0) AS qc_required,
      (
        SELECT COUNT(*)
          FROM dbo.unit_inspections ui
         WHERE ui.plan_id = p.id AND ui.role = 'QA' AND ui.status = 'COMPLETED'
      ) AS qa_done_total,
      COALESCE(p.qa_required, 5) AS qa_required,
      p.status,
      CONVERT(VARCHAR(33), p.created_at, 126) AS created_at,
      DATEDIFF(day, p.created_at, SYSUTCDATETIME()) AS age_days,
      CONVERT(VARCHAR(33), (
        SELECT TOP (1) psh.at
          FROM dbo.plan_status_history psh
         WHERE psh.plan_id = p.id AND psh.to_status IN ('QA_PENDING', 'QA_IN_PROGRESS', 'COMPLETED')
         ORDER BY psh.id DESC
      ), 126) AS qc_completed_at,
      (
        SELECT COUNT(DISTINCT idr.id)
          FROM dbo.unit_inspections ui
          JOIN dbo.item_results ir ON ir.unit_inspection_id = ui.id
          JOIN dbo.item_defect_results idr ON idr.item_result_id = ir.id
         WHERE ui.plan_id = p.id
      ) AS defects_count
    FROM dbo.plans p
    JOIN dbo.models m ON m.id = p.model_id
    JOIN dbo.brands b ON b.id = m.brand_id
    LEFT JOIN dbo.pump_types pt ON pt.id = m.pump_type_id
    LEFT JOIN dbo.receipt_docs rd ON rd.id = p.receipt_doc_id
    LEFT JOIN dbo.vendors v ON v.id = rd.vendor_id
    WHERE ${whereClause}
    ORDER BY p.updated_at DESC
  `;

  const listRes = await req.query(query);

  const reports: ReportsListItem[] = listRes.recordset.map((row) => ({
    id: Number(row.id),
    planNo: String(row.plan_no),
    docNo: String(row.doc_no ?? "-"),
    docType: String(row.doc_type ?? "INVOICE"),
    vendorName: row.vendor_name ? String(row.vendor_name) : null,
    modelCode: String(row.model_code),
    brandName: String(row.brand_name),
    pumpType: row.pump_type ? String(row.pump_type) : null,
    lotQty: Number(row.lot_qty ?? 0),
    qcDoneTotal: Number(row.qc_done_total ?? 0),
    qcRequired: Number(row.qc_required ?? 0),
    qaDoneTotal: Number(row.qa_done_total ?? 0),
    qaRequired: Number(row.qa_required ?? 5),
    status: String(row.status),
    createdAt: String(row.created_at),
    qcCompletedAt: row.qc_completed_at ? String(row.qc_completed_at) : null,
    defectsCount: Number(row.defects_count ?? 0),
    ageDays: Number(row.age_days ?? 0),
  }));

  return {
    reports,
    total: reports.length,
    counts: {
      all: Number(countsRow.all_count ?? 0),
      completed: Number(countsRow.completed_count ?? 0),
      qaPending: Number(countsRow.qa_pending_count ?? 0),
      qcInProgress: Number(countsRow.qc_in_progress_count ?? 0),
    },
  };
}
