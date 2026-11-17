/*
  QCheck — 011: สถานะใบงาน "ไม่สำเร็จ" (FAILED)  (SQL Server)
  - docs/17 §1.5 (ผู้ใช้ยืนยัน 21 ต.ค. 2026): เมื่อตรวจจริงสะสมครบเป้า 10% และเรียกเข้าครบทั้งล็อต
    ใบงาน QC ที่ยังไม่เคยตรวจเลย (qty_done = 0) เปลี่ยนเป็น FAILED อัตโนมัติ — เก็บเป็นประวัติ ไม่นำไปคำนวณ
  - เพิ่ม 'FAILED' ใน CK_work_orders_status (ความยาว 6 ตัว ใส่ VARCHAR(16) จาก 010 ได้)
  - ต้องรัน 010 ก่อน · ไม่แก้ไฟล์ 009/010 · รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.work_orders', N'U') IS NULL
    THROW 51110, '011 needs dbo.work_orders (run 009 and 010 first).', 1;
GO
IF COL_LENGTH(N'dbo.work_orders', N'status') < 16
    THROW 51111, '011 needs work_orders.status VARCHAR(16) (run 010 first).', 1;
GO

IF OBJECT_ID(N'dbo.CK_work_orders_status', N'C') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_work_orders_status' AND definition LIKE N'%FAILED%')
    ALTER TABLE dbo.work_orders DROP CONSTRAINT CK_work_orders_status;
GO
IF OBJECT_ID(N'dbo.CK_work_orders_status', N'C') IS NULL
    ALTER TABLE dbo.work_orders ADD CONSTRAINT CK_work_orders_status
        CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'CLOSED', 'FAILED', 'CANCELLED'));
GO
