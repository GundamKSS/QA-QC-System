/*
  QCheck — 023: เพิ่มสถานะ 'NA' (Not Applicable) ใน item_results.status (SQL Server)
  - ตามมติที่ประชุม QC: รองรับ 3 ปุ่ม (Pass, NG, N/A) สำหรับหัวข้อที่เครื่องรุ่นนั้นไม่มีชิ้นส่วนดังกล่าว
  - ปรับ CK_item_results_status ให้รองรับ ('NORMAL', 'FAIL', 'NA')
  - รันซ้ำได้ (Idempotent)
*/

IF OBJECT_ID(N'dbo.item_results', N'U') IS NULL
    THROW 52301, '023 needs dbo.item_results (run 017 first).', 1;
GO

IF OBJECT_ID(N'dbo.CK_item_results_status', N'C') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_item_results_status' AND definition LIKE N'%NA%')
    ALTER TABLE dbo.item_results DROP CONSTRAINT CK_item_results_status;
GO

IF OBJECT_ID(N'dbo.CK_item_results_status', N'C') IS NULL
    ALTER TABLE dbo.item_results ADD CONSTRAINT CK_item_results_status
        CHECK (status IN ('NORMAL', 'FAIL', 'NA'));
GO
