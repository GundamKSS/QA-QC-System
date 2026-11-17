/*
  QCheck — 002: audit_logs  (SQL Server)
  Spec: docs/03 §3.1 `audit_logs` · FR-AUD-01 (ใคร/ทำแทนใคร/เมื่อไร/อะไร/ค่าเดิม→ใหม่/อุปกรณ์) · FR-AUD-03 (append-only)

  - เพิ่มแถวได้อย่างเดียว: trigger ปฏิเสธ UPDATE/DELETE
    (ผู้มีสิทธิ์ db_owner/sysadmin ยัง DROP trigger ได้ — ควรให้บัญชีของแอปเป็น db_datawriter + db_datareader ไม่ใช่ db_owner)
  - actor_code = รหัสพนักงาน หรือ <unknown:ลายนิ้วมือ> ตอน login ผิด (ยังไม่รู้ตัวผู้ใช้) — ไม่เก็บรหัสผ่านหรือข้อความที่พิมพ์
  - before_json/after_json/detail_json เป็น JSON (ตรวจด้วย ISJSON)
  - เวลาเก็บเป็น UTC (datetime2)
*/

/* ต้องรันในฐานข้อมูล QCheck (ถ้ารันเองใน SSMS/Azure Data Studio ให้ USE QCheck ก่อน; `npm run db:migrate` เลือกให้เอง) */
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 51001, 'dbo.users not found: run 001_users.sql first and make sure you are in the QCheck database.', 1;
GO

IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.audit_logs (
        id               BIGINT         IDENTITY(1,1) NOT NULL,
        [at]             DATETIME2(3)   NOT NULL CONSTRAINT DF_audit_logs_at DEFAULT (SYSUTCDATETIME()),
        [action]         VARCHAR(64)    NOT NULL,             -- เช่น login.success, plan.create
        actor_id         BIGINT         NULL,                 -- users.id เมื่อรู้ตัวผู้ใช้
        actor_code       NVARCHAR(64)   NULL,                 -- employee_code หรือ <unknown:...>
        on_behalf_of_id  BIGINT         NULL,                 -- กรณีหัวหน้าซิงค์แทน
        entity_type      VARCHAR(48)    NULL,
        entity_id        NVARCHAR(64)   NULL,
        before_json      NVARCHAR(MAX)  NULL,
        after_json       NVARCHAR(MAX)  NULL,
        detail_json      NVARCHAR(MAX)  NULL,                 -- ข้อมูลประกอบ (roles ที่ไม่รู้จัก, lockedUntil, reason)
        ip               VARCHAR(64)    NULL,
        user_agent       NVARCHAR(256)  NULL,
        device_id        NVARCHAR(64)   NULL,
        CONSTRAINT PK_audit_logs PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_audit_logs_actor FOREIGN KEY (actor_id) REFERENCES dbo.users (id),
        CONSTRAINT FK_audit_logs_on_behalf FOREIGN KEY (on_behalf_of_id) REFERENCES dbo.users (id),
        CONSTRAINT CK_audit_logs_json CHECK (
            (before_json IS NULL OR ISJSON(before_json) = 1)
            AND (after_json IS NULL OR ISJSON(after_json) = 1)
            AND (detail_json IS NULL OR ISJSON(detail_json) = 1))
    );
    CREATE INDEX IX_audit_logs_at ON dbo.audit_logs ([at] DESC);
    CREATE INDEX IX_audit_logs_entity ON dbo.audit_logs (entity_type, entity_id, [at] DESC);
    CREATE INDEX IX_audit_logs_actor ON dbo.audit_logs (actor_id, [at] DESC);
END
GO

/* append-only: ไม่ให้แก้หรือลบ (CREATE OR ALTER เพื่อให้รันซ้ำได้) */
CREATE OR ALTER TRIGGER dbo.trg_audit_logs_append_only
ON dbo.audit_logs
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51000, 'audit_logs is append-only: UPDATE and DELETE are not allowed.', 1;
END
GO
