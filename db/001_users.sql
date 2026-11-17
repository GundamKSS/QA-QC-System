/*
  QCheck — 001: users + user_roles  (SQL Server)
  Spec: docs/03 §3.1 "ผู้ใช้และอุปกรณ์" · DEC-09 (ระบบกลาง TRW เป็นเจ้าของรหัสผ่านและบทบาท) · DEC-11 (ไม่มี PIN)

  - ไม่เก็บรหัสผ่าน และไม่เก็บ access_token ของระบบกลาง
  - users: สร้าง/อัปเดตอัตโนมัติทุกครั้งที่ login สำเร็จ (upsert ด้วย employee_code)
  - user_roles: snapshot ของ role_prog (PRG003) ตอน login — เขียนทับทั้งชุดทุกครั้ง
  - เวลาทั้งหมดเก็บเป็น UTC (datetime2); แปลงเป็น Asia/Bangkok ที่ชั้นแสดงผล (BR-19)
  - รันซ้ำได้ (idempotent)
  - ฐานข้อมูลสร้าง/เลือกโดย `npm run db:migrate` (scripts/migrate.mjs) — ไฟล์นี้ไม่ใช้ CREATE DATABASE / USE
*/

/* ---------- users ---------- */
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        id               BIGINT         IDENTITY(1,1) NOT NULL,
        employee_code    NVARCHAR(32)   NOT NULL,            -- = employee_no ของระบบกลาง (เช่น TRW1001); เทียบแบบไม่สนตัวพิมพ์
        source           VARCHAR(16)    NOT NULL CONSTRAINT DF_users_source DEFAULT ('CENTRAL'),
        full_name        NVARCHAR(200)  NOT NULL,            -- display_name จากระบบกลาง
        department       NVARCHAR(100)  NULL,
        affiliation      NVARCHAR(100)  NULL,                -- ธีรวัฒน์ / PUMA — ถ้าระบบกลางส่งมา (❓ E9)
        email            NVARCHAR(256)  NULL,                -- ใช้แจ้งเตือนเท่านั้น
        is_active        BIT            NOT NULL CONSTRAINT DF_users_is_active DEFAULT (1),  -- can_use && is_active ล่าสุดจากระบบกลาง
        last_login_at    DATETIME2(0)   NULL,
        roles_synced_at  DATETIME2(0)   NULL,
        created_at       DATETIME2(0)   NOT NULL CONSTRAINT DF_users_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at       DATETIME2(0)   NOT NULL CONSTRAINT DF_users_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_users PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_users_employee_code UNIQUE (employee_code),
        CONSTRAINT CK_users_source CHECK (source IN ('CENTRAL'))
    );
END
GO

/* ---------- user_roles ---------- */
IF OBJECT_ID(N'dbo.user_roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_roles (
        user_id  BIGINT       NOT NULL,
        role     VARCHAR(16)  NOT NULL,
        CONSTRAINT PK_user_roles PRIMARY KEY CLUSTERED (user_id, role),
        CONSTRAINT FK_user_roles_users FOREIGN KEY (user_id) REFERENCES dbo.users (id) ON DELETE CASCADE,
        -- ต้องตรงกับ ROLES ใน src/lib/auth/types.ts (ไม่มี DEV — เป็นแค่สวิตช์ตอนพัฒนา ไม่เก็บลง DB)
        CONSTRAINT CK_user_roles_role CHECK (role IN (
            'ADMIN', 'QC_HEAD', 'QC_INSPECTOR', 'QA_HEAD', 'QA_INSPECTOR',
            'MASTER_ADMIN', 'PURCHASING', 'MANAGEMENT', 'PM'))
    );
    -- หา "ใครมีบทบาทนี้" (แจ้งเตือน/มอบหมายงาน)
    CREATE INDEX IX_user_roles_role ON dbo.user_roles (role) INCLUDE (user_id);
END
GO

/* ---------- ตัวอย่างการใช้ตอน login (ไม่รันตอนสร้าง) ----------
   MERGE dbo.users AS t
   USING (SELECT @employee_code AS employee_code) AS s ON t.employee_code = s.employee_code
   WHEN MATCHED THEN UPDATE SET full_name=@full_name, department=@department, email=@email,
        is_active=1, last_login_at=SYSUTCDATETIME(), roles_synced_at=SYSUTCDATETIME(), updated_at=SYSUTCDATETIME()
   WHEN NOT MATCHED THEN INSERT (employee_code, full_name, department, email, last_login_at, roles_synced_at)
        VALUES (@employee_code, @full_name, @department, @email, SYSUTCDATETIME(), SYSUTCDATETIME());

   DELETE FROM dbo.user_roles WHERE user_id = @user_id;       -- แล้ว INSERT บทบาทชุดใหม่ใน transaction เดียวกัน
*/
