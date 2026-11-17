/*
  QCheck — 018: จำนวนตรวจที่มอบหมายรายคน (target_qty) ในใบงาน (SQL Server)
  Spec: docs/16 §4.1 · กำหนดจำนวนรายคน (Head QC จ่ายงานตามยอดเครื่อง)
  - เพิ่ม target_qty ใน dbo.work_order_assignees (จำนวนเครื่องที่ QC แต่ละคนได้รับมอบหมาย)
  - ไม่แก้ไฟล์ 009 · รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.work_order_assignees', N'U') IS NULL
    THROW 51180, '018 needs dbo.work_order_assignees (run 009 first).', 1;
GO

IF COL_LENGTH(N'dbo.work_order_assignees', N'target_qty') IS NULL
    ALTER TABLE dbo.work_order_assignees ADD target_qty INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_work_order_assignees_target_qty')
    ALTER TABLE dbo.work_order_assignees ADD CONSTRAINT CK_work_order_assignees_target_qty CHECK (target_qty IS NULL OR target_qty >= 1);
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_work_order_assignees_slot' AND definition LIKE N'%5%')
    ALTER TABLE dbo.work_order_assignees DROP CONSTRAINT CK_work_order_assignees_slot;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_work_order_assignees_slot')
    ALTER TABLE dbo.work_order_assignees ADD CONSTRAINT CK_work_order_assignees_slot CHECK (slot >= 1);
GO
