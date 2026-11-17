/*
  QCheck — 013: Vendor ของเอกสารรับเข้าเว้นว่างได้  (SQL Server)
  - ผู้ใช้ 23 ต.ค. 2026: ตอนเปิดแผนไม่บังคับ Vendor — คลังแจ้งหัวหน้า QC ทีหลัง แล้วกลับมากรอก/แก้ได้ทุกเมื่อ
    แผนและใบงานทุกใบของเอกสารนั้นใช้ Vendor ของหัวเอกสาร (receipt_docs.vendor_id) จึงเปลี่ยนตามทันที
  - กันเอกสารซ้ำ (BR-01) เปลี่ยนจาก (ประเภท, เลขที่, Vendor) เป็น (ประเภท, เลขที่) — Vendor 2 รายใช้เลข Invoice เดียวกันไม่ได้
  - ถ้ามีเลขเอกสารซ้ำต่าง Vendor อยู่แล้ว จะหยุดพร้อมแจ้ง (ต้องแก้ข้อมูลก่อน) · ไม่แก้ไฟล์ 009 · รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.receipt_docs', N'U') IS NULL
    THROW 51130, '013 needs dbo.receipt_docs (run 009 first).', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.receipt_docs GROUP BY doc_type, doc_no_normalized HAVING COUNT(*) > 1)
    THROW 51131, '013: some Invoice/PO numbers exist under more than one vendor — merge or rename them before running 013.', 1;
GO

IF OBJECT_ID(N'dbo.UQ_receipt_docs_key', N'UQ') IS NOT NULL
    ALTER TABLE dbo.receipt_docs DROP CONSTRAINT UQ_receipt_docs_key;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.receipt_docs') AND name = N'vendor_id' AND is_nullable = 0)
    ALTER TABLE dbo.receipt_docs ALTER COLUMN vendor_id INT NULL;
GO
IF OBJECT_ID(N'dbo.UQ_receipt_docs_doc', N'UQ') IS NULL
    ALTER TABLE dbo.receipt_docs ADD CONSTRAINT UQ_receipt_docs_doc UNIQUE (doc_type, doc_no_normalized);
GO
