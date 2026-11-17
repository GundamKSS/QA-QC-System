/*
  QCheck — 010: แก้ความยาว work_orders.status  (SQL Server)
  - 009 สร้าง status เป็น VARCHAR(10) แต่ค่าตั้งต้น 'IN_PROGRESS' ยาว 11 ตัว → เปิดใบงานไม่ได้
    (error 2628 "String or binary data would be truncated ... column 'status'") — พบ 21 ต.ค. 2026 ตอนลองกับฐานข้อมูลจริง
  - ขยายเป็น VARCHAR(16) เท่ากับ plans.status · ต้องถอด DEFAULT / CHECK ที่อ้างคอลัมน์นี้ก่อน แล้วใส่กลับเหมือนเดิม
  - ไม่แก้ไฟล์ 009 เพราะรันไปแล้ว (checksum ใน schema_migrations) · รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.work_orders', N'U') IS NULL
    THROW 51100, '010 needs dbo.work_orders (run 009 first).', 1;
GO

IF COL_LENGTH(N'dbo.work_orders', N'status') < 16
BEGIN
    IF OBJECT_ID(N'dbo.CK_work_orders_cancel', N'C') IS NOT NULL ALTER TABLE dbo.work_orders DROP CONSTRAINT CK_work_orders_cancel;
    IF OBJECT_ID(N'dbo.CK_work_orders_status', N'C') IS NOT NULL ALTER TABLE dbo.work_orders DROP CONSTRAINT CK_work_orders_status;
    IF OBJECT_ID(N'dbo.DF_work_orders_status', N'D') IS NOT NULL ALTER TABLE dbo.work_orders DROP CONSTRAINT DF_work_orders_status;

    ALTER TABLE dbo.work_orders ALTER COLUMN status VARCHAR(16) NOT NULL;
END
GO

IF OBJECT_ID(N'dbo.DF_work_orders_status', N'D') IS NULL
    ALTER TABLE dbo.work_orders ADD CONSTRAINT DF_work_orders_status DEFAULT ('IN_PROGRESS') FOR status;
GO
IF OBJECT_ID(N'dbo.CK_work_orders_status', N'C') IS NULL
    ALTER TABLE dbo.work_orders ADD CONSTRAINT CK_work_orders_status CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'CLOSED', 'CANCELLED'));
GO
IF OBJECT_ID(N'dbo.CK_work_orders_cancel', N'C') IS NULL
    ALTER TABLE dbo.work_orders ADD CONSTRAINT CK_work_orders_cancel CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL));
GO
