/*
  QCheck — 029: notification_reads (SQL Server)
  Spec: Phase 1 App Shell & Alerts (M10) — Cross-device read state & notification history
  - บันทึกสถานะอ่านแล้วของแจ้งเตือนแยกตามผู้ใช้ในฐานข้อมูล (ซิงก์ข้ามมือถือ/คอม) พร้อมเก็บประวัติแจ้งเตือนที่อ่านแล้ว
  - ไม่แก้ไฟล์ก่อนหน้า · รันซ้ำได้ (idempotent)
*/

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 51029, '029_notification_reads needs dbo.users (run 001_users.sql first).', 1;
GO

IF OBJECT_ID(N'dbo.notification_reads', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.notification_reads (
        id              BIGINT        IDENTITY(1,1) NOT NULL CONSTRAINT PK_notification_reads PRIMARY KEY,
        user_id         BIGINT        NOT NULL CONSTRAINT FK_notification_reads_user FOREIGN KEY REFERENCES dbo.users (id),
        notification_id NVARCHAR(160) NOT NULL,
        wo_no           NVARCHAR(80)  NULL,
        kind            VARCHAR(32)   NOT NULL CONSTRAINT DF_notification_reads_kind DEFAULT ('assigned'),
        title           NVARCHAR(200) NULL,
        body            NVARCHAR(500) NULL,
        href            NVARCHAR(300) NULL,
        status          VARCHAR(20)   NOT NULL CONSTRAINT DF_notification_reads_status DEFAULT ('READ'),
        read_at         DATETIME2(0)  NOT NULL CONSTRAINT DF_notification_reads_read_at DEFAULT (SYSUTCDATETIME()),
        created_at      DATETIME2(0)  NOT NULL CONSTRAINT DF_notification_reads_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at      DATETIME2(0)  NOT NULL CONSTRAINT DF_notification_reads_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_notification_reads_user_notif UNIQUE (user_id, notification_id),
        CONSTRAINT CK_notification_reads_kind CHECK (kind IN ('assigned', 'returned', 'qa_handover')),
        CONSTRAINT CK_notification_reads_status CHECK (status IN ('READ'))
    );
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_notification_reads_user_read_at'
      AND object_id = OBJECT_ID(N'dbo.notification_reads')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_notification_reads_user_read_at
        ON dbo.notification_reads (user_id, read_at DESC)
        INCLUDE (notification_id, wo_no, kind, title, body, href);
END
GO
