/*
  QCheck — 003: ผู้ใช้หน้างาน (LOCAL) + PIN   (DEC-12, docs/12)
  - users.source รับ 'LOCAL' นอกเหนือจาก 'CENTRAL'
  - เพิ่ม pin_hash / pin_set_at / pin_locked_at / created_by (ใช้เฉพาะ LOCAL)
  - ข้อบังคับในฐานข้อมูล: LOCAL ต้องมีรหัสพนักงานแบบ F + ตัวเลข ≥ 4 หลัก (ไม่ชนกับรหัสระบบกลาง TRW####), PIN มีได้เฉพาะ LOCAL
  - บทบาทของ LOCAL จำกัดที่ชั้นแอป (lib/auth/local-users.ts) — user_roles ใช้ตารางเดิม
  - รันซ้ำได้
*/

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 51001, 'dbo.users not found: run 001_users.sql first and make sure you are in the QCheck database.', 1;
GO

IF COL_LENGTH(N'dbo.users', N'pin_hash') IS NULL
    ALTER TABLE dbo.users ADD
        pin_hash       NVARCHAR(200) NULL,        -- scrypt$... (ผสม pepper ฝั่ง server) — ห้าม log
        pin_set_at     DATETIME2(0)  NULL,
        pin_locked_at  DATETIME2(0)  NULL,        -- มีค่า = ถูกล็อก ต้องให้ Admin / QC Head ปลด
        pin_must_change BIT          NOT NULL CONSTRAINT DF_users_pin_must_change DEFAULT (0),  -- PIN ชั่วคราว: ต้องเปลี่ยนก่อนใช้งาน
        nickname       NVARCHAR(100) NULL,        -- ชื่อเล่นที่ใช้เรียกกันหน้างาน
        created_by     BIGINT        NULL,
        updated_by     BIGINT        NULL;      -- มาตรฐาน Master: docs/03 §3.0
GO

IF OBJECT_ID(N'dbo.FK_users_updated_by', N'F') IS NULL
    ALTER TABLE dbo.users ADD CONSTRAINT FK_users_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id);
GO

IF OBJECT_ID(N'dbo.FK_users_created_by', N'F') IS NULL
    ALTER TABLE dbo.users ADD CONSTRAINT FK_users_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id);
GO

IF OBJECT_ID(N'dbo.CK_users_source', N'C') IS NOT NULL
    ALTER TABLE dbo.users DROP CONSTRAINT CK_users_source;
GO

ALTER TABLE dbo.users ADD CONSTRAINT CK_users_source CHECK (source IN ('CENTRAL', 'LOCAL'));
GO

IF OBJECT_ID(N'dbo.CK_users_local_code', N'C') IS NULL
    ALTER TABLE dbo.users ADD CONSTRAINT CK_users_local_code CHECK (
        source <> 'LOCAL' OR (employee_code LIKE 'F[0-9][0-9][0-9][0-9]%' AND employee_code NOT LIKE 'F%[^0-9]%'));
GO

IF OBJECT_ID(N'dbo.CK_users_pin_local_only', N'C') IS NULL
    ALTER TABLE dbo.users ADD CONSTRAINT CK_users_pin_local_only CHECK (source = 'LOCAL' OR pin_hash IS NULL);
GO
