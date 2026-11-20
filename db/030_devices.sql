/*
  QCheck — 030: devices (SQL Server)
  Spec: docs/02 FR-AUTH-05 · docs/03 §3.1 `devices` · docs/10 Pass 7 (เครื่องส่วนกลาง)
  - ทะเบียนอุปกรณ์ส่วนกลางที่ Admin ลงทะเบียน (เก็บเฉพาะ SHA-256 hash ของ device token ไม่เก็บ token ดิบ)
  - รองรับกำหนดเวลา Idle Timeout ต่อเครื่อง (ค่าเริ่มต้น 30 นาที) และปิด/เปิดการใช้งานได้ทันที
  - ไม่แก้ไฟล์ก่อนหน้า · รันซ้ำได้ (idempotent)
*/

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 51030, '030_devices needs dbo.users (run 001_users.sql first).', 1;
GO

IF OBJECT_ID(N'dbo.devices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.devices (
        id            BIGINT        IDENTITY(1,1) NOT NULL CONSTRAINT PK_devices PRIMARY KEY,
        device_code   NVARCHAR(40)  NOT NULL,
        device_name   NVARCHAR(120) NOT NULL,
        location      NVARCHAR(120) NULL,
        device_kind   VARCHAR(16)   NOT NULL CONSTRAINT DF_devices_kind DEFAULT ('shared'),
        idle_minutes  INT           NOT NULL CONSTRAINT DF_devices_idle_minutes DEFAULT (30),
        token_hash    CHAR(64)      NOT NULL,
        last_seen_at  DATETIME2(0)  NULL,
        is_active     BIT           NOT NULL CONSTRAINT DF_devices_is_active DEFAULT (1),
        created_at    DATETIME2(0)  NOT NULL CONSTRAINT DF_devices_created_at DEFAULT (SYSUTCDATETIME()),
        created_by    BIGINT        NULL CONSTRAINT FK_devices_created_by FOREIGN KEY REFERENCES dbo.users (id),
        updated_at    DATETIME2(0)  NOT NULL CONSTRAINT DF_devices_updated_at DEFAULT (SYSUTCDATETIME()),
        updated_by    BIGINT        NULL CONSTRAINT FK_devices_updated_by FOREIGN KEY REFERENCES dbo.users (id),
        CONSTRAINT UQ_devices_code UNIQUE (device_code),
        CONSTRAINT UQ_devices_token_hash UNIQUE (token_hash),
        CONSTRAINT CK_devices_kind CHECK (device_kind IN ('shared', 'personal')),
        CONSTRAINT CK_devices_idle_minutes CHECK (idle_minutes BETWEEN 5 AND 480)
    );
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_devices_active_kind'
      AND object_id = OBJECT_ID(N'dbo.devices')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_devices_active_kind
        ON dbo.devices (is_active, device_kind)
        INCLUDE (device_code, device_name, idle_minutes, last_seen_at);
END
GO
