/*
  QCheck — 015: เลขที่ผลิต (WO) ของแผนปั๊มผลิตเอง  (SQL Server)
  Spec: docs/03 BR-18 · FR-PLAN-05 (ผู้ใช้ 28 ต.ค. 2026)
  - plans.production_wo_no เก็บเลขที่ผลิตจาก QR สติ๊กเกอร์ (เช่น WO1274/69) แยกไว้อ้างอิงกลับ — Common ID ของแผนยังเป็น plan_no
  - ชื่อไม่ใช้ wo_no เพราะ work_orders.wo_no คือเลขใบงาน (<plan_no>-<seq>) คนละความหมาย
  - แผน PO ใช้เลขเอกสารของ PO นั้น (doc_no_normalized) · แผน Invoice เป็น NULL
  - เติมค่าให้แผน PO ที่เปิดไว้ก่อนหน้า · ไม่แก้ไฟล์ 009 · รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.plans', N'U') IS NULL OR OBJECT_ID(N'dbo.receipt_docs', N'U') IS NULL
    THROW 51150, '015 needs dbo.plans and dbo.receipt_docs (run 009 first).', 1;
GO

IF COL_LENGTH(N'dbo.plans', N'production_wo_no') IS NULL
    ALTER TABLE dbo.plans ADD production_wo_no NVARCHAR(64) NULL;   -- เลขที่ผลิต (WO) ของแผน PO · Invoice = NULL
GO

UPDATE p
   SET p.production_wo_no = d.doc_no_normalized
  FROM dbo.plans p
  JOIN dbo.receipt_docs d ON d.id = p.receipt_doc_id
 WHERE d.doc_type = 'PO' AND p.production_wo_no IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_plans_production_wo_no' AND object_id = OBJECT_ID(N'dbo.plans'))
    CREATE INDEX IX_plans_production_wo_no ON dbo.plans (production_wo_no) WHERE production_wo_no IS NOT NULL;
GO
